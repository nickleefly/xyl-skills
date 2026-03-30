/**
 * X Fetcher — Popup Script
 */

const $ = (id) => document.getElementById(id);

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isXPage(url) {
  return url && (url.includes('x.com') || url.includes('twitter.com'));
}

function detectPageType(url) {
  if (!url) return 'unknown';
  if (url.includes('/i/bookmarks')) return 'bookmarks';
  if (url.includes('/likes')) return 'likes';
  return 'x-page';
}

// --- Check stored data ---

async function checkStoredData() {
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_STORED_DATA' });
    if (data && data.count) {
      $('downloadCard').style.display = 'block';
      $('downloadInfo').textContent = `${data.count} tweets from ${data.source} ready`;
    }
  } catch {
    // background not ready
  }
}

// --- Init ---

async function init() {
  const tab = await getCurrentTab();
  const dot = $('pageDot');
  const info = $('pageInfo');
  const fetchBtn = $('fetchBtn');

  // Check for stored data first
  await checkStoredData();

  if (!isXPage(tab.url)) {
    dot.className = 'status-dot err';
    info.textContent = 'Not on x.com — open a bookmarks or likes page';
    fetchBtn.disabled = true;
    return;
  }

  const pageType = detectPageType(tab.url);
  if (pageType === 'bookmarks' || pageType === 'likes') {
    dot.className = 'status-dot ok';
    info.textContent = `On ${pageType} page — ready to fetch`;
  } else {
    dot.className = 'status-dot warn';
    info.textContent = 'On x.com but not bookmarks/likes — fetch may not work';
  }

  // Check if content script is running
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { type: 'STATUS' });
    if (status.isRunning) {
      fetchBtn.disabled = true;
      $('stopBtn').style.display = 'block';
      info.textContent = `Fetching... ${status.count} tweets found`;
    }
  } catch {
    // Content script not loaded yet — will inject on fetch
  }
}

// --- Fetch ---

async function startFetch() {
  const tab = await getCurrentTab();
  const maxRounds = parseInt($('maxRounds').value, 10) || 20;

  $('fetchBtn').disabled = true;
  $('result').textContent = 'Fetching tweets...';
  $('error').textContent = '';

  try {
    // Inject content script if needed
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    // Start fetching
    chrome.tabs.sendMessage(tab.id, {
      type: 'START_FETCH',
      maxRounds,
    });

    $('result').textContent = 'Scraping in progress — check page for HUD';
    $('stopBtn').style.display = 'block';

    // Poll for completion every 2s
    startPolling(tab.id);
  } catch (err) {
    $('error').textContent = `Error: ${err.message}`;
    $('fetchBtn').disabled = false;
  }
}

// --- Polling ---

let pollTimer = null;

function startPolling(tabId) {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const status = await chrome.tabs.sendMessage(tabId, { type: 'STATUS' });
      if (!status.isRunning) {
        clearInterval(pollTimer);
        pollTimer = null;
        $('stopBtn').style.display = 'none';
        $('fetchBtn').disabled = false;

        // Check if background has data
        const data = await chrome.runtime.sendMessage({ type: 'GET_STORED_DATA' });
        if (data && data.count) {
          $('result').textContent = `Done! ${data.count} tweets fetched.`;
          $('downloadCard').style.display = 'block';
          $('downloadInfo').textContent = `${data.count} tweets from ${data.source} ready`;
        } else {
          $('result').textContent = 'Fetch complete but no data received.';
        }
      } else {
        $('result').textContent = `Fetching... ${status.count} tweets found`;
      }
    } catch {
      // Tab might have been closed
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 2000);
}

// --- Stop ---

async function stopFetch() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  $('stopBtn').style.display = 'none';
  $('fetchBtn').disabled = false;
  $('result').textContent = 'Stop requested — scroll will stop after current round';
}

// --- Download Markdown ---

async function downloadMarkdown() {
  const data = await chrome.runtime.sendMessage({ type: 'GET_STORED_DATA' });
  if (!data || !data.markdown) {
    $('error').textContent = 'No data to download. Fetch first.';
    return;
  }
  const now = new Date().toISOString().split('T')[0];
  const filename = `x-${data.source}-${now}.md`;
  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(data.markdown);

  chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
}

// --- Download JSON ---

async function downloadJson() {
  const data = await chrome.runtime.sendMessage({ type: 'GET_STORED_DATA' });
  if (!data || !data.tweets) {
    $('error').textContent = 'No data to download. Fetch first.';
    return;
  }
  const json = JSON.stringify(data.tweets, null, 2);
  const now = new Date().toISOString().split('T')[0];
  const filename = `x-${data.source}-${now}.json`;
  const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);

  chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
}

// --- Event Listeners ---

$('fetchBtn').addEventListener('click', startFetch);
$('stopBtn').addEventListener('click', stopFetch);
$('downloadBtn').addEventListener('click', downloadMarkdown);
$('downloadJsonBtn').addEventListener('click', downloadJson);

init();
