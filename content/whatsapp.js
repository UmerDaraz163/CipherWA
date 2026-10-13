/**
 * Read-and-act layer over the WhatsApp Web page: which chat is open, put text
 * in the message box, open a chat by number. Features go through this instead
 * of touching WhatsApp's DOM themselves.
 */
(() => {
  'use strict';

  const { SEL, dom } = CWA;
  const { buildSendUrl } = CWA_SHARED;

  // "false_923001234567@c.us_3EB0..." / "true_1203...@g.us_3EB0..._9230...@c.us"
  const MESSAGE_ID = /^(?:true|false)_([^_]+@[a-z.]+)_/;
  const SETTLE_MS = 400;

  const listeners = new Set();
  let active = null;
  let signature = '';
  let settleTimer = 0;

  function readActiveChat() {
    const title = dom.textOf(dom.first(SEL.chatTitle));
    if (!title) return null;
    const jid = dom.first(SEL.messageId)?.getAttribute('data-id')?.match(MESSAGE_ID)?.[1] ?? null;
    return { title, jid, isGroup: jid ? jid.endsWith('@g.us') : null };
  }

  function detect(settled = false) {
    const next = readActiveChat();
    const nextSignature = next ? `${next.jid ?? ''}|${next.title}` : '';
    if (nextSignature === signature) return;

    // The message rows (which carry the chat id) render a beat after the
    // header. Give them a moment before settling for a title-only identity.
    if (next && !next.jid && !settled) {
      settleTimer ||= setTimeout(() => {
        settleTimer = 0;
        detect(true);
      }, SETTLE_MS);
      return;
    }

    clearTimeout(settleTimer);
    settleTimer = 0;
    signature = nextSignature;
    active = next;
    for (const fn of listeners) fn(active);
  }

  /** Puts `text` at the caret of the message box without sending it. */
  function insertIntoComposer(text) {
    const box = dom.first(SEL.composer);
    if (!box) return false;
    box.focus();

    // The editor only updates its own state from real editing events, so
    // setting textContent would be ignored. A synthetic paste is what it
    // understands (and it keeps line breaks).
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const paste = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
    box.dispatchEvent(paste);

    // An editor that handles the paste cancels it; if nobody did, insert natively.
    if (!paste.defaultPrevented) document.execCommand('insertText', false, text);
    return true;
  }

  /**
   * Opens a chat with any number, saved or not. WhatsApp Web routes clicks on
   * its own /send links in-app when it can; when it does not, the click is a
   * normal navigation to the same URL, which opens the chat after a reload.
   */
  function openChat(phone, text) {
    const link = dom.h('a', { href: buildSendUrl(phone, text), hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
  }

  CWA.wa = {
    start() {
      return dom.hub.on(() => detect());
    },
    getActiveChat: () => active,
    /** `fn(chat | null)` on every chat switch. Returns an unsubscribe function. */
    onChatChanged(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    insertIntoComposer,
    openChat,
  };
})();
