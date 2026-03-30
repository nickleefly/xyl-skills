---
name: x-bookmarks
description: Fetch and save X/Twitter bookmarks, likes, and individual tweets as Markdown. No auth tokens needed. Use when asked to save, fetch, or export content from X/Twitter.
---

# X Bookmarks Fetcher

Save X/Twitter content as Markdown without API tokens or session cookies.

## Components

| Tool | Purpose |
|------|---------|
| `fetch-tweet.js` | CLI — fetch individual tweets by URL via FxTwitter API |
| `extension/` | Chrome extension — scrape bookmarks/likes pages from DOM |
| `filter-bookmarks.js` | Filter bookmark JSON by date (legacy) |
| `convert-bookmarks-to-md.js` | Convert bookmark JSON to MD (legacy, for bird CLI users) |

## Quick Start

### Fetch individual tweets (CLI)

```bash
# Single tweet
node skills/x-bookmarks/fetch-tweet.js --url https://x.com/user/status/123

# Multiple tweets
node skills/x-bookmarks/fetch-tweet.js --url URL1 --url URL2 -o my-bookmarks.md

# From a file of URLs (one per line, # comments supported)
node skills/x-bookmarks/fetch-tweet.js --file urls.txt

# From stdin (pipe)
pbpaste | node skills/x-bookmarks/fetch-tweet.js --stdin

# Custom output file
node skills/x-bookmarks/fetch-tweet.js --url URL -o weekly-digest.md
```

### Fetch bookmarks/likes page (Chrome Extension)

1. Open `chrome://extensions` → enable Developer Mode
2. Click "Load unpacked" → select `skills/x-bookmarks/extension/`
3. Navigate to `x.com/i/bookmarks` or your likes page
4. Click the extension icon → "Fetch from this page"
5. A `.md` file will be downloaded automatically

## How It Works

- **CLI**: Uses [FxTwitter API](https://docs.fxtwitter.com/) — a free, public, no-auth API that returns tweet data in JSON format
- **Extension**: Scrapes tweets from the DOM on x.com using `data-testid` selectors, then downloads via Chrome's `chrome.downloads` API
- **No tokens, no cookies, no account freeze risk**

## Output Format

```markdown
# X Bookmarks

Fetched: 2026-03-30
Source: bookmarks | likes | urls
Total: 42 tweets

---
## @username — 2026-03-30

Tweet text here...

Likes: 42 | Retweets: 10 | Replies: 5 | Views: 12K
[View tweet](https://x.com/user/status/123)

![image](https://pbs.twimg.com/...)

---
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Tweet returns 404 | Tweet may be deleted, private, or from a suspended account |
| Extension can't find tweets | X may have changed their DOM structure — check `data-testid` selectors |
| Rate limited | Wait a few minutes and retry |
| Extension HUD not showing | Reload the extension in chrome://extensions |
