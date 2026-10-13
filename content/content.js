/**
 * Content script entry point. Everything before this file only defines
 * things; this wires them together:
 *
 *   storage ──► privacy classes on <html> ──► content.css
 *   MutationObserver hub ──► active-chat detection ──► drawer features
 *   runtime messages (popup / service worker) ──► actions on the page
 */
(async () => {
  'use strict';

  const { SEL, dom, privacy, wa, panel } = CWA;
  const { getSettings, onSettingsChanged } = CWA_SHARED;
  const TEARDOWN = 'cwa:teardown';

  const actions = {
    'cwa:status': () => ({ ready: dom.first(SEL.chatList) !== null, hooks: privacy.activeHooks(), selectors: dom.health() }),
    'cwa:open-chat': ({ phone, text }) => wa.openChat(phone, text),
    'cwa:toggle-panel': () => panel.toggle(),
  };
  const onMessage = (message, _sender, sendResponse) => {
    const action = actions[message?.type];
    if (action) sendResponse(action(message) ?? { ok: true });
  };
  let offSettings = () => {};

  // When the extension is updated or reloaded, the previous copy of this
  // script keeps running in the tab but has lost its chrome.* connection.
  // Tell it to let go before taking over, and listen for the same from a successor.
  document.dispatchEvent(new CustomEvent(TEARDOWN));
  document.addEventListener(
    TEARDOWN,
    () => {
      dom.hub.stop();
      panel.unmount();
      privacy.clear();
      try {
        offSettings();
        chrome.runtime.onMessage.removeListener(onMessage);
      } catch {
        // chrome.* is already gone in an orphaned script; nothing left to detach.
      }
    },
    { once: true },
  );

  // Runs at document_start: classes are on <html> before WhatsApp paints anything.
  privacy.apply(await getSettings());
  offSettings = onSettingsChanged((settings) => {
    privacy.apply(settings);
    panel.setLauncherVisible(settings.showLauncher);
  });
  chrome.runtime.onMessage.addListener(onMessage);

  dom.hub.start();
  wa.start();

  // The drawer and the selector check need the logged-in app, not the QR screen.
  await dom.waitFor(SEL.chatList);
  panel.mount();
  panel.setLauncherVisible((await getSettings()).showLauncher);

  setTimeout(() => {
    for (const [name, ok] of Object.entries(dom.health())) {
      if (!ok) console.warn(`[CipherWA] selector "${name}" matches nothing; WhatsApp Web's markup may have changed.`);
    }
  }, 5000);
})();
