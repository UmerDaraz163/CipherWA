/**
 * The injected tools drawer: a launcher tab on the right edge and a slide-in
 * panel with one tab per registered feature (CWA.features).
 *
 * It lives in a shadow root attached outside WhatsApp's #app, so WhatsApp's
 * styles cannot leak in, ours cannot leak out, and React never touches it.
 */
(() => {
  'use strict';

  const { dom, wa } = CWA;
  const { h, svg } = dom;

  const HOST_ID = 'cwa-root';
  const ICON_SHIELD = 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z';
  const ICON_CLOSE = 'M6 6l12 12M18 6L6 18';
  // Keyboard/clipboard events must not bubble out of the drawer: WhatsApp has
  // page-wide shortcuts and would pull typing into its own message box.
  const CONTAINED_EVENTS = ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'paste', 'copy', 'cut'];

  const tabs = new Map(); // feature id -> { feature, button, view }
  let host = null;
  let root = null;
  let launcher = null;
  let toastEl = null;
  let toastTimer = 0;
  let unsubscribe = [];

  const ctx = {
    toast,
    close: () => setOpen(false),
    /** Dot on the launcher, e.g. "this chat has a note". */
    setBadge: (on) => launcher?.classList.toggle('has-badge', Boolean(on)),
  };

  function toast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
  }

  function isOpen() {
    return Boolean(root?.classList.contains('open'));
  }

  function setOpen(open) {
    if (!root) return;
    root.classList.toggle('open', open);
    launcher.setAttribute('aria-expanded', String(open));
    if (open) syncTheme();
  }

  function select(id) {
    for (const [tabId, tab] of tabs) {
      const selected = tabId === id;
      tab.button.setAttribute('aria-selected', String(selected));
      tab.view.hidden = !selected;
      if (selected) tab.feature.onShow?.();
    }
  }

  /** Follow WhatsApp's own light/dark switch rather than the OS setting. */
  function syncTheme() {
    if (!host) return;
    const dark = document.body?.classList.contains('dark') ?? matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = dark ? 'dark' : 'light';
    if (host.dataset.theme !== theme) host.dataset.theme = theme;
  }

  function mount() {
    document.getElementById(HOST_ID)?.remove(); // left behind by a previous, reloaded instance

    host = h('div', { id: HOST_ID });
    const shadow = host.attachShadow({ mode: 'open' });

    const tabList = h('div', { class: 'tabs', role: 'tablist' });
    const views = h('div', { class: 'views' });
    for (const feature of CWA.features) {
      const button = h('button', { type: 'button', role: 'tab', onclick: () => select(feature.id) }, feature.label);
      const view = h('section', { class: 'view', role: 'tabpanel', hidden: true });
      feature.mount(view, ctx);
      tabs.set(feature.id, { feature, button, view });
      tabList.append(button);
      views.append(view);
    }

    launcher = h(
      'button',
      {
        class: 'launcher',
        type: 'button',
        title: 'CipherWA tools',
        'aria-label': 'CipherWA tools',
        'aria-expanded': 'false',
        onclick: () => setOpen(!isOpen()),
      },
      svg(ICON_SHIELD),
      h('span', { class: 'badge' }),
    );

    toastEl = h('div', { class: 'toast', role: 'status', hidden: true });

    const drawer = h(
      'aside',
      { class: 'drawer', 'aria-label': 'CipherWA tools' },
      h(
        'header',
        {},
        h('strong', {}, 'CipherWA'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => setOpen(false) }, svg(ICON_CLOSE)),
      ),
      tabList,
      views,
      toastEl,
    );

    // Hidden until the stylesheet arrives, so the drawer never flashes unstyled.
    root = h('div', { class: 'root', hidden: true }, launcher, drawer);
    const styles = h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('content/panel.css') });
    styles.addEventListener('load', () => (root.hidden = false));

    for (const type of CONTAINED_EVENTS) root.addEventListener(type, (event) => event.stopPropagation());
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });

    shadow.append(styles, root);
    document.documentElement.append(host);

    select(CWA.features[0]?.id);
    syncTheme();

    const notifyChat = (chat) => {
      for (const { feature } of tabs.values()) feature.onChatChanged?.(chat);
    };
    unsubscribe = [wa.onChatChanged(notifyChat), dom.hub.on(syncTheme)];
    notifyChat(wa.getActiveChat());
  }

  function unmount() {
    for (const off of unsubscribe) off();
    unsubscribe = [];
    tabs.clear();
    host?.remove();
    host = root = launcher = toastEl = null;
  }

  CWA.panel = {
    mount,
    unmount,
    toggle: () => setOpen(!isOpen()),
    setLauncherVisible: (visible) => root?.classList.toggle('no-launcher', !visible),
  };
})();
