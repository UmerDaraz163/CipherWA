/**
 * Export tab: chat list and group member list to CSV.
 *
 * Both read only what WhatsApp Web already shows on screen. The consequence:
 * a saved contact appears under the name you saved, and its number is not in
 * the page, so the phone column is only filled for unsaved numbers.
 */
(() => {
  'use strict';

  const { SEL, dom, wa } = CWA;
  const { h } = dom;

  const MAX_SCROLL_STEPS = 600;
  const RENDER_WAIT_MS = 150;
  const PHONE_LIKE = /^\+?[\d\s().-]{7,20}$/;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const phoneFrom = (name) => (PHONE_LIKE.test(name) ? name.replace(/\D/g, '') : '');
  const today = () => new Date().toISOString().slice(0, 10);

  /** Nearest element (self or ancestor) that actually scrolls vertically. */
  function findScroller(el) {
    for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node;
    }
    return null;
  }

  /**
   * The chat list is virtualised: only the rows near the viewport exist. Walk
   * the list top to bottom, collecting rows at each stop, then put the scroll
   * position back where the user had it.
   */
  async function collectChats(onProgress) {
    const pane = dom.first(SEL.chatList);
    if (!pane) throw new Error('Chat list not found. Is WhatsApp Web fully loaded?');

    const seen = new Map();
    const collect = () => {
      for (const row of dom.all(SEL.chatRow)) {
        const nameEl = dom.first(SEL.chatRowName, row);
        const name = nameEl?.getAttribute('title')?.trim() || dom.textOf(nameEl);
        if (!name) continue;
        const lastActivity = dom.textOf(dom.first(SEL.chatRowTime, row));
        seen.set(`${name}\n${lastActivity}`, { name, phone: phoneFrom(name), last_activity: lastActivity });
      }
      onProgress(seen.size);
    };

    const scroller = findScroller(pane);
    if (!scroller) {
      collect(); // short list, everything is already rendered
      return [...seen.values()];
    }

    const restoreTo = scroller.scrollTop;
    try {
      scroller.scrollTop = 0;
      for (let step = 0; step < MAX_SCROLL_STEPS; step++) {
        await sleep(RENDER_WAIT_MS);
        collect();
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
        scroller.scrollTop += Math.max(100, scroller.clientHeight * 0.8);
      }
    } finally {
      scroller.scrollTop = restoreTo;
    }
    return [...seen.values()];
  }

  /** In a group, the line under the title lists the members; its text is the source here. */
  function collectGroupMembers() {
    const chat = wa.getActiveChat();
    if (!chat) throw new Error('Open a group chat first.');
    if (chat.isGroup === false) throw new Error('The open chat is not a group.');

    const memberLine = dom
      .all(SEL.chatHeaderText)
      .map((el) => el.getAttribute('title') || dom.textOf(el))
      .filter((text) => text !== chat.title && text.includes(','))
      .sort((a, b) => b.length - a.length)[0];
    if (!memberLine) {
      throw new Error('Member names are not shown yet. Wait until they appear under the group title, then retry.');
    }

    const names = [...new Set(memberLine.split(',').map((name) => name.trim()).filter(Boolean))];
    return { group: chat.title, rows: names.map((name) => ({ group: chat.title, name, phone: phoneFrom(name) })) };
  }

  /**
   * RFC 4180 quoting, plus a guard against spreadsheet formula injection from
   * contact names (anyone can set theirs to "=HYPERLINK(...)"). Plain phone
   * numbers start with "+" too but cannot carry a formula, so they stay as is.
   */
  function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text) && !PHONE_LIKE.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadCsv(filename, columns, rows) {
    const lines = [columns, ...rows.map((row) => columns.map((column) => row[column]))];
    const csv = lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
    // The BOM makes Excel read the file as UTF-8.
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    h('a', { href: url, download: filename }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  CWA.features.push({
    id: 'export',
    label: 'Export',
    mount(view, ctx) {
      const status = h('p', { class: 'hint', role: 'status' });
      let busy = false;

      const run = (job) => async () => {
        if (busy) return;
        busy = true;
        try {
          await job();
        } catch (error) {
          status.textContent = '';
          ctx.toast(error.message);
        } finally {
          busy = false;
        }
      };

      const exportChats = run(async () => {
        const rows = await collectChats((count) => (status.textContent = `Reading chat list… ${count} found`));
        if (!rows.length) throw new Error('No chats found.');
        downloadCsv(`cipherwa-chats-${today()}.csv`, ['name', 'phone', 'last_activity'], rows);
        status.textContent = `Exported ${rows.length} chats.`;
      });

      const exportMembers = run(async () => {
        const { group, rows } = collectGroupMembers();
        const slug = group.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'group';
        downloadCsv(`cipherwa-members-${slug}-${today()}.csv`, ['group', 'name', 'phone'], rows);
        status.textContent = `Exported ${rows.length} members of ${group}.`;
      });

      view.append(
        h(
          'div',
          { class: 'stack' },
          h('button', { class: 'btn', type: 'button', onclick: exportChats }, 'Export chat list (CSV)'),
          h('button', { class: 'btn', type: 'button', onclick: exportMembers }, 'Export members of this group (CSV)'),
          status,
          h(
            'p',
            { class: 'hint' },
            'Exports what WhatsApp Web displays. Saved contacts are listed by name; the phone column is filled only for numbers that are not in your contacts.',
          ),
        ),
      );
    },
  });
})();
