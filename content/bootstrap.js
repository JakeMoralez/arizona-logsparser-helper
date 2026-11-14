(function () {
  if (window.ArizonaBootstrap) return;
  const root = document.documentElement;
  root.classList.add('arz-mask-pending', 'arz-layout-pending');
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
    if (document.body) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('arz-layout-pending')));
  }
  function applyAppearance() {
    if (!loaded || released) return;
    const effective = window.ArizonaCompatibility?.preview(values.arz_logsparser_helper_settings, values.arizonaSettings);
    const general = effective?.general || values.arz_logsparser_helper_settings || {};
    const appearance = effective?.appearance || values.arizonaSettings || {};
    const enabled = general['extension-toggle'] !== false;
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
    chrome.storage.local.get(keys, saved => {
      Object.assign(values, saved, pending);
      loaded = true;
      window.ArizonaCompatibility?.start(values.arz_logsparser_helper_settings);
      applyAppearance();
      resolve(values);
    });
  });
  const compatibility = settings.then(() => window.ArizonaCompatibility?.start(values.arz_logsparser_helper_settings)).then(() => {
    applyAppearance();
    return values;
  });
  bodyReady.then(applyAppearance);
  window.addEventListener('alh-compatibility-status', applyAppearance);
  window.ArizonaBootstrap = {
    settings, compatibility, bodyReady,
    release() {
      released = true;
      chrome.storage.onChanged.removeListener(synchronize);
      window.removeEventListener('alh-compatibility-status', applyAppearance);
    }
  };
})();
