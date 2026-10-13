/**
 * Everything the scripts know about WhatsApp Web's markup lives here (and in
 * the matching rules of content.css). When WhatsApp ships a redesign, this is
 * the file to patch.
 *
 * Rules for picking a selector:
 *  - never an obfuscated class (`_ak8o`, `x1n2onr6`...): they change per build;
 *  - prefer ids, ARIA roles/indices, `dir`, `title`, `data-*` and tag structure;
 *  - never match on aria-label *text*: it is translated per UI language.
 *
 * Each entry is a list of fallbacks, tried in order; the first one that
 * matches anything wins (see dom.first / dom.all).
 */
(() => {
  'use strict';

  const SEL = {
    // Layout anchors. Stable ids that have survived every redesign so far.
    chatList: ['#pane-side'],
    main: ['#main'],

    // One row of the (virtualised) chat list.
    chatRow: ['#pane-side [role="listitem"]', '#pane-side [role="row"]'],
    // Relative to a chat row.
    chatRowName: ['[role="gridcell"][aria-colindex="2"] span[title]', 'span[dir="auto"][title]'],
    chatRowTime: ['[role="gridcell"][aria-colindex="2"] > :nth-child(2)'],

    // Open conversation.
    chatTitle: ['#main header span[dir="auto"]', '#main header span[title]'],
    chatHeaderText: ['#main header span'],
    // Message rows carry "<fromMe>_<chat id>_<message id>" in data-id.
    messageId: ['#main [data-id*="@"]'],
    composer: [
      '#main footer [contenteditable="true"]',
      '#main [contenteditable="true"][role="textbox"]',
      'footer [contenteditable="true"]',
    ],
  };

  /** Anchors that must exist once the user is logged in; used by the selector health check. */
  const HEALTH_CHECKS = ['chatList', 'chatRow'];

  globalThis.CWA = { SEL, HEALTH_CHECKS, features: [] };
})();
