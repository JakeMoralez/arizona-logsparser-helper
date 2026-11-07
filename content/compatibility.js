(function () {
  if (window.ArizonaCompatibility) return;
  const key = 'sakai-compatibility-mode';
  const hintKey = 'alh-sakai-detected';
  let mode = 'auto';
  let requestedMode = mode;
  let active = false;
  let detected = false;
  let initialized = false;
  let documentLoaded = document.readyState === 'complete' || performance.getEntriesByType('navigation')[0]?.domContentLoadedEventStart > 0;
  const documentReady = new Promise(resolve => {
    if (documentLoaded) return resolve();
    document.addEventListener('DOMContentLoaded', () => { documentLoaded = true; resolve(); }, { once: true });
  });
  let hinted = false;
  try { hinted = sessionStorage.getItem(hintKey) === 'true'; } catch (error) { }

  const normalize = value => ['auto', 'on', 'off'].includes(value) ? value : 'auto';
  const desired = () => requestedMode === 'on' || (requestedMode === 'auto' && detected);
  const status = () => ({ mode: requestedMode, appliedMode: mode, detected, active, reloadRequired: initialized && (requestedMode !== mode || desired() !== active) });
  const provisionalActive = () => initialized ? active : mode === 'on' || (mode === 'auto' && (hinted || detected));

  function inspect() {
    const next = !!document.querySelector('#arz-helper-fab img[src*="/icons/fab-icon-logs.png"], style#arz-helper-log-styles, style#arz-helper-log-panel-style');
    if (next === detected) return;
    detected = next;
    try {
      if (detected) sessionStorage.setItem(hintKey, 'true');
      else sessionStorage.removeItem(hintKey);
    } catch (error) { }
    window.dispatchEvent(new CustomEvent('alh-compatibility-status', { detail: status() }));
  }

  const generalOverrides = {
    'visual-sticky-navbar': false, 'visual-sticky-headers': false,
    'visual-theme-enabled': false,
    'visual-vertical-borders': false,
    'visual-remove-top-padding': false,
    'tweak-floating-filter': false,
    'tweak-load-more': false, 'tweak-show-filled-filters': false,
    'tweak-ip-info': false, 'tweak-always-limit': 'none', 'tweak-block-copy': false
  };
  const toolOverrides = Object.fromEntries([
    'identicalIPs', 'columnEyeButtons', 'filterWindow', 'formsEnabled', 'online',
    'styleResetButtonEnabled', 'copyAllLogsEnabled',
    'tgVkDetectorEnabled', 'duplicatePaginationTop'
  ].map(name => [name, false]));

  function effective(general = {}, appearance = {}, compatible = active) {
    return {
      general: { ...general, ...(compatible ? generalOverrides : {}) },
      appearance: compatible ? {
        ...appearance, themeEnabled: false, templatesEnabled: false,
        ipLookupEnabled: false, geoIPEnabled: false,
        masking: { ...appearance.masking, enabled: false },
        tools: { ...appearance.tools, ...toolOverrides }
      } : structuredClone(appearance)
    };
  }

  function forTools(appearance = {}) {
    if (!provisionalActive()) return appearance;
    const enabledTools = Object.fromEntries([
      'lookup', 'online', 'punishment', 'report', 'ipBatch', 'idNick',
      'analytics', 'similarIPsFinder', 'actionRepeatsFinder'
    ].map(name => [name, true]));
    return { ...appearance, tools: { ...appearance.tools, ...enabledTools } };
  }

  let startup;
  function start(general = {}) {
    if (startup) return startup;
    mode = requestedMode = normalize(general[key]);
    if (mode === 'on' || (mode === 'auto' && hinted)) {
      document.documentElement.classList.add('alh-sakai-compatible');
      document.documentElement.classList.remove('arz-mask-pending');
    }
    const observer = new MutationObserver(() => {
      if (inspectScheduled) return;
      inspectScheduled = true;
      queueMicrotask(() => { inspectScheduled = false; inspect(); });
    });
    let inspectScheduled = false;
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'id'] });
    startup = new Promise(resolve => {
      const finish = () => {
        if (initialized) return;
        inspect();
        if (!detected) {
          try { sessionStorage.removeItem(hintKey); } catch (error) { }
        }
        active = mode === 'on' || (mode === 'auto' && detected);
        initialized = true;
        document.documentElement.classList.toggle('alh-sakai-compatible', active);
        if (active) document.documentElement.classList.remove('arz-mask-pending');
        window.removeEventListener('alh-compatibility-status', earlyDetection);
        document.removeEventListener('DOMContentLoaded', finish);
        window.dispatchEvent(new CustomEvent('alh-compatibility-status', { detail: status() }));
        resolve();
      };
      const earlyDetection = () => { if (detected) finish(); };
      inspect();
      if (mode !== 'auto' || detected) return finish();
      window.addEventListener('alh-compatibility-status', earlyDetection);
      if (!documentLoaded) document.addEventListener('DOMContentLoaded', finish, { once: true });
      else finish();
    });
    return startup;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.arz_logsparser_helper_settings) return;
    requestedMode = normalize(changes.arz_logsparser_helper_settings.newValue?.[key]);
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.action !== 'alh_compatibility_status') return;
    inspect();
    respond(status());
  });
  window.ArizonaCompatibility = {
    start, effective, forTools, status, documentReady,
    preview: (general, appearance) => effective(general, appearance, provisionalActive()),
    get active() { return active; },
    get ready() { return initialized; }
  };
})();
