# CipherWA

A Manifest V3 Chrome extension that adds privacy blur, per-chat notes, canned replies, click-to-chat and CSV export to WhatsApp Web.

Unofficial. Not affiliated with, endorsed by, or sponsored by WhatsApp LLC or Meta.

## Features

| Area | Feature | How it works |
| --- | --- | --- |
| Privacy | Blur messages, names, previews, profile pictures, media | CSS `filter` rules switched by classes on `<html>`; reveal on hover, adjustable strength |
| Privacy (experimental) | Hide "typing…" / "recording…" | Page-world hook around WhatsApp's chat-state functions |
| Privacy (experimental) | Hold back read receipts | Page-world hook around WhatsApp's send-seen functions |
| Productivity | Chat with an unsaved number | Popup field or drawer tab; opens `web.whatsapp.com/send?phone=…` |
| Productivity | Private note per chat | Drawer tab, autosaved to `chrome.storage.local` |
| Productivity | Canned replies | Drawer tab; a click puts the text in the message box, you press send |
| Utility | Export chat list / group members to CSV | Reads what the page displays; downloads a file locally |

Every switch lives in the popup and is stored in `chrome.storage.sync`. Notes and replies stay in `chrome.storage.local`.

## Install locally (Developer Mode)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this folder (the one containing `manifest.json`).
4. Open <https://web.whatsapp.com> and sign in. A violet tab appears on the right edge; the toolbar icon opens the settings popup.

The repository already contains the compiled `popup/popup.css`, so no build step is needed to try it.

After changing code, press the reload arrow on the extension's card. Open WhatsApp tabs are re-injected automatically; reload the tab only if you changed `injected/page-hooks.js` (page-world code cannot be replaced in a live page).

Where to look when debugging:

| What | Where |
| --- | --- |
| Service worker logs | `chrome://extensions` → CipherWA → "service worker" link |
| Content script logs | DevTools on the WhatsApp tab; filter the console by `CipherWA` |
| Popup | Right-click the toolbar icon → Inspect popup |
| Stored data | DevTools → Application → Storage → Extension storage |

## Development

Only the popup stylesheet has a build step (Tailwind CSS v4 CLI). Everything else is plain JavaScript loaded as-is.

```sh
npm install
npm run watch     # rebuild popup/popup.css while editing popup.html / popup.js
npm run build     # one-off minified build
npm run package   # build + dist/cipherwa.zip containing only the files the extension ships
```

`npm run package` uses `rm`, `mkdir` and `zip`, so on Windows run it from WSL or Git Bash.

## Architecture

```
manifest.json
background.js               service worker: seeds storage, re-injects into open tabs, routes "open chat"
shared/common.js            settings schema + storage helpers; loaded by all three contexts
injected/page-hooks.js      MAIN world: wraps WhatsApp's typing / read-receipt functions
content/
  selectors.js              the only place that knows WhatsApp's markup (with content.css)
  dom.js                    fallback queries, element builder, shared MutationObserver hub
  privacy.js                settings → classes / attributes / CSS variable on <html>
  content.css               blur rules, injected at document_start
  whatsapp.js               active chat detection, insert into message box, open chat
  panel.js + panel.css      drawer shell in a shadow root
  features/*.js             one file per drawer tab: notes, replies, quickchat, export
  content.js                entry point: wires the above together
popup/                      settings UI (Tailwind)
icons/
```

How state moves:

```
popup switch ─► chrome.storage.sync ─► storage.onChanged in every WhatsApp tab
                                          │
                                          ├─► html.cwa-blur-* classes ─► content.css blurs
                                          └─► data-cwa-hide-* attributes on <html>
                                                   │  (the DOM is the only thing both JS worlds share)
                                                   ▼
                                       injected/page-hooks.js checks the attribute on every call
```

The popup never messages the page to apply a setting. It writes storage and every context reacts, so there is one source of truth and nothing to keep in sync by hand. Runtime messages are used only for actions: `cwa:open-chat`, `cwa:toggle-panel`, `cwa:status`.

### DOM strategy

WhatsApp Web's class names are generated per build, so nothing here depends on them.

- **Anchors**: ids (`#pane-side`, `#main`), ARIA roles and indices (`[role="listitem"]`, `[role="gridcell"][aria-colindex="2"]`), `dir`, `title`, `data-id`, tag structure. Never `aria-label` text, which is translated per language.
- **Fallback lists**: every entry in `content/selectors.js` is a list tried in order. `content.css` does the same with `:is()` and `:not(:has())`.
- **One observer**: a single `MutationObserver` on the document, coalesced to one pass per animation frame, feeds every feature. Blurring itself needs no JavaScript per element: the CSS is injected at `document_start` and matches rows as WhatsApp creates them, so nothing is painted unblurred first.
- **Reveal on hover** uses inheritance: hovering a chat row, a message bubble or the header sets `--cwa-reveal` on it, and blurred descendants read it. WhatsApp's own `filter` rules are never overridden.
- **Isolation**: the drawer lives in a shadow root appended outside `#app`, so WhatsApp's styles and React do not touch it. Keyboard events are stopped at its edge so WhatsApp's shortcuts do not steal typing.
- **Health check**: after sign-in the content script tests the key anchors and logs a warning (and the popup says "layout looks unfamiliar") when one matches nothing. That is the signal to update `selectors.js` and `content.css`.

### Adding a drawer tab

Create `content/features/yourtab.js`, push `{ id, label, mount(view, ctx), onChatChanged?(chat) }` onto `CWA.features`, and list the file in `manifest.json` before `content/content.js`.

## Known limits

- **Stealth switches depend on WhatsApp internals.** They wrap `WAWebChatStateBridge.sendChatStateComposing/Recording` and `WAWebUpdateUnreadChatAction.sendSeen/sendSeenDebounced`. These names are not an API and can change in any release; when they do, the hook does not attach and the popup marks the switch "Not available in this WhatsApp Web version". Nothing else breaks.
- **Read receipts held back means the chat stays unread** on your side too, because the same call clears the unread badge. "Mark as read" in the chat menu still sends receipts on purpose. WhatsApp's own Settings → Privacy → Read receipts is the supported way to turn them off for good.
- **Exports contain what the page shows.** Saved contacts appear under the name you saved; their numbers are not in the page, so the `phone` column is filled only for unsaved numbers. Group members come from the name line under the group title, which WhatsApp may shorten for very large groups.
- **Notes are keyed by chat id** when the page exposes it (`data-id` on message rows) and by chat title otherwise. A note written in a chat with no messages yet is filed under its title and moved to the id later.
- **Canned replies are inserted, never sent.** There is no bulk or scheduled sending, by design.
