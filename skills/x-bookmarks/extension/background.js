/**
 * X Fetcher — Background Service Worker
 *
 * Receives tweet data from content script, stores it, and triggers download.
 */

// --- Stored Data ---

let storedData = null; // { tweets, source, markdown }

// --- Markdown Generation ---

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr.split('T')[0] || dateStr;
  return d.toISOString().split('T')[0];
}

function buildMarkdown(tweets, source) {
  const now = new Date().toISOString().split('T')[0];
  const lines = [
    '# X Bookmarks',
    '',
    `Fetched: ${now}`,
    `Source: ${source}`,
    `Total: ${tweets.length} tweets`,
    '',
    '---',
    '',
  ];

  for (const tweet of tweets) {
    const header = tweet.screenName
      ? `## @${tweet.screenName} — ${formatDate(tweet.createdAt)}`
      : `## Tweet — ${formatDate(tweet.createdAt)}`;
    lines.push(header);
    lines.push('');
    lines.push(escapeMarkdown(tweet.text));
    lines.push('');

    const metrics = [];
    if (tweet.likes) metrics.push(`Likes: ${formatCount(tweet.likes)}`);
    if (tweet.retweets) metrics.push(`Retweets: ${formatCount(tweet.retweets)}`);
    if (tweet.replies) metrics.push(`Replies: ${formatCount(tweet.replies)}`);
    if (tweet.views) metrics.push(`Views: ${formatCount(tweet.views)}`);
    if (metrics.length) lines.push(metrics.join(' | '));

    lines.push(`[View tweet](${tweet.url})`);

    for (const m of tweet.media || []) {
      lines.push('');
      if (m.type === 'image') {
        lines.push(`![image](${m.url})`);
      }
    }

    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// --- Download ---

function triggerDownload(markdown, source) {
  const now = new Date().toISOString().split('T')[0];
  const filename = `x-${source}-${now}.md`;
  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(markdown);

  chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: true,
  });
}

// --- Message Handling ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FETCH_COMPLETE') {
    const { tweets, source } = msg;
    if (!tweets || tweets.length === 0) {
      sendResponse({ success: false, error: 'No tweets found' });
      return;
    }

    const markdown = buildMarkdown(tweets, source);
    storedData = { tweets, source, markdown, count: tweets.length };

    // Auto-download
    triggerDownload(markdown, source);

    sendResponse({ success: true, count: tweets.length });
    return true;
  }

  if (msg.type === 'GET_STORED_DATA') {
    sendResponse(storedData || null);
    return;
  }

  if (msg.type === 'DOWNLOAD_AGAIN') {
    if (storedData) {
      triggerDownload(storedData.markdown, storedData.source);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No data to download' });
    }
    return;
  }
});
