/**
 * Runs in the page's own JS world ("world": "MAIN"), the only place where
 * WhatsApp Web's modules are reachable. No chrome.* APIs exist here; the
 * content script talks to it through data attributes on <html>.
 *
 * It wraps the client functions that announce "typing…" / "recording…" and
 * that send read receipts. While the matching flag is set the call is dropped;
 * otherwise it passes straight through.
 *
 * EXPERIMENTAL BY NATURE: the module and function names below are WhatsApp
 * internals, not an API. If a build renames them the hook simply does not
 * attach, nothing else breaks, and the popup shows the feature as unavailable.
 */
(() => {
  'use strict';

  if (window.__cipherwaHooks) return; // already installed (extension reloaded into a live tab)
  window.__cipherwaHooks = true;

  const root = document.documentElement;

  const HOOKS = [
    {
      id: 'typing',
      flag: 'data-cwa-hide-typing',
      module: 'WAWebChatStateBridge',
      methods: ['sendChatStateComposing', 'sendChatStateRecording'],
      result: undefined,
    },
    {
      // The two entry points WhatsApp calls when a chat is opened or read.
      // The debounced one calls the other through a closure, not through the
      // export, so both need wrapping. The chat menu's "Mark as read" takes a
      // different path on purpose: it stays the way to send receipts by hand.
      id: 'read',
      flag: 'data-cwa-hide-read',
      module: 'WAWebUpdateUnreadChatAction',
      methods: ['sendSeen', 'sendSeenDebounced'],
      result: undefined,
    },
  ];

  const installed = new Set();

  function wrap(mod, name, hook) {
    const original = mod[name];
    if (typeof original !== 'function') return false;

    const wrapped = function (...args) {
      if (root.hasAttribute(hook.flag)) return Promise.resolve(hook.result);
      return original.apply(this, args);
    };

    try {
      mod[name] = wrapped;
    } catch {
      // Read-only export; try redefining it below.
    }
    if (mod[name] !== wrapped) {
      try {
        Object.defineProperty(mod, name, { value: wrapped, writable: true, configurable: true });
      } catch {
        return false;
      }
    }
    return mod[name] === wrapped;
  }

  function install(hook) {
    let mod;
    try {
      mod = window.require(hook.module);
    } catch {
      return false; // not defined (yet), or renamed in this build
    }
    if (!mod) return false;
    return hook.methods.map((name) => wrap(mod, name, hook)).some(Boolean);
  }

  // The modules only exist once the user is logged in, so wait for the chat
  // list before asking for them, then give up after a bounded number of tries
  // rather than probing the module loader forever.
  const INTERVAL_MS = 1500;
  const MAX_TRIES_AFTER_LOGIN = 20;
  let tries = 0;

  const timer = setInterval(() => {
    if (typeof window.require !== 'function' || !document.getElementById('pane-side')) return;

    for (const hook of HOOKS) {
      if (!installed.has(hook.id) && install(hook)) installed.add(hook.id);
    }
    root.setAttribute('data-cwa-hooks', [...installed].join(' '));

    if (installed.size === HOOKS.length || ++tries >= MAX_TRIES_AFTER_LOGIN) clearInterval(timer);
  }, INTERVAL_MS);
})();
