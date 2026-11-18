(function () {
  if (window.ArizonaBootstrap) return;
  const root = document.documentElement;
  root.classList.add('arz-mask-pending', 'arz-layout-pending', 'alh-startup-pending');
  let settled = false;
  let revealing = false;
  let readyFrame;
  let paintFrame;
  let pageObserver;
  const reveal = reason => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    cancelAnimationFrame(readyFrame);
    cancelAnimationFrame(paintFrame);
    pageObserver?.disconnect();
    root.classList.remove('alh-startup-pending', 'arz-layout-pending');
    if (reason !== 'ready') root.classList.remove('arz-mask-pending');
    root.dataset.alhStartup = reason;
    window.dispatchEvent(new CustomEvent('alh-startup-ready', { detail: { reason } }));
  };
  const watchdog = setTimeout(() => reveal('timeout'), 3000);
  function markReady() {
    if (settled || revealing) return;
    revealing = true;
    readyFrame = requestAnimationFrame(() => {
      paintFrame = requestAnimationFrame(() => reveal('ready'));
    });
  }
  function inspectPage() {
    if (settled || !document.body) return;
    const hasLogs = document.querySelector('table.table, form.filter');
    if (!hasLogs && /Processing your request|please wait|проверка браузера/i.test(document.body.textContent)) reveal('challenge');
    else if (document.readyState !== 'loading' && !hasLogs) reveal('non-log-page');
  }
  pageObserver = new MutationObserver(inspectPage);
  pageObserver.observe(root, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', inspectPage, { once: true });
  const keys = ['arz_logsparser_helper_settings', 'arizonaSettings', 'arizonaTemplates'];
  const values = {};
  const pending = {};
  let loaded = false;
  let released = false;
  const bodyReady = new Promise(resolve => {
    if (document.body) return resolve();
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(root, { childList: true });
  });
  const layoutClasses = ['arz-hide-sidebar-active', 'arz-toggle-sidebar-active', 'arz-sidebar-collapsed'];
  function applyLayout(general) {
    const enabled = general['extension-toggle'] !== false;
    let collapsed = false;
    try { collapsed = localStorage.getItem('arz_sidebar_collapsed') === 'true'; } catch (error) { }
    const states = [enabled && general['visual-hide-sidebar'] === true,
      enabled && general['visual-toggle-sidebar'] === true,
      enabled && general['visual-toggle-sidebar'] === true && collapsed];
    layoutClasses.forEach((name, index) => {
      (document.body || root).classList.toggle(name, states[index]);
      if (document.body) root.classList.remove(name);
    });
  }
  function applyAppearance() {
    if (!loaded || released) return;
    const effective = window.ArizonaCompatibility?.preview(values.arz_logsparser_helper_settings, values.arizonaSettings);
    const general = effective?.general || values.arz_logsparser_helper_settings || {};
    const appearance = effective?.appearance || values.arizonaSettings || {};
    const enabled = general['extension-toggle'] !== false;
    if (!enabled) reveal('disabled');
    applyLayout(general);
    const status = window.ArizonaCompatibility?.status();
    const maskingAppearance = !window.ArizonaCompatibility?.ready && status?.appliedMode === 'auto' && !status.detected
      ? values.arizonaSettings || {} : appearance;
    root.classList.toggle('arz-mask-pending', enabled && maskingAppearance.masking?.enabled !== false);
    root.classList.toggle('arz-sticky-headers-root', enabled && (general['visual-sticky-headers'] ?? true));
    if (!document.body) return;
    document.body.classList.toggle('arz-extension-disabled', !enabled);
    window.ArizonaThemeManager.init({ ...appearance, themeEnabled: enabled && general['visual-theme-enabled'] !== false });
    for (const [key, className, fallback] of [
      ['visual-sticky-navbar', 'arz-sticky-navbar-active', true],
      ['visual-sticky-headers', 'arz-sticky-headers-active', true],
      ['visual-hide-sidebar', 'arz-hide-sidebar-active', false],
      ['visual-remove-top-padding', 'arz-remove-top-padding-active', false]
    ]) document.body.classList.toggle(className, enabled && (general[key] ?? fallback));
    window.dispatchEvent(new CustomEvent('arizona-helper-copy-setting', {
      detail: { enabled: enabled && general['tweak-block-copy'] !== false }
    }));
  }
  const synchronize = (changes, area) => {
    if (area !== 'local') return;
    let changed = false;
    for (const key of keys) {
      if (!changes[key]) continue;
      (loaded ? values : pending)[key] = changes[key].newValue;
      changed = true;
    }
    if (!changed || !loaded) return;
    applyAppearance();
    window.dispatchEvent(new CustomEvent('alh-bootstrap-settings'));
  };
  chrome.storage.onChanged.addListener(synchronize);
  const settings = new Promise(resolve => {
    try { chrome.storage.local.get(keys, saved => {
      try {
      Object.assign(values, saved, pending);
      loaded = true;
      window.ArizonaCompatibility?.start(values.arz_logsparser_helper_settings);
      applyAppearance();
      resolve(values);
      } catch (error) { reveal('error'); resolve(values); }
    }); } catch (error) { reveal('error'); resolve(values); }
  });
  const compatibility = settings.then(() => window.ArizonaCompatibility?.start(values.arz_logsparser_helper_settings)).then(() => {
    applyAppearance();
    return values;
  }).catch(() => { reveal('error'); return values; });
  bodyReady.then(() => { applyAppearance(); inspectPage(); }).catch(() => reveal('error'));
  window.addEventListener('alh-compatibility-status', applyAppearance);
  window.ArizonaBootstrap = {
    settings, compatibility, bodyReady, markReady,
    failOpen() { reveal('error'); },
    release() {
      released = true;
      chrome.storage.onChanged.removeListener(synchronize);
      window.removeEventListener('alh-compatibility-status', applyAppearance);
    }
  };
})();
