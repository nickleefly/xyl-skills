# X Bookmarks Plugin

Save X/Twitter content as Markdown without API tokens.

## Project Structure

```
skills/x-bookmarks/
├── SKILL.md                    # Skill definition
├── guide.md                    # This file
├── fetch-tweet.js              # CLI tool — fetch tweets via FxTwitter API
├── filter-bookmarks.js         # Filter bookmark JSON by date (legacy)
├── convert-bookmarks-to-md.js  # Convert bookmark JSON to MD (legacy)
└── extension/                  # Chrome extension for bookmarks/likes scraping
    ├── manifest.json           # Manifest V3
    ├── content.js              # DOM scraper
    ├── background.js           # Service worker (download handler)
    ├── popup.html              # Popup UI
    └── popup.js                # Popup logic
```

## Two Approaches

### 1. CLI (`fetch-tweet.js`)

For fetching specific tweets by URL. Uses FxTwitter API (no auth needed).

```bash
# Single URL
node skills/x-bookmarks/fetch-tweet.js --url https://x.com/user/status/123

# Batch from file
node skills/x-bookmarks/fetch-tweet.js --file urls.txt -o bookmarks.md

# From clipboard
pbpaste | node skills/x-bookmarks/fetch-tweet.js --stdin
```

Features:
- Deduplication by URL (won't re-fetch already saved tweets)
- Append mode (adds to existing output file)
- Error section for failed fetches
- Supports `# comments` and blank lines in URL files

### 2. Chrome Extension

For bulk-fetching from the bookmarks page (`x.com/i/bookmarks`) or likes page.

How to use:
1. Load extension in Chrome (developer mode → load unpacked)
2. Navigate to `x.com/i/bookmarks` or your likes page
3. Click extension icon → "Fetch from this page"
4. The extension scrolls through the page, collects all visible tweets, and downloads a `.md` file

No Native Host or Python installer needed — uses `chrome.downloads` API.

## Development

- `fetch-tweet.js`: Pure Node.js, no dependencies. Edit to change output format.
- `extension/content.js`: DOM selectors depend on X's `data-testid` attributes. May need updates if X changes their UI.
- `extension/background.js`: Handles markdown generation and file download.

## Style Guidelines

- No external dependencies — use Node.js built-in modules only
- Output Markdown follows GitHub Flavored Markdown
- Skill definition follows Claude Code skill format
