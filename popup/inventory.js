document.addEventListener('DOMContentLoaded', () => {
  const ui = globalThis.ArizonaInventory;
  const panel = document.getElementById('inventory-tab');
  const search = document.getElementById('inventory-search');
  const list = document.getElementById('inventory-list');
  const status = document.getElementById('inventory-status');
  const count = document.getElementById('inventory-count');
  const refresh = document.getElementById('inventory-refresh');
  const previous = document.getElementById('inventory-previous');
  const next = document.getElementById('inventory-next');
  const pageLabel = document.getElementById('inventory-page');
  const detail = document.getElementById('inventory-detail');
  const detailBody = document.getElementById('inventory-detail-body');
  const back = document.getElementById('inventory-back');
  const results = document.getElementById('inventory-results');
  let page = 0;
  let sequence = 0;
  let timer;
  let debounce;
  let total = 0;
  let selected = null;
  let returnFocus = null;
  let renderKey = '';
  let revision = 0;
  let detailRevision = 0;
  const animations = new WeakMap();
  let renderedPage = 0;

  function animateView(node, direction = 1, entering = true) {
    animations.get(node)?.cancel();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const motion = node.animate(entering ? [
      { opacity: 0, transform: `translateX(${direction * 10}px)` },
      { opacity: 1, transform: 'translateX(0)' }
    ] : [
      { opacity: 1, transform: 'translateX(0)' },
      { opacity: 0, transform: `translateX(${-direction * 8}px)` }
    ], { duration: entering ? 220 : 100, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    animations.set(node, motion);
    return motion.finished.catch(() => {});
  }

  function closeDetail() {
    selected = null;
    detail.hidden = true;
    results.hidden = false;
    animateView(results, -1);
    if (returnFocus?.isConnected) returnFocus.focus();
    else search.focus();
  }

  function showDetail(item, trigger) {
    selected = item;
    detailRevision = revision;
    returnFocus = trigger;
    detailBody.replaceChildren(ui.card(item));
    results.hidden = true;
    detail.hidden = false;
    animateView(detail);
    back.focus();
  }

  async function load(force = false) {
    clearTimeout(timer);
    const requestId = ++sequence;
    refresh.disabled = true;
    list.setAttribute('aria-busy', 'true');
    try {
      if (force) await ui.send({ action: 'inventory_catalog_refresh' });
      const response = await ui.send({ action: 'inventory_catalog_search', query: search.value, page, requestId });
      if (requestId !== sequence || !panel.classList.contains('active')) return;
      const state = response.status;
      revision = state.updatedAt;
      total = response.total;
      const maxPage = Math.max(0, Math.ceil(total / 50) - 1);
      if (page > maxPage) { page = maxPage; return load(); }
      count.replaceChildren(ui.element('span', `Найдено: ${total.toLocaleString('ru-RU')}`), ui.element('span', `В каталоге: ${state.total.toLocaleString('ru-RU')}`));
      pageLabel.textContent = `${page + 1} / ${maxPage + 1}`;
      previous.disabled = page === 0;
      next.disabled = page >= maxPage;
      refresh.disabled = state.updating || Date.now() < state.retryAt;
      refresh.classList.toggle('is-loading', state.updating);
      status.classList.toggle('is-error', !!state.error);
      status.textContent = state.error || (state.updating ? `Загрузка: ${state.loaded} / ${state.downloadTotal ?? '…'}` : state.ready ? `Обновлён: ${new Date(state.updatedAt).toLocaleString('ru-RU')}` : 'Каталог ещё не загружен');
      const key = JSON.stringify([search.value, page, revision, total, state.ready, !!state.error]);
      if (renderKey !== key) {
        const direction = page < renderedPage ? -1 : 1;
        if (renderKey && !results.hidden) await animateView(list, direction, false);
        if (requestId !== sequence || !panel.classList.contains('active')) return;
        renderKey = key;
        renderedPage = page;
        const fragment = document.createDocumentFragment();
        for (const item of response.items) {
          const row = ui.element('button', undefined, 'alh-inventory-row');
          const text = ui.element('span', undefined, 'alh-inventory-row-text');
          text.append(ui.element('strong', item.name), ui.element('small', `ID: ${item.id} · ${ui.typeName(item.is_custom)}`));
          const chevron = ui.icon('chevron-right');
          chevron.classList.add('alh-inventory-chevron');
          row.append(ui.image(item), text, chevron);
          row.onclick = () => showDetail(item, row);
          fragment.append(row);
        }
        if (!response.items.length) {
          const empty = ui.element('div', undefined, 'inventory-empty');
          empty.append(ui.icon(state.error ? 'cloud-arrow-down' : 'box-open'), ui.element('p', state.ready ? 'Предметы не найдены' : state.error ? 'Каталог не загружен. Повторите обновление.' : 'Подготавливаем каталог…'));
          fragment.append(empty);
        }
        list.replaceChildren(fragment);
        list.scrollTop = 0;
        if (!results.hidden) animateView(list, direction);
      }
      list.setAttribute('aria-busy', 'false');
      if (selected && state.ready && detailRevision !== revision) {
        const result = await ui.send({ action: 'inventory_catalog_get', id: selected.id });
        if (requestId !== sequence) return;
        if (selected) {
          detailRevision = revision;
          detailBody.replaceChildren(ui.card(result.item, { id: selected.id, name: selected.name }));
        }
      }
      if (state.updating || Date.now() < state.retryAt) timer = setTimeout(() => load(), state.updating ? 1000 : Math.min(60000, Math.max(1000, state.retryAt - Date.now())));
    } catch (error) {
      if (requestId !== sequence) return;
      status.textContent = error.message;
      status.classList.add('is-error');
      refresh.classList.remove('is-loading');
      list.setAttribute('aria-busy', 'false');
      refresh.disabled = false;
    }
  }

  document.querySelectorAll('.tab-btn').forEach(button => button.addEventListener('click', () => {
    clearTimeout(timer);
    clearTimeout(debounce);
    sequence++;
    if (button.dataset.tab === 'inventory-tab') load();
  }));
  search.addEventListener('input', () => {
    sequence++;
    clearTimeout(timer);
    clearTimeout(debounce);
    page = 0;
    if (selected) {
      selected = null;
      detail.hidden = true;
      results.hidden = false;
    }
    debounce = setTimeout(() => load(), 200);
  });
  previous.onclick = () => { if (page) { page--; load(); } };
  next.onclick = () => { if ((page + 1) * 50 < total) { page++; load(); } };
  refresh.onclick = () => load(true);
  back.onclick = closeDetail;
  panel.addEventListener('keydown', event => { if (event.key === 'Escape' && selected) { event.preventDefault(); closeDetail(); } });
});
