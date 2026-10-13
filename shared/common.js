/**
 * Shared schema and storage helpers.
 *
 * A classic script on purpose: the same file is loaded by the service worker
 * (importScripts), the popup (<script>) and the content scripts (manifest),
 * and content scripts cannot use static ES module imports.
 */
(function (root) {
  'use strict';

  const WA_ORIGIN = 'https://web.whatsapp.com';

  /** Synced across the user's browsers. Add a key here and it gets a default everywhere. */
  const DEFAULT_SETTINGS = Object.freeze({
    blurMessages: false,
    blurNames: false,
    blurPreviews: false,
    blurAvatars: false,
    blurMedia: false,
    revealOnHover: true,
    blurStrength: 6,
    hideTyping: false,
    hideReadReceipts: false,
    showLauncher: true,
    defaultCountryCode: '',
  });

  const DEFAULT_REPLIES = Object.freeze([
    { id: 'default-1', title: 'On my way', text: "On my way, I'll be there shortly." },
    { id: 'default-2', title: 'Call you back', text: "Can't talk right now. I'll call you back as soon as I'm free." },
    { id: 'default-3', title: 'Thanks', text: 'Thanks for reaching out! I’ll get back to you soon.' },
  ]);

  const KEYS = Object.freeze({ settings: 'settings', replies: 'replies', notePrefix: 'note:' });

  // ---- settings (chrome.storage.sync) ------------------------------------

  async function getSettings() {
    const stored = (await chrome.storage.sync.get(KEYS.settings))[KEYS.settings];
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async function patchSettings(patch) {
    const next = { ...(await getSettings()), ...patch };
    await chrome.storage.sync.set({ [KEYS.settings]: next });
    return next;
  }

  /** Calls `fn(settings)` whenever any context changes them. Returns an unsubscribe function. */
  function onSettingsChanged(fn) {
    const listener = (changes, area) => {
      if (area !== 'sync' || !changes[KEYS.settings]) return;
      fn({ ...DEFAULT_SETTINGS, ...changes[KEYS.settings].newValue });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }

  // ---- canned replies (chrome.storage.local) -----------------------------

  const replies = {
    async get() {
      const stored = (await chrome.storage.local.get(KEYS.replies))[KEYS.replies];
      return Array.isArray(stored) ? stored : [...DEFAULT_REPLIES];
    },
    set(list) {
      return chrome.storage.local.set({ [KEYS.replies]: list });
    },
  };

  // ---- per-chat notes (chrome.storage.local, one key per chat) -----------

  /** Most stable identity first: the chat id when the DOM exposes it, the title otherwise. */
  function noteKeys(chat) {
    const keys = [];
    if (chat.jid) keys.push(`${KEYS.notePrefix}jid:${chat.jid}`);
    keys.push(`${KEYS.notePrefix}title:${chat.title}`);
    return keys;
  }

  const notes = {
    async load(chat) {
      const keys = noteKeys(chat);
      const found = await chrome.storage.local.get(keys);
      const hit = keys.find((key) => found[key]);
      if (hit && hit !== keys[0]) {
        // Written before this chat's id was known; move it under the stable key.
        await chrome.storage.local.set({ [keys[0]]: found[hit] });
        await chrome.storage.local.remove(hit);
      }
      return { key: keys[0], text: hit ? found[hit].text : '' };
    },
    save(key, text, title) {
      if (!text.trim()) return chrome.storage.local.remove(key);
      return chrome.storage.local.set({ [key]: { text, title, updatedAt: Date.now() } });
    },
  };

  // ---- phone numbers -----------------------------------------------------

  /**
   * Returns the number as international digits without "+" (the wa.me format),
   * or null when it cannot be a valid E.164 number.
   * A national number with a leading 0 is completed with `countryCode` when given.
   */
  function normalizePhone(raw, countryCode = '') {
    let digits = String(raw ?? '').replace(/\D/g, '');
    const cc = String(countryCode).replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0') && cc) digits = cc + digits.slice(1);
    return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
  }

  function buildSendUrl(phone, text) {
    const url = new URL('/send', WA_ORIGIN);
    url.searchParams.set('phone', phone);
    if (text) url.searchParams.set('text', text);
    return url.href;
  }

  root.CWA_SHARED = Object.freeze({
    WA_ORIGIN,
    KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_REPLIES,
    getSettings,
    patchSettings,
    onSettingsChanged,
    replies,
    notes,
    normalizePhone,
    buildSendUrl,
  });
})(globalThis);
