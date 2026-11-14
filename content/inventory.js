(() => {
  const ui = globalThis.ArizonaInventory;
  const contexts = new WeakMap();
  let processed = new WeakMap();
  let observed = new WeakSet();
  let visible = new WeakSet();
  let observer = null;
  const cache = new Map();
  let enabled = false;
  let dialog = null;
  let closeDialog = null;

  function unwrap(root) {
    root.querySelectorAll('.alh-item-link').forEach(node => node.replaceWith(...node.childNodes));
  }

  function processRow(row) {
    if (!enabled) return;
    const cell = row.cells?.[1];
    if (!cell) return;
    const text = cell.textContent;
    let prepared = processed.get(cell);
    if (prepared?.text === text && prepared.rendered && cell.querySelector('.alh-item-link')) return;
    if (!prepared || prepared.text !== text || prepared.rendered) {
      if (prepared?.rendered || cell.querySelector('.alh-item-link')) unwrap(cell);
      prepared = { text, matches: ui.parse(text), rendered: false };
      processed.set(cell, prepared);
    }
    const matches = prepared.matches;
    if (!matches.length) return;
    if (observer && !visible.has(row)) {
      if (!observed.has(row)) { observed.add(row); observer.observe(row); }
      return;
    }
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let offset = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      nodes.push({ node, start: offset, end: offset + node.length });
      offset += node.length;
    }
    const ranges = matches.flatMap(context => context.ranges.map(([start, end]) => ({ start, end, context })));
    for (const { node, start, end } of nodes) {
      if (node.parentElement.closest('a, button, script, style, .arz-row-actions-wrapper, .arz-cell-copy-btn')) continue;
      const overlapping = ranges.filter(range => range.start < end && range.end > start);
      if (!overlapping.length) continue;
      const fragment = document.createDocumentFragment();
      let position = 0;
      for (const range of overlapping) {
        const from = Math.max(0, range.start - start);
        const to = Math.min(node.length, range.end - start);
        if (from > position) fragment.append(document.createTextNode(node.data.slice(position, from)));
        const link = ui.element('span', node.data.slice(from, to), 'alh-item-link');
        link.setAttribute('role', 'button');
        link.tabIndex = 0;
        link.title = `Предмет #${range.context.id}: подробности`;
        contexts.set(link, range.context);
        fragment.append(link);
        position = to;
      }
      if (position < node.length) fragment.append(document.createTextNode(node.data.slice(position)));
      node.replaceWith(fragment);
    }
    prepared.rendered = true;
  }

  function open(context, trigger) {
    closeDialog?.();
    const overlay = ui.element('div', undefined, 'alh-modal-overlay alh-item-dialog');
    const box = ui.element('div', undefined, 'arz-modal-container alh-item-dialog-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', `Предмет #${context.id}`);
    const header = ui.element('div', undefined, 'alh-modal-header');
    const symbol = ui.element('div', undefined, 'arz-modal-icon-wrapper');
    symbol.append(ui.icon('box'));
    const heading = ui.element('div', undefined, 'arz-modal-title-block');
    heading.append(ui.element('div', 'Предмет инвентаря', 'arz-modal-title'), ui.element('div', 'Характеристики и данные из лога', 'arz-modal-subtitle'));
    const close = ui.element('button', undefined, 'alh-modal-close-btn');
    close.setAttribute('aria-label', 'Закрыть');
    close.title = 'Закрыть';
    close.append(ui.icon('xmark'));
    header.append(symbol, heading, close);
    const footer = ui.element('div', undefined, 'alh-modal-footer alh-item-dialog-footer');
    const refresh = ui.element('button', undefined, 'arz-btn-secondary');
    refresh.append(ui.icon('rotate'), document.createTextNode('Обновить каталог'));
    const status = ui.element('p', 'Загрузка сведений…', 'alh-item-dialog-status');
    status.setAttribute('role', 'status');
    const body = ui.element('div', undefined, 'alh-modal-body alh-item-dialog-body');
    body.append(ui.loadingCard());
    footer.append(status, refresh);
    box.append(header, body, footer);
    overlay.append(box);
    window.ArizonaUtils.openOverlay(overlay);
    dialog = overlay;
    let timer;
    let sequence = 0;
    let dismissed = false;
    let renderedRevision = null;
    const cached = cache.get(context.id);
    if (cached) body.replaceChildren(ui.card(cached, context));
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      sequence++;
      clearTimeout(timer);
      window.ArizonaUtils.closeOverlay(overlay);
      document.removeEventListener('keydown', keyboard, true);
      if (dialog === overlay) { dialog = null; closeDialog = null; }
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    const keyboard = event => {
      if (event.key === 'Escape') { event.stopImmediatePropagation(); event.preventDefault(); dismiss(); }
      if (event.key === 'Tab') {
        const focusable = [...box.querySelectorAll('button, summary, a[href], [tabindex="0"]')].filter(node => !node.disabled);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    closeDialog = dismiss;
    close.onclick = dismiss;
    document.addEventListener('keydown', keyboard, true);
    close.focus();

    async function load(force = false) {
      clearTimeout(timer);
      const token = ++sequence;
      refresh.disabled = true;
      try {
        if (force) await ui.send({ action: 'inventory_catalog_refresh' });
        const result = await ui.send({ action: 'inventory_catalog_get', id: context.id });
        if (token !== sequence || dismissed || !overlay.isConnected) return;
        const state = result.status;
        status.classList.toggle('is-error', !!state.error);
        if (state.ready) {
          if (renderedRevision !== state.updatedAt) {
            body.replaceChildren(ui.card(result.item, context));
            renderedRevision = state.updatedAt;
          }
          if (result.item) {
            cache.delete(context.id);
            cache.set(context.id, result.item);
            if (cache.size > 64) cache.delete(cache.keys().next().value);
          } else cache.delete(context.id);
        } else if (!state.updating) body.replaceChildren(ui.card(null, context));
        status.textContent = state.error || (state.updating ? `Загрузка каталога: ${state.loaded} / ${state.downloadTotal ?? '…'}` : `Каталог обновлён: ${new Date(state.updatedAt).toLocaleString('ru-RU')}`);
        refresh.disabled = state.updating || Date.now() < state.retryAt;
        if (state.updating || Date.now() < state.retryAt) timer = setTimeout(() => load(), state.updating ? 1000 : Math.min(60000, Math.max(1000, state.retryAt - Date.now())));
      } catch (error) {
        if (token !== sequence) return;
        status.textContent = error.message;
        if (body.querySelector('.alh-item-skeleton')) body.replaceChildren(ui.card(null, context));
        refresh.disabled = false;
      }
    }
    refresh.onclick = () => load(true);
    load();
  }

  function activate(event) {
    const link = event.target.closest?.('.alh-item-link');
    const context = link && contexts.get(link);
    if (!enabled || !context) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    open(context, link);
  }

  function configure(settings, schedule) {
    const next = settings['extension-toggle'] !== false && settings['tweak-inventory-items'] !== false;
    if (next === enabled) return false;
    enabled = next;
    if (enabled) {
      if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver(entries => {
        const rows = [];
        for (const entry of entries) {
          const row = entry.target;
          if (!row.isConnected) { observer?.unobserve(row); observed.delete(row); continue; }
          if (entry.isIntersecting) {
            visible.add(row);
            if (!processed.get(row.cells?.[1])?.rendered) rows.push(row);
          } else visible.delete(row);
        }
        if (rows.length) schedule(rows);
      }, { rootMargin: '1000px 0px' });
      document.addEventListener('click', activate);
      document.addEventListener('keydown', activate);
    } else {
      document.removeEventListener('click', activate);
      document.removeEventListener('keydown', activate);
      observer?.disconnect();
      observer = null;
      observed = new WeakSet();
      visible = new WeakSet();
      closeDialog?.();
      for (const cell of document.querySelectorAll('table.table tbody td:nth-child(2)')) {
        unwrap(cell);
      }
      processed = new WeakMap();
      cache.clear();
    }
    return true;
  }

  function forget(row) {
    observer?.unobserve(row);
    observed.delete(row);
    visible.delete(row);
  }

  globalThis.ArizonaInventoryLogs = { processRow, configure, forget };
})();
