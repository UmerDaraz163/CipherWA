/**
 * Service worker: storage seeding, (re)injection into already-open tabs and
 * message routing. Holds no state of its own: MV3 can stop it at any time.
 */
importScripts('shared/common.js');

const { KEYS, DEFAULT_SETTINGS, DEFAULT_REPLIES, WA_ORIGIN, normalizePhone, buildSendUrl } = CWA_SHARED;
const WA_MATCH = `${WA_ORIGIN}/*`;

chrome.runtime.onInstalled.addListener(async () => {
  await seedStorage();
  await injectIntoOpenTabs();
});

/** Fills in defaults without touching anything the user already set (also runs on update). */
async function seedStorage() {
  const sync = await chrome.storage.sync.get(KEYS.settings);
  await chrome.storage.sync.set({ [KEYS.settings]: { ...DEFAULT_SETTINGS, ...sync[KEYS.settings] } });

  const local = await chrome.storage.local.get(KEYS.replies);
  if (!Array.isArray(local[KEYS.replies])) {
    await chrome.storage.local.set({ [KEYS.replies]: [...DEFAULT_REPLIES] });
  }
}

/**
 * Manifest content scripts only run on navigation, so a tab that was open
 * before install/update would stay bare until reloaded. Replay the manifest's
 * own declarations into it instead.
 */
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: WA_MATCH });
  const scripts = chrome.runtime.getManifest().content_scripts ?? [];

  for (const tab of tabs) {
    const target = { tabId: tab.id };
    try {
      for (const entry of scripts) {
        if (entry.css?.length) await chrome.scripting.insertCSS({ target, files: entry.css });
        if (entry.js?.length) {
          await chrome.scripting.executeScript({ target, files: entry.js, world: entry.world ?? 'ISOLATED' });
        }
      }
    } catch (error) {
      console.warn('[CipherWA] could not inject into tab', tab.id, error);
    }
  }
}

/** Focuses the WhatsApp Web tab and opens the chat there, or opens a new tab when there is none. */
async function openChat({ phone, text }) {
  const number = normalizePhone(phone);
  if (!number) throw new Error('Invalid phone number');

  const url = buildSendUrl(number, text);
  const [tab] = await chrome.tabs.query({ url: WA_MATCH });
  if (!tab) {
    await chrome.tabs.create({ url });
    return;
  }

  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'cwa:open-chat', phone: number, text });
  } catch {
    // No content script answering in that tab; a plain navigation does the same job.
    await chrome.tabs.update(tab.id, { url });
  }
}

const handlers = {
  'cwa:open-chat': openChat,
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;

  Promise.resolve(handler(message)).then(
    () => sendResponse({ ok: true }),
    (error) => sendResponse({ ok: false, error: String(error?.message ?? error) }),
  );
  return true; // keep the channel open for the async response
});
