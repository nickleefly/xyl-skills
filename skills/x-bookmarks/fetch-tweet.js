#!/usr/bin/env node
/**
 * Fetch tweets via FxTwitter API and save as Markdown.
 * No auth tokens needed — uses the free, public FxTwitter API.
 *
 * Usage:
 *   node fetch-tweet.js --url https://x.com/user/status/123
 *   node fetch-tweet.js --url URL1 --url URL2 --output tweets.md
 *   node fetch-tweet.js --file urls.txt
 *   echo "https://x.com/user/status/123" | node fetch-tweet.js --stdin
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// --- URL Parsing ---

function parseTweetUrl(url) {
  const match = url.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/);
  if (!match) return null;
  return { username: match[1], tweetId: match[2] };
}

function normalizeUrl(url) {
  const parsed = parseTweetUrl(url);
  if (!parsed) return null;
  return `https://x.com/${parsed.username}/status/${parsed.tweetId}`;
}

// --- FxTwitter API ---

function fetchTweetJson(username, tweetId) {
  return new Promise((resolve, reject) => {
    // FxTwitter requires literal "Twitter" as username, not the actual username
    const apiUrl = `https://api.fxtwitter.com/Twitter/status/${tweetId}`;
    const req = https.get(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse FxTwitter response: ${e.message}`));
        }
      });
    });
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

function extractTweetData(apiResponse, originalUrl) {
  if (!apiResponse.tweet) {
    return { url: originalUrl, error: `API returned code ${apiResponse.code}: ${apiResponse.message || 'Unknown'}` };
  }

  const t = apiResponse.tweet;
  const result = {
    url: originalUrl,
    author: t.author?.name || '',
    screenName: t.author?.screen_name || '',
    text: t.text || '',
    likes: t.likes || 0,
    retweets: t.retweets || 0,
    replies: t.replies || 0,
    views: t.views || 0,
    bookmarks: t.bookmarks || 0,
    createdAt: t.created_at || '',
    lang: t.lang || '',
    media: [],
    article: null,
  };

  // Extract media
  const allMedia = t.media?.all || [];
  for (const item of allMedia) {
    if (item.type === 'photo') {
      result.media.push({ type: 'image', url: item.url });
    }
  }
  const videos = t.media?.videos || [];
  for (const video of videos) {
    result.media.push({
      type: 'video',
      url: video.url,
      thumbnail: video.thumbnail_url || '',
      duration: video.duration || 0,
    });
  }

  // Extract article (long-form tweet)
  if (t.article) {
    const blocks = t.article.content?.blocks || [];
    const fullText = blocks.map((b) => b.text || '').filter(Boolean).join('\n\n');
    result.article = {
      title: t.article.title || '',
      text: fullText,
    };
  }

  return result;
}

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
  if (!dateStr) return 'Unknown date';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFileDate(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'unknown';
  return d.toISOString().split('T')[0];
}

function tweetToMarkdown(tweet) {
  const lines = [];
  const header = tweet.screenName
    ? `## @${tweet.screenName} — ${formatFileDate(tweet.createdAt)}`
    : `## Tweet — ${formatFileDate(tweet.createdAt)}`;

  lines.push(header);
  lines.push('');

  // Article or regular text
  if (tweet.article?.text) {
    lines.push(`**${tweet.article.title || 'Article'}**`);
    lines.push('');
    lines.push(escapeMarkdown(tweet.article.text));
  } else {
    lines.push(escapeMarkdown(tweet.text));
  }

  lines.push('');

  // Metrics
  const metrics = [];
  if (tweet.likes) metrics.push(`Likes: ${formatCount(tweet.likes)}`);
  if (tweet.retweets) metrics.push(`Retweets: ${formatCount(tweet.retweets)}`);
  if (tweet.replies) metrics.push(`Replies: ${formatCount(tweet.replies)}`);
  if (tweet.views) metrics.push(`Views: ${formatCount(tweet.views)}`);
  if (tweet.bookmarks) metrics.push(`Bookmarks: ${formatCount(tweet.bookmarks)}`);
  if (metrics.length) lines.push(metrics.join(' | '));

  lines.push(`[View tweet](${tweet.url})`);

  // Media
  for (const m of tweet.media) {
    if (m.type === 'image') {
      lines.push('');
      lines.push(`![image](${m.url})`);
    } else if (m.type === 'video') {
      lines.push('');
      if (m.thumbnail) lines.push(`![video thumbnail](${m.thumbnail})`);
      lines.push(`[Video](${m.url})`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

function buildHeader(source, count) {
  const now = new Date().toISOString().split('T')[0];
  return [
    '# X Bookmarks',
    '',
    `Fetched: ${now}`,
    `Source: ${source}`,
    `Total: ${count} tweets`,
    '',
    '---',
    '',
  ].join('\n');
}

// --- Dedup ---

function readExistingUrls(outputPath) {
  if (!fs.existsSync(outputPath)) return new Set();
  const content = fs.readFileSync(outputPath, 'utf-8');
  const urls = new Set();
  const regex = /\[View tweet\]\((https:\/\/x\.com\/[^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const normalized = normalizeUrl(match[1]);
    if (normalized) urls.add(normalized);
  }
  return urls;
}

// --- CLI Argument Parsing ---

function parseArgs(argv) {
  const result = { urls: [], file: null, stdin: false, output: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url' && argv[i + 1]) {
      result.urls.push(argv[++i]);
    } else if (arg === '--file' && argv[i + 1]) {
      result.file = argv[++i];
    } else if (arg === '--stdin') {
      result.stdin = true;
    } else if ((arg === '-o' || arg === '--output') && argv[i + 1]) {
      result.output = argv[++i];
    } else if (arg === '-h' || arg === '--help') {
      result.help = true;
    }
  }
  return result;
}

function printHelp() {
  console.log(`Fetch tweets via FxTwitter API (no auth needed) and save as Markdown.

Usage:
  node fetch-tweet.js --url <tweet-url>
  node fetch-tweet.js --url URL1 --url URL2
  node fetch-tweet.js --file urls.txt
  echo "https://x.com/user/status/123" | node fetch-tweet.js --stdin

Options:
  --url URL        Tweet URL (can be repeated)
  --file FILE      Read tweet URLs from file (one per line)
  --stdin          Read tweet URLs from stdin
  -o, --output     Output file (default: tweets-YYYY-MM-DD.md)
  -h, --help       Show this help

Examples:
  node fetch-tweet.js --url https://x.com/user/status/123
  node fetch-tweet.js --file bookmarks-urls.txt -o my-bookmarks.md
  pbpaste | node fetch-tweet.js --stdin`);
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Collect URLs from all sources
  const allUrls = [...args.urls];

  if (args.file) {
    if (!fs.existsSync(args.file)) {
      console.error(`Error: File not found: ${args.file}`);
      process.exit(1);
    }
    const fileUrls = fs.readFileSync(args.file, 'utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    allUrls.push(...fileUrls);
  }

  if (args.stdin) {
    const stdinContent = fs.readFileSync('/dev/stdin', 'utf-8');
    const stdinUrls = stdinContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    allUrls.push(...stdinUrls);
  }

  if (allUrls.length === 0) {
    console.error('Error: No URLs provided. Use --url, --file, or --stdin.');
    console.error('Run with --help for usage.');
    process.exit(1);
  }

  // Parse and validate URLs
  const parsedUrls = [];
  for (const raw of allUrls) {
    const parsed = parseTweetUrl(raw);
    if (!parsed) {
      console.error(`Warning: Skipping invalid URL: ${raw}`);
      continue;
    }
    const normalized = normalizeUrl(raw);
    if (normalized && !parsedUrls.find((p) => p.normalized === normalized)) {
      parsedUrls.push({ ...parsed, normalized, raw });
    }
  }

  if (parsedUrls.length === 0) {
    console.error('Error: No valid tweet URLs found.');
    process.exit(1);
  }

  const outputPath = args.output || `tweets-${new Date().toISOString().split('T')[0]}.md`;
  const existingUrls = readExistingUrls(outputPath);

  // Filter out already-fetched URLs
  const newUrls = parsedUrls.filter((p) => !existingUrls.has(p.normalized));
  const skipped = parsedUrls.length - newUrls.length;

  if (skipped > 0) {
    console.error(`Skipping ${skipped} already-fetched tweets (dedup).`);
  }

  if (newUrls.length === 0) {
    console.error('All tweets already fetched. Nothing to do.');
    process.exit(0);
  }

  console.error(`Fetching ${newUrls.length} tweets...`);

  // Fetch tweets
  const results = [];
  for (let i = 0; i < newUrls.length; i++) {
    const { username, tweetId, normalized } = newUrls[i];
    process.stderr.write(`  [${i + 1}/${newUrls.length}] @${username}/${tweetId}...`);
    try {
      const apiResponse = await fetchTweetJson(username, tweetId);
      const tweetData = extractTweetData(apiResponse, normalized);
      results.push(tweetData);
      if (tweetData.error) {
        process.stderr.write(` ERROR: ${tweetData.error}\n`);
      } else {
        process.stderr.write(' OK\n');
      }
    } catch (err) {
      results.push({ url: normalized, error: err.message });
      process.stderr.write(` ERROR: ${err.message}\n`);
    }
  }

  // Build markdown
  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.filter((r) => r.error).length;

  let markdown = '';

  // If file doesn't exist or is empty, add header
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    markdown = buildHeader('urls', successCount);
  }

  // Append tweets
  const tweetSections = results
    .filter((r) => !r.error)
    .map((t) => tweetToMarkdown(t))
    .join('\n');

  // Error section
  const errorTweets = results.filter((r) => r.error);
  let errorSection = '';
  if (errorTweets.length > 0) {
    errorSection = '\n## Failed Fetches\n\n';
    for (const e of errorTweets) {
      errorSection += `- [${e.url}](${e.url}) — ${e.error}\n`;
    }
    errorSection += '\n---\n\n';
  }

  const output = markdown + tweetSections + errorSection;

  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    // Append to existing file
    fs.appendFileSync(outputPath, '\n' + tweetSections + errorSection, 'utf-8');
  } else {
    fs.writeFileSync(outputPath, output, 'utf-8');
  }

  console.error(`\nDone: ${successCount} fetched, ${errorCount} errors, ${skipped} skipped (dedup).`);
  console.error(`Output: ${outputPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
