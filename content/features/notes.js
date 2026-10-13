/**
 * Notes tab: one private note per chat, autosaved to chrome.storage.local.
 * Nothing here is ever sent to WhatsApp or anywhere else.
 */
(() => {
  'use strict';

  const { h } = CWA.dom;
  const { notes } = CWA_SHARED;
  const SAVE_DELAY_MS = 400;

  let ctx, heading, area, status;
  let key = null; // storage key of the note on screen; null while none is loaded
  let pending = null; // { key, text, title } waiting to be written
  let timer = 0;
  let loadSeq = 0;

  async function flush() {
    clearTimeout(timer);
    if (!pending) return;
    const job = pending;
    pending = null;
    await notes.save(job.key, job.text, job.title);
    if (job.key === key) {
      status.textContent = job.text.trim() ? 'Saved' : '';
      ctx.setBadge(job.text.trim());
    }
  }

  async function show(chat) {
    await flush(); // the previous chat's last keystrokes
    const seq = ++loadSeq;

    key = null;
    area.value = '';
    area.disabled = true;
    status.textContent = '';
    heading.textContent = chat ? chat.title : 'Open a chat to attach a note to it.';
    ctx.setBadge(false);
    if (!chat) return;

    const note = await notes.load(chat);
    if (seq !== loadSeq) return; // switched chats again while reading

    key = note.key;
    area.value = note.text;
    area.disabled = false;
    ctx.setBadge(note.text);
  }

  function onInput() {
    if (!key) return;
    pending = { key, text: area.value, title: heading.textContent };
    status.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  CWA.features.push({
    id: 'notes',
    label: 'Notes',
    mount(view, context) {
      ctx = context;
      heading = h('h2', { class: 'chat-name' });
      area = h('textarea', {
        class: 'note',
        placeholder: 'Private note for this chat. Only stored in this browser.',
        disabled: true,
        oninput: onInput,
        onblur: flush,
      });
      status = h('p', { class: 'hint', role: 'status' });
      view.append(heading, area, status);
    },
    onChatChanged: show,
  });
})();
