# Link Cleaner for Chrome

A local-first Manifest V3 Chrome extension that removes tracking parameters and unnecessary URL data. Its default cleaning mode is deliberately conservative: recognised tracking parameters are removed while unfamiliar search, filter, and application parameters are retained. An optional strict mode follows the more aggressive allow-list approach used by [linkcleaner.app](https://linkcleaner.app/).

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** in the top-right corner.
3. Select **Load unpacked**.
4. Choose this `link-cleaner-extension` folder.
5. Pin **Link Cleaner** from Chrome's extensions menu for one-click access.

No build or package installation is required.

## What it does

- Cleans the active tab or any pasted URL.
- Preserves required parameters for YouTube, Google Play, Facebook stories, Webtoon, Reddit media, and other known sites.
- Shortens Amazon, Best Buy, and Walmart product links.
- Unwraps known Facebook, Google, href.li, and BusinessWire redirect links.
- Preserves unfamiliar parameters by default so search and filter links keep working.
- Supports bulk cleaning, local recent history, right-click link cleaning, and `Alt+Shift+C` to clean and copy the active tab.
- Offers optional YouTube, YouTube Music, X/Twitter, Bluesky, Amazon affiliate, page-anchor, and custom-parameter settings.

## Permissions

- **Active tab**: read or replace the current page only after you invoke the extension.
- **Clipboard read/write**: support the Paste and Copy buttons.
- **Context menus**: add “Copy clean link” when you right-click a link or page.
- **Offscreen**: write to the clipboard after a context-menu or keyboard-shortcut action; it is not used to display or collect content.
- **Storage**: save settings and, when enabled, up to 20 recent cleaned links locally.

The extension does not request access to all websites, send analytics, or transmit cleaned links.

## Development checks

```bash
npm test
npm run check
```

## Attribution

The site-specific cleaning strategy and compatibility list are informed by the MIT-licensed [Link Cleaner JS](https://github.com/corbindavenport/link-cleaner-js) project by Corbin Davenport. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
