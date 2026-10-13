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

## Publishing to the Chrome Web Store

### Permissions and what to write in the justification fields

| Permission | Why it is requested |
| --- | --- |
| `storage` | Saves the user's switches, notes and canned replies |
| `scripting` | Injects the extension's own bundled files into WhatsApp Web tabs that were already open when it was installed or updated |
| Host `https://web.whatsapp.com/*` | The only site the extension runs on |

`activeTab` is deliberately not requested. With the host permission above it grants nothing extra, and reviewers reject listings for permissions the code does not use. `tabs` is not needed either: querying and messaging tabs on a host you hold permission for works without it.

Answer **No** to "Are you using remote code?". Tailwind is compiled into `popup.css` at build time; there is no CDN script, no `eval`, and no code fetched at runtime.

### Privacy policy and data disclosures

A policy URL is required because the extension handles personal communications and contact details, even though all of it stays on the device. [PRIVACY.md](PRIVACY.md) is a starting text; host it at a public URL and adapt the contact section. In the dashboard's Privacy practices tab:

- Declare **Personally identifiable information** and **Personal communications** as handled, and state they are processed locally only.
- Certify the three Limited Use statements (no sale, no unrelated use, no creditworthiness use).
- Single purpose, for example: "Adds privacy and productivity tools to the WhatsApp Web interface." Keeping every feature tied to that one site is what makes a multi-feature toolkit a single purpose.

If you later add analytics, sync to a server, or any network call, the policy, the disclosures and the store listing all have to change before the release.

### Listing assets

| Asset | Size | Status |
| --- | --- | --- |
| Extension icons | 16, 32, 48, 128 px PNG | In `icons/` (placeholder artwork) |
| Store icon | 128×128 PNG; Google recommends 96×96 artwork with 16 px transparent padding | Rework the placeholder: it currently fills the full square |
| Screenshots | 1280×800 or 640×400, 1 to 5 | To do. Blur or use dummy data: never show real chats |
| Small promo tile | 440×280 | To do |
| Marquee promo tile | 1400×560 | Optional |

### Trademark and brand

Listings are regularly rejected or removed over the WhatsApp brand. To stay clear:

- Keep "WhatsApp" out of the extension **name** and short name. "CipherWA" is fine; "… for WhatsApp" in the title is the usual trigger.
- In the description, use the name only to say what it works with ("for WhatsApp Web"), and keep the non-affiliation sentence.
- No WhatsApp logo, no green speech-bubble look-alike, no WhatsApp green as the brand colour, and no WhatsApp UI chrome in the promo tiles. The violet shield is intentional.
- Do not imply it is an official client or use words like "official", "Plus" or "Pro" next to the brand.

### Things a reviewer, or Meta, may object to

- **The stealth hooks** change how WhatsApp's own client behaves. That is outside WhatsApp's Terms of Service, accounts using unofficial tooling can be restricted, and Meta has had extensions of this kind taken down. It is the highest-risk part of the listing. A store build without it is simple: delete the first `content_scripts` entry and `injected/` from the manifest and remove the "stealth" group from `popup/popup.js`. The switches then have nothing to attach to and everything else works unchanged.
- **Contact export** is fine as a personal backup of your own data. Do not market it as lead generation or scraping; that wording gets listings removed, and bulk-messaging features on top of it would violate both stores' and WhatsApp's rules.
- **Review time**: host permissions plus a MAIN-world script mean an in-depth review. Expect days, not hours, and fill the justification fields completely.

### Before each upload

1. Bump `version` in `manifest.json` (and `package.json`).
2. `npm run package`, then load the unzipped `dist/cipherwa.zip` contents as an unpacked extension once to confirm the package is complete.
3. Test on a signed-in WhatsApp Web session: each blur switch, both stealth switches (with a second account watching), notes across a chat switch, a canned reply, both exports.
4. Upload the zip in the Developer Dashboard.
