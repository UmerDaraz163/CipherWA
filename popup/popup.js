/**
 * Popup: every setting as a persistent switch. The popup never talks to the
 * page to apply a setting; it writes chrome.storage.sync and the content
 * script reacts to the change, so open tabs and a closed popup stay in sync.
 */
(async () => {
  'use strict';

  const { WA_ORIGIN, getSettings, patchSettings, onSettingsChanged, normalizePhone } = CWA_SHARED;
  const $ = (selector) => document.querySelector(selector);

  /** key: setting name; hook: the page hook the feature needs (see injected/page-hooks.js). */
  const TOGGLES = {
    blur: [
      { key: 'blurMessages', label: 'Messages', hint: 'Message bubbles in the open chat' },
      { key: 'blurNames', label: 'Names', hint: 'Contact and group names' },
      { key: 'blurPreviews', label: 'Message previews', hint: 'Last message shown in the chat list' },
      { key: 'blurAvatars', label: 'Profile pictures', hint: 'Contact and group photos' },
      { key: 'blurMedia', label: 'Photos and videos', hint: 'Media thumbnails inside chats' },
      { key: 'revealOnHover', label: 'Reveal on hover', hint: 'Turn off while sharing your screen' },
    ],
    stealth: [
      { key: 'hideTyping', hook: 'typing', label: 'Hide typing indicator', hint: 'Others do not see “typing…” or “recording…”' },
      { key: 'hideReadReceipts', hook: 'read', label: 'Hold back read receipts', hint: 'Opening a chat does not send blue ticks' },
    ],
    tools: [{ key: 'showLauncher', label: 'Show drawer tab', hint: 'Notes, replies and export on the page edge' }],
  };

  const rows = new Map(); // setting key -> { input, warn, hook }
  const template = $('#toggle-row');

  for (const [group, toggles] of Object.entries(TOGGLES)) {
    const container = $(`[data-toggles="${group}"]`);
    for (const { key, label, hint, hook } of toggles) {
      const row = template.content.firstElementChild.cloneNode(true);
      const input = row.querySelector('input');
      row.querySelector('[data-label]').textContent = label;
      row.querySelector('[data-hint]').textContent = hint;
      input.addEventListener('change', () => patchSettings({ [key]: input.checked }));
      rows.set(key, { input, warn: row.querySelector('[data-warn]'), hook });
      container.append(row);
    }
  }

  const strength = $('#blur-strength');
  const countryCode = $('#country-code');

  function render(settings) {
    for (const [key, { input }] of rows) input.checked = Boolean(settings[key]);
    strength.value = settings.blurStrength;
    if (document.activeElement !== countryCode) countryCode.value = settings.defaultCountryCode;
  }

  render(await getSettings());
  onSettingsChanged(render);

  // `change` (on release), not `input`: storage.sync is rate-limited per minute.
  strength.addEventListener('change', () => patchSettings({ blurStrength: Number(strength.value) }));
  countryCode.addEventListener('change', () => {
    countryCode.value = countryCode.value.replace(/\D/g, '');
    patchSettings({ defaultCountryCode: countryCode.value });
  });

  // ---- quick chat ---------------------------------------------------------

  $('#quick-chat').addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = normalizePhone($('#phone').value, countryCode.value);
    $('#phone-error').hidden = Boolean(phone);
    if (!phone) return;
    // The service worker does the tab work: this popup closes as soon as focus moves.
    await chrome.runtime.sendMessage({ type: 'cwa:open-chat', phone });
    window.close();
  });

  // ---- connection status --------------------------------------------------

  const status = $('#status');
  const [tab] = await chrome.tabs.query({ url: `${WA_ORIGIN}/*` });

  if (!tab) {
    status.textContent = 'WhatsApp Web is not open';
    $('#open-wa').hidden = false;
    $('#open-wa').addEventListener('click', () => chrome.tabs.create({ url: WA_ORIGIN }));
    return;
  }

  let page = null;
  try {
    page = await chrome.tabs.sendMessage(tab.id, { type: 'cwa:status' });
  } catch {
    // No content script in that tab (it was open before the extension was installed and injection failed).
  }

  if (!page) {
    status.textContent = 'Reload the WhatsApp Web tab to activate';
    return;
  }
  if (!page.ready) {
    status.textContent = 'Waiting for WhatsApp Web to sign in';
    return;
  }

  const brokenSelectors = Object.values(page.selectors).includes(false);
  status.textContent = brokenSelectors ? 'Active, but the page layout looks unfamiliar' : 'Active on WhatsApp Web';

  $('#open-panel').hidden = false;
  $('#open-panel').addEventListener('click', async () => {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.tabs.sendMessage(tab.id, { type: 'cwa:toggle-panel' });
    window.close();
  });

  // Stealth switches depend on hooks into WhatsApp's own code; say so when one did not attach.
  for (const { warn, hook } of rows.values()) {
    if (!hook || page.hooks.includes(hook)) continue;
    warn.textContent = 'Not available in this WhatsApp Web version';
    warn.hidden = false;
  }
})();
