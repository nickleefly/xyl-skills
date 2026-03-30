/**
 * X Fetcher — Content Script
 *
 * Scrapes tweets from x.com DOM on bookmarks and likes pages.
 * Uses scroll-to-load pattern to collect all visible tweets.
 */

(function () {
  'use strict';

  const SCROLL_DELAY_MS = 1200;
  const MAX_IDLE_ROUNDS = 3;
  const DEFAULT_MAX_ROUNDS = 20;

  // --- State ---

  let isRunning = false;
  let collected = new Map(); // url -> tweet data
  let stats = { rounds: 0, saved: 0, deduped: 0, idle: 0 };

  // --- HUD ---

  function createHUD() {
    let hud = document.getElementById('x-fetcher-hud');
    if (hud) return hud;

    hud = document.createElement('div');
    hud.id = 'x-fetcher-hud';
    hud.style.cssText = `
      position: fixed; top: 12px; right: 12px; z-index: 99999;
      background: #1d9bf0; color: white; padding: 12px 16px;
      border-radius: 8px; font: 13px/1.5 system-ui, sans-serif;
      box-shadow: 0 2px 12px rgba(0,0,0,0.3); min-width: 220px;
    `;
    hud.innerHTML = '<b>X Fetcher</b><br><span id="x-fetcher-status">Starting...</span>';
    document.body.appendChild(hud);
    return hud;
  }

  function updateHUD(text) {
    const el = document.getElementById('x-fetcher-status');
    if (el) el.textContent = text;
  }

  function removeHUD() {
    const hud = document.getElementById('x-fetcher-hud');
    if (hud) hud.remove();
  }

  // --- Toast ---

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bg = type === 'success' ? '#00ba7c' : type === 'error' ? '#f4212e' : '#1d9bf0';
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      background: ${bg}; color: white; padding: 10px 16px;
      border-radius: 8px; font: 13px/1.4 system-ui, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3); max-width: 300px;
      transition: opacity 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- DOM Extraction ---

  function findClosestTestId(el, testId) {
    let current = el;
    while (current && current !== document.body) {
      if (current.getAttribute?.('data-testid') === testId) return current;
      current = current.parentElement;
    }
    return null;
  }

  function extractTweetFromArticle(article) {
    const data = {};

    // URL — prefer timestamp link
    const statusLinks = article.querySelectorAll('a[href*="/status/"]');
    const quoteTweet = article.querySelector('[data-testid="quoteTweet"]');
    let bestLink = null;
    for (const link of statusLinks) {
      if (quoteTweet?.contains(link)) continue;
      if (link.querySelector('time')) { bestLink = link; break; }
    }
    if (!bestLink) {
      for (const link of statusLinks) {
        if (quoteTweet?.contains(link)) continue;
        bestLink = link; break;
      }
    }
    if (bestLink) {
      const match = bestLink.href.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/);
      if (match) {
        data.url = `https://x.com/${match[1]}/status/${match[2]}`;
        data.screenName = match[1];
      }
    }
    if (!data.url) return null;

    // Author name
    const userEl = article.querySelector('[data-testid="User-Name"]');
    if (userEl) {
      const nameEl = userEl.querySelector('span');
      if (nameEl) data.author = nameEl.textContent.trim();
    }

    // Text
    const textEl = article.querySelector('[data-testid="tweetText"]');
    data.text = textEl ? textEl.innerText.trim() : '';

    // Date
    const timeEl = article.querySelector('time');
    data.createdAt = timeEl ? timeEl.getAttribute('datetime') : '';

    // Metrics
    const group = article.querySelector('[role="group"]');
    if (group) {
      data.likes = extractCount(group.querySelector('[data-testid="like"]'));
      data.retweets = extractCount(group.querySelector('[data-testid="retweet"]'));
      data.replies = extractCount(group.querySelector('[data-testid="reply"]'));
    }
    const analyticsLink = article.querySelector('a[href*="/analytics"]');
    if (analyticsLink) {
      data.views = parseMetricText(analyticsLink.getAttribute('aria-label') || '');
    }

    // Media
    data.media = [];
    const images = article.querySelectorAll('[data-testid="tweetPhoto"] img');
    for (const img of images) {
      const src = img.src;
      if (src && !src.includes('profile_images')) {
        data.media.push({ type: 'image', url: src });
      }
    }

    return data;
  }

  function extractCount(el) {
    if (!el) return 0;
    const label = el.getAttribute('aria-label') || '';
    return parseMetricText(label);
  }

  function parseMetricText(text) {
    if (!text) return 0;
    const match = text.match(/([\d,]+\.?\d*[KkMm]?)/);
    if (!match) return 0;
    let num = match[1].replace(/,/g, '');
    const lower = num.toLowerCase();
    if (lower.endsWith('k')) num = String(parseFloat(num) * 1000);
    else if (lower.endsWith('m')) num = String(parseFloat(num) * 1000000);
    return parseInt(num, 10) || 0;
  }

  // --- Scroll + Collect ---

  function scrollToTop() {
    window.scrollTo(0, 0);
    return new Promise((r) => setTimeout(r, 800));
  }

  function scrollToBottom() {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));
  }

  function collectVisibleTweets() {
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    let newCount = 0;
    for (const article of articles) {
      const data = extractTweetFromArticle(article);
      if (!data || !data.url) continue;
      if (collected.has(data.url)) continue;
      collected.set(data.url, data);
      newCount++;
    }
    return newCount;
  }

  async function runFetch(maxRounds) {
    if (isRunning) {
      showToast('Already running!', 'error');
      return;
    }

    isRunning = true;
    collected.clear();
    stats = { rounds: 0, saved: 0, deduped: 0, idle: 0 };

    createHUD();
    await scrollToTop();

    let consecutiveIdle = 0;
    for (let round = 0; round < maxRounds; round++) {
      const newCount = collectVisibleTweets();
      stats.rounds = round + 1;

      if (newCount === 0) {
        consecutiveIdle++;
      } else {
        consecutiveIdle = 0;
        stats.saved += newCount;
      }

      updateHUD(`Round ${round + 1}/${maxRounds} | ${collected.size} tweets found`);

      if (consecutiveIdle >= MAX_IDLE_ROUNDS) {
        updateHUD(`Done: ${collected.size} tweets (idle stop)`);
        break;
      }

      await scrollToBottom();
    }

    const tweets = Array.from(collected.values());
    chrome.runtime.sendMessage({
      type: 'FETCH_COMPLETE',
      tweets,
      source: detectSource(),
    });

    isRunning = false;
    setTimeout(removeHUD, 2000);
  }

  function detectSource() {
    const p = window.location.pathname;
    if (p.includes('/bookmarks')) return 'bookmarks';
    if (p.includes('/likes')) return 'likes';
    return 'page';
  }

  // --- Message Handling ---

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'START_FETCH') {
      runFetch(msg.maxRounds || DEFAULT_MAX_ROUNDS);
    }
    if (msg.type === 'STATUS') {
      return Promise.resolve({
        isRunning,
        count: collected.size,
        rounds: stats.rounds,
        pathname: window.location.pathname,
      });
    }
  });
})();
