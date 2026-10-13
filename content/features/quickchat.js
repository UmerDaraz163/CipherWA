/**
 * New chat tab: message a number without saving it as a contact first.
 */
(() => {
  'use strict';

  const { dom, wa } = CWA;
  const { h } = dom;
  const { getSettings, normalizePhone } = CWA_SHARED;

  CWA.features.push({
    id: 'quickchat',
    label: 'New chat',
    mount(view, ctx) {
      const phone = h('input', {
        type: 'tel',
        placeholder: 'Phone number with country code',
        'aria-label': 'Phone number with country code',
        autocomplete: 'off',
        required: true,
      });
      const text = h('textarea', { rows: 3, placeholder: 'First message (optional)', 'aria-label': 'First message' });
      const error = h('p', { class: 'error', role: 'alert', hidden: true });

      const submit = async (event) => {
        event.preventDefault();
        const { defaultCountryCode } = await getSettings();
        const number = normalizePhone(phone.value, defaultCountryCode);
        error.hidden = Boolean(number);
        if (!number) {
          error.textContent = 'Enter the full international number, e.g. +44 7700 900123.';
          return;
        }
        wa.openChat(number, text.value.trim());
        phone.value = text.value = '';
        ctx.close();
      };

      view.append(
        h(
          'form',
          { class: 'stack', onsubmit: submit },
          h('p', { class: 'hint' }, 'Start a chat with a number that is not in your contacts.'),
          phone,
          text,
          error,
          h('button', { class: 'btn primary', type: 'submit' }, 'Open chat'),
        ),
      );
    },
  });
})();
