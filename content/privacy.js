/**
 * Privacy state → DOM. Settings become classes / attributes / one CSS variable
 * on <html>; content.css does the blurring and injected/page-hooks.js reads
 * the data attributes from the page's own JS world.
 */
(() => {
  'use strict';

  const CLASSES = {
    blurMessages: 'cwa-blur-messages',
    blurNames: 'cwa-blur-names',
    blurPreviews: 'cwa-blur-previews',
    blurAvatars: 'cwa-blur-avatars',
    blurMedia: 'cwa-blur-media',
    revealOnHover: 'cwa-reveal',
  };

  // Content scripts and the page share the DOM but not JS objects, so these
  // attributes are the whole "protocol" between the two worlds.
  const PAGE_FLAGS = {
    hideTyping: 'data-cwa-hide-typing',
    hideReadReceipts: 'data-cwa-hide-read',
  };

  const BLUR_VAR = '--cwa-blur';
  const root = document.documentElement;
  let current = null;
  let guard = null;

  function render() {
    for (const [key, cls] of Object.entries(CLASSES)) {
      const on = Boolean(current?.[key]);
      // Only touch the DOM on a real change, or the guard below would loop on itself.
      if (root.classList.contains(cls) !== on) root.classList.toggle(cls, on);
    }
    for (const [key, attr] of Object.entries(PAGE_FLAGS)) {
      const on = Boolean(current?.[key]);
      if (root.hasAttribute(attr) !== on) root.toggleAttribute(attr, on);
    }
    const blur = current ? `${Math.min(20, Math.max(2, Number(current.blurStrength) || 6))}px` : '';
    if (root.style.getPropertyValue(BLUR_VAR) !== blur) {
      if (blur) root.style.setProperty(BLUR_VAR, blur);
      else root.style.removeProperty(BLUR_VAR);
    }
  }

  function apply(settings) {
    current = settings;
    render();
    if (!guard) {
      // The app owns <html> and may rewrite its class/style (theme switches); put ours back.
      guard = new MutationObserver(render);
      guard.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
    }
  }

  function clear() {
    guard?.disconnect();
    guard = null;
    current = null;
    render();
  }

  /** Which page-world hooks actually attached (reported by injected/page-hooks.js). */
  function activeHooks() {
    return (root.getAttribute('data-cwa-hooks') ?? '').split(' ').filter(Boolean);
  }

  CWA.privacy = { apply, clear, activeHooks };
})();
