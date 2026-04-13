# XYL Claude Skills

Collection of Claude Code skills for X/Twitter bookmarks export and Substack publishing.

## Installation

### Quick Install (Recommended)

#### use [skills](https://github.com/vercel-labs/skills) add
```
npx skills add nickleefly/xyl-skills
```

In Claude Code, register the marketplace first:

```bash
/plugin marketplace add nickleefly/xyl-skills
```

Then install the plugin:

```bash
/plugin install x-bookmarks@xyl-skills
```

### Verify Installation

Check that skills appear:

```bash
/help
```

## Available Skills

### Content Skills

| Skill | Description | Command |
|-------|-------------|---------|
| [x-bookmarks](skills/x-bookmarks/SKILL.md) | Export X/Twitter bookmarks to markdown via Chrome extension | `/x-bookmarks` |

#### x-bookmarks

Export X/Twitter bookmarks to markdown format.

```bash
/x-bookmarks
```

Prerequisites:
1. Install the **X Fetcher** Chrome extension from `skills/x-bookmarks/extension/`
   - Open `chrome://extensions/`, enable Developer mode, click "Load unpacked", and select the `extension/` folder
2. Log into [x.com](https://x.com) in your browser
3. Navigate to your [bookmarks page](https://x.com/i/bookmarks), click the X Fetcher extension icon, and export your bookmarks as a `.md` file
4. Use `/x-bookmarks` in Claude Code to process the downloaded file

## License

MIT
