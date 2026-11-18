(function () {
  const mounted = new WeakSet();
  let observer, resizeObserver, classObserver, structureObserver;
  let scanTask = null, geometryFrame = null;
  let navbarHeight = 56, bulkHeight = 0, bulkSpacer = null;
  const fieldSelector = '.js_component_filter_item, [class*="js_component_filter_item_"], #alh-date-shortcut-wrap';
  const controlSelector = 'select[name="server_number"], select[name="type[]"], select[name="sort"], select[name="limit"], input[name="min_period"], input[name="max_period"], #alh-date-shortcut-input';
  const observedForms = new WeakSet();
  let currentForm = null;
  function scheduleScan() {
    if (scanTask !== null) return;
    scanTask = window.ArizonaRuntime.schedule(() => { scanTask = null; scan(); });
  }
  function setGeometry(name, value, target = document.documentElement) {
    if (target.style.getPropertyValue(name) !== value) target.style.setProperty(name, value);
  }
  function scheduleGeometry() {
    if (geometryFrame !== null) return;
    geometryFrame = requestAnimationFrame(() => { geometryFrame = null; navbarOffset(); bulkSpace(); });
  }
  const ensure = (form, className) => {
    let section = [...form.children].find(el => el.classList.contains(className));
    if (!section) { section = document.createElement('div'); section.className = className; form.append(section); }
    return section;
  };
  function layoutForm(form) {
    // Host versions have both flat and nested forms. Never style an ancestor row.
    const primary = ensure(form, 'alh-primary-grid');
    const actions = form.querySelector('.filter-buttons');
    const secondary = ensure(form, 'alh-secondary-grid');
    form.querySelectorAll(fieldSelector).forEach(field => {
      if (field.parentElement?.closest(fieldSelector)) return;
      field.classList.add('alh-form-field');
      if (field.parentElement !== primary) primary.append(field);
    });
    if (actions) {
      let wrapper = actions;
      while (wrapper.parentElement && wrapper.parentElement !== form) wrapper = wrapper.parentElement;
      if (wrapper === form) wrapper = actions;
      wrapper.classList.remove('mt-3');
      wrapper.classList.add('alh-form-actions');
      if (primary.nextElementSibling !== wrapper) primary.after(wrapper);
    }
    const search = form.querySelector('#arz-filter-logs')?.parentElement;
    const options = form.querySelector('#alh-log-filter-root');
    const multiple = form.querySelector('#arz-multi-player-wrap');
    for (const child of [search, options, multiple]) if (child && child.parentElement !== secondary) secondary.append(child);
    search?.classList.add('alh-log-search-column');
    window.ArizonaUiRefinements?.form(form);
    form.classList.add('alh-owned-layout');
    document.body.classList.add('alh-page-ready');
    form.closest('.card')?.classList.add('alh-filter-card');
  }
  function layoutLimit(input) {
    if (input.closest('.alh-record-count')) return input.closest('.alh-record-count');
    const table = document.querySelector('table.table');
    if (!table) return null;
    const old = input.closest('.d-flex') || input.parentElement;
    const toolbar = document.createElement('div'); toolbar.className = 'alh-table-toolbar';
    const count = document.createElement('div'); count.className = 'alh-record-count alh-limit-row';
    const label = document.createElement('span'); label.textContent = 'Показать';
    const suffix = document.createElement('span'); suffix.textContent = 'записей';
    const anchor = document.querySelector('#arz-top-pagination') || table.closest('.alh-table-frame, .table-responsive') || table;
    anchor.before(toolbar); toolbar.append(count); count.append(label, input, suffix);
    // Remove only the obsolete record-count host; other page controls stay intact.
    if (old !== document.body && !old.contains(table) && !old.matches('form, .app-content-body')) old.remove();
    return count;
  }
  function upgrade(input) {
    if (input.dataset.alhUpgraded) {
      if (input.classList.contains('select2-hidden-accessible')) {
        input.dispatchEvent(new CustomEvent('alh-site-upgrade', { bubbles: true }));
        input.classList.remove('select2-hidden-accessible');
      }
      return;
    }
    input.dataset.alhUpgraded = 'true';
    input.dispatchEvent(new CustomEvent('alh-site-upgrade', { bubbles: true }));
    input.classList.remove('select2-hidden-accessible');
    input.tabIndex = -1;
    input.removeAttribute('aria-hidden');
    if (input.name === 'min_period' || input.name === 'max_period') input.dataset.alhKind = 'datetime';
    if (input.id === 'alh-date-shortcut-input') input.dataset.alhKind = 'date';
    if (input.dataset.alhKind) {
      input.removeAttribute('data-td-target'); input.removeAttribute('data-td-toggle');
      input.parentElement.classList.add('alh-upgraded-date');
    }
    input.id ||= `alh-site-${input.name.replace(/[^a-z0-9]/gi, '-')}`;
  }
  function mount(root) {
    if (!root) return;
    root.classList.add('alh-controls-scope', 'alh-page-form');
    root.querySelectorAll('select[name="server_number"], select[name="type[]"], select[name="sort"], select[name="limit"], input[name="min_period"], input[name="max_period"], #alh-date-shortcut-input').forEach(upgrade);
    if (mounted.has(root)) { root.dispatchEvent(new Event('alh-refresh-controls')); return; }
    window.ArizonaModalControls.mount(root, () => {}, { page: true });
    // Prevent delegated date-picker launch from clicks on the replacement inputs.
    root.addEventListener('click', e => {
      if (e.target.closest('.alh-field-control')) e.stopPropagation();
    });
    mounted.add(root);
  }
  function scan() {
    const form = document.querySelector('form.filter');
    if (currentForm && currentForm !== form && !currentForm.isConnected) {
      observer?.disconnect(); observedForms.delete(currentForm); mounted.delete(currentForm);
      window.ArizonaModalControls.unmount(currentForm);
    }
    currentForm = form;
    if (form) {
      layoutForm(form); mount(form);
      if (observer && !observedForms.has(form)) {
        observer.observe(form, {childList: true, subtree: true}); observedForms.add(form);
      }
      const table = document.querySelector('table.table');
      if (table) table.classList.add('alh-log-table');
      if (table && !table.closest('.alh-table-frame')) {
        const frame = document.createElement('div'); frame.className = 'alh-table-frame';
        table.before(frame); frame.append(table);
      }
    }
    document.querySelectorAll('select[name="limit"]').forEach(input => {
      if (!input.closest('form.filter')) {
        mount(layoutLimit(input));
      }
    });
    if (form) form.querySelectorAll('select[name="server_number"], select[name="type[]"], select[name="sort"]').forEach(input => {
      const field = input.closest('[class*="js_component_filter_item"]');
      field?.classList.add('alh-form-field');
      field?.querySelectorAll('.select2-container').forEach(el => el.hidden = true);
    });
  }
  function navbarOffset() {
    const nav = document.querySelector('.app-nav, nav.navbar, .navbar');
    const fixed = document.body?.classList.contains('arz-sticky-navbar-active');
    const bottom = fixed && nav ? navbarHeight : 0;
    setGeometry('--alh-navbar-bottom', `${bottom}px`);
    document.querySelectorAll('.app, .app-sidebar, table.table thead th').forEach(target => setGeometry('--alh-navbar-bottom', `${bottom}px`, target));
  }
  function bulkSpace() {
    const bar = document.querySelector('#arz-bulk-actions-bar');
    const space = bar?.classList.contains('visible') ? Math.ceil(bulkHeight) + 32 : 0;
    if (bulkSpacer && bulkSpacer.style.height !== `${space}px`) bulkSpacer.style.height = `${space}px`;
    const dock=document.querySelector('.arz-floating-actions');
    const bottom=`${space ? space+16 : innerWidth<=700?20:32}px`;
    if(dock && dock.style.bottom!==bottom)dock.style.bottom=bottom;
  }
  async function init() {
    if (window.ArizonaCompatibility?.active || document.body.classList.contains('arz-extension-disabled')) return;
    if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, {once:true}));
    if (observer) { scan(); scheduleGeometry(); return; }
    observer = new MutationObserver(records => {
      if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 &&
        (n.matches(controlSelector + ', ' + fieldSelector + ', .select2-container, #arz-multi-player-wrap, #alh-log-filter-root') || n.querySelector(controlSelector))))) scheduleScan();
    });
    // Table mutations never enter the form observer. Only replacements are discovered globally.
    structureObserver = new MutationObserver(records => {
      if (records.some(r => !r.target.closest?.('table, form.filter, .alh-page-popovers, #arz-bulk-actions-bar') &&
        [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches('form.filter, table.table, select[name="limit"]') ||
          (!n.matches('.alh-modal-overlay, .arz-filter-modal, .arz-floating-actions') && n.querySelector('form.filter, table.table, select[name="limit"]')))))) scheduleScan();
    });
    structureObserver.observe(document.body, {childList: true, subtree: true});
    window.ArizonaUiRefinements?.init();
    scan();
    bulkSpacer = document.createElement('div'); bulkSpacer.className = 'alh-bulk-spacer'; bulkSpacer.setAttribute('aria-hidden','true');
    const end = document.querySelector('.alh-scroll-bottom');
    if (end) end.before(bulkSpacer); else document.body.append(bulkSpacer);
    navbarOffset(); bulkSpace();
    resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
        if (entry.target.id === 'arz-bulk-actions-bar') bulkHeight = height;
        else navbarHeight = height;
      }
      scheduleGeometry();
    });
    const nav = document.querySelector('.app-nav, nav.navbar, .navbar');
    if (nav) resizeObserver.observe(nav);
    const bar = document.querySelector('#arz-bulk-actions-bar');
    if (bar) resizeObserver.observe(bar);
    classObserver = new MutationObserver(scheduleGeometry);
    classObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if (bar) classObserver.observe(bar, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', scheduleGeometry, { passive: true });
    if (location.pathname === '/authenticator') document.body.classList.add('alh-authenticator-page');
  }
  window.ArizonaPageControls = { init };
})();
