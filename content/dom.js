/**
 * DOM utilities: fallback-aware queries, a tiny element builder (no innerHTML
 * anywhere, so nothing here can become an injection sink) and the single
 * MutationObserver every feature shares.
 */
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** First element matched by the first selector that matches. */
  function first(selectors, scope = document) {
    for (const selector of selectors) {
      const el = scope.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  /** All elements matched by the first selector that matches anything. */
  function all(selectors, scope = document) {
    for (const selector of selectors) {
      const els = scope.querySelectorAll(selector);
      if (els.length) return [...els];
    }
    return [];
  }

  /** Visible text of a node, including emoji (WhatsApp renders those as <img alt>). */
  function textOf(node) {
    if (!node) return '';
    let out = '';
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue;
      else if (n.tagName === 'IMG') out += n.getAttribute('data-plain-text') || n.alt || '';
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  /** h('button', { class: 'x', onclick: fn }, 'label', child) */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value);
    }
    el.append(...children.flat().filter((child) => child != null && child !== false));
    return el;
  }

  /** A 24x24 stroked icon from a path string. */
  function svg(pathData) {
    const el = document.createElementNS(SVG_NS, 'svg');
    el.setAttribute('viewBox', '0 0 24 24');
    el.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    el.append(path);
    return el;
  }

  // ---- observer hub ------------------------------------------------------
  // WhatsApp Web re-renders constantly. One observer on the document, with
  // subscribers coalesced to at most one run per animation frame, keeps the
  // cost flat no matter how many features listen. (rAF also pauses the work
  // while the tab is hidden.)

  const subscribers = new Set();
  let observer = null;
  let queued = false;

  function flush() {
    queued = false;
    for (const fn of subscribers) {
      try {
        fn();
      } catch (error) {
        console.error('[CipherWA]', error);
      }
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(flush);
  }

  const hub = {
    start() {
      if (observer) return;
      observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      schedule();
    },
    stop() {
      observer?.disconnect();
      observer = null;
      subscribers.clear();
    },
    /** Returns an unsubscribe function. */
    on(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };

  /** Resolves with the element once any of `selectors` matches. */
  function waitFor(selectors) {
    return new Promise((resolve) => {
      const check = () => {
        const el = first(selectors);
        if (!el) return false;
        off?.();
        resolve(el);
        return true;
      };
      let off = null;
      if (!check()) off = hub.on(check);
    });
  }

  /** { selectorName: matchedSomething } for the anchors every feature depends on. */
  function health() {
    return Object.fromEntries(CWA.HEALTH_CHECKS.map((name) => [name, first(CWA.SEL[name]) !== null]));
  }

  CWA.dom = { first, all, textOf, h, svg, hub, waitFor, health };
})();
