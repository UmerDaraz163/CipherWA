/**
 * Replies tab: a searchable list of canned replies. Clicking one puts it in
 * the message box; the user still presses send, so nothing goes out unseen.
 */
(() => {
  'use strict';

  const { dom, wa } = CWA;
  const { h } = dom;
  const store = CWA_SHARED.replies;
  const CONFIRM_MS = 3000;

  let ctx, search, list, form, titleInput, textInput, addButton;
  let items = [];
  let editingId = null;

  function insert(reply) {
    if (wa.insertIntoComposer(reply.text)) ctx.toast(`Inserted “${reply.title}”`);
    else ctx.toast('Open a chat first.');
  }

  /** First click arms the button, a second one within a few seconds deletes. */
  function removeOnSecondClick(reply, button) {
    if (button.dataset.armed) {
      items = items.filter((item) => item.id !== reply.id);
      store.set(items);
      render();
      return;
    }
    button.dataset.armed = '1';
    button.textContent = 'Delete?';
    setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = '✕';
    }, CONFIRM_MS);
  }

  function openForm(reply = null) {
    editingId = reply?.id ?? null;
    titleInput.value = reply?.title ?? '';
    textInput.value = reply?.text ?? '';
    form.hidden = false;
    addButton.hidden = true;
    titleInput.focus();
  }

  function closeForm() {
    form.hidden = true;
    addButton.hidden = false;
    editingId = null;
  }

  function submit(event) {
    event.preventDefault();
    const text = textInput.value.trim();
    if (!text) return;
    const title = titleInput.value.trim() || text.slice(0, 30);

    if (editingId) items = items.map((item) => (item.id === editingId ? { ...item, title, text } : item));
    else items = [...items, { id: crypto.randomUUID(), title, text }];

    store.set(items);
    closeForm();
    render();
  }

  function row(reply) {
    return h(
      'li',
      { class: 'reply' },
      h(
        'button',
        { class: 'reply-main', type: 'button', title: 'Insert into the message box', onclick: () => insert(reply) },
        h('strong', {}, reply.title),
        h('span', {}, reply.text),
      ),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${reply.title}`, onclick: () => openForm(reply) }, '✎'),
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          'aria-label': `Delete ${reply.title}`,
          onclick: (event) => removeOnSecondClick(reply, event.currentTarget),
        },
        '✕',
      ),
    );
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const shown = items.filter((item) => !query || `${item.title}\n${item.text}`.toLowerCase().includes(query));
    if (shown.length) list.replaceChildren(...shown.map(row));
    else list.replaceChildren(h('li', { class: 'hint' }, items.length ? 'No reply matches.' : 'No replies yet.'));
  }

  CWA.features.push({
    id: 'replies',
    label: 'Replies',
    mount(view, context) {
      ctx = context;
      search = h('input', { type: 'search', placeholder: 'Search replies', 'aria-label': 'Search replies', oninput: render });
      list = h('ul', { class: 'replies' });

      titleInput = h('input', { type: 'text', placeholder: 'Short name', maxLength: 60 });
      textInput = h('textarea', { rows: 4, placeholder: 'Reply text', required: true });
      form = h(
        'form',
        { class: 'card', hidden: true, onsubmit: submit },
        titleInput,
        textInput,
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn', type: 'button', onclick: closeForm }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
        ),
      );
      addButton = h('button', { class: 'btn', type: 'button', onclick: () => openForm() }, '+ New reply');

      view.append(search, list, form, addButton);
      store.get().then((stored) => {
        items = stored;
        render();
      });
    },
  });
})();
