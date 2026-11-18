
(function () {

  function ensureIconStyles() {
    if (document.getElementById('arz-icon-styles')) return;
    const link = document.createElement('link');
    link.id = 'arz-icon-styles';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('popup/vendor/css/fontawesome.min.css');
    (document.head || document.documentElement).appendChild(link);
  }

  const DEFAULT_SETTINGS = {
    'extension-toggle': true,
    'tweak-log-data': true,
    'tweak-log-labels': true,
    'tweak-log-layout': 'inline',
    'tweak-log-separator': false,
    'tweak-log-accounts-total': false,
    'tweak-log-hide-zero': false,
    'tweak-log-hide-minus': true,
    'tweak-log-id': true,
    'tweak-log-vc': true,
    'tweak-log-account1': true,
    'tweak-log-account2': true,
    'tweak-log-account3': true,
    'tweak-log-account4': true,
    'tweak-log-account5': true,
    'tweak-log-account6': true,
    'tweak-log-deposit': true,
    'tweak-log-admin': true,

    'sakai-compatibility-mode': 'auto',
    'visual-sticky-navbar': true,
    'visual-sticky-headers': true,
    'visual-theme-enabled': true,
    'visual-hide-sidebar': false,
    'visual-toggle-sidebar': false,
    'visual-vertical-borders': false,
    'visual-replace-favicon': false,
    'visual-remove-top-padding': false,
    'tweak-floating-filter': true,
    'tweak-scroll-top': true,
    'tweak-scroll-bottom': true,
    'tweak-load-more': true,
    'tweak-ip-info': false,
    'tweak-always-limit': 'none',
    'tweak-copy-btn-visibility': 'hover',
    'visual-logo-customization': 'default',
    'tweak-copy-row': true,
    'tweak-hide-row': true,
    'tweak-copy-cells': true,
    'tweak-inventory-items': true,
    'tweak-block-copy': true,
    'tweak-multi-select': true
  };

  const sakaiCompatible = () => window.ArizonaCompatibility?.active === true;
  const effectiveSettings = (general, appearance) => window.ArizonaCompatibility?.effective(general, appearance) || { general, appearance };
  const toolSettings = appearance => window.ArizonaCompatibility?.forTools(appearance) || appearance;

  let currentSettings = { ...DEFAULT_SETTINGS };
  let arizonaSettings = {};
  let arizonaTemplates = [];
  let pendingSettingsChanges = {};
  let handleStorageChanges;
  let ecosystemApiData = null;
  let ecosystemLookupMap = new Map();
  let ecosystemWorkingDomain = 'https://arizona-ai.ru';

  let isProcessingTable = false;
  let isProcessingIps = false;
  let isProcessingIdentical = false;
  let isProcessingTuning = false;

  function clearCopyableSnippets() {
    document.querySelectorAll('.arz-copyable-snippet').forEach((snippet) => {
      snippet.replaceWith(document.createTextNode(snippet.textContent || ''));
    });
  }

  function updateCopyBlockSetting(enabled) {
    window.dispatchEvent(new CustomEvent('arizona-helper-copy-setting', {
      detail: { enabled: enabled === true }
    }));
  }

  function isCurrentlyProcessing() {
    return isProcessingTable;
  }

  function suspendObservers() {
    if (window.ArizonaObservers && typeof window.ArizonaObservers.stop === 'function') {
      window.ArizonaObservers.stop();
    }
    if (window.ArizonaMaskingManager && typeof window.ArizonaMaskingManager.stopObserver === 'function') {
      window.ArizonaMaskingManager.stopObserver();
    }
  }

  function resumeObservers() {
    if (currentSettings['extension-toggle'] !== false) {
      if (window.ArizonaObservers && typeof window.ArizonaObservers.start === 'function') {
        window.ArizonaObservers.start();
      }
      if (window.ArizonaMaskingManager && typeof window.ArizonaMaskingManager.startObserver === 'function') {
        window.ArizonaMaskingManager.startObserver();
      }
    }
  }

  function isValidNickname(str) {
    if (!str || typeof str !== 'string') return false;
    const s = str.trim();
    if (s.length < 3 || s.length > 32) return false;
    if (/^(unic_id\d*|color_?id\d*|item_?id\d*|model_?id\d*|account_?id\d*|char_?id\d*|player_?id\d*|user_?id\d*|vk_?id\d*|tg_?id\d*|vc_?id\d*|discord_?id\d*)$/i.test(s)) {
      return false;
    }
    return /^[A-Z][a-zA-Z0-9]*_[A-Za-z0-9_]+$/.test(s);
  }
  window.isValidNickname = isValidNickname;

  function createLazyManager(config) {
    let instance;
    let loading;
    let settings = {};
    let autoEnabled = true;
    let cancelButtonWait;
    const context = {
      get currentSettings() { return currentSettings; },
      get automaticCalculationEnabled() { return startupReady && autoEnabled && !(sakaiCompatible() && config.file === 'online'); },
      get ipDetailsCache() { return ipDetailsCache; },
      openOverlay, closeOverlay, setupDateShortcuts, fetchWithRetry, logOptions, isValidNickname,
      runWhenElementExists, getIpCellFromRow, parseAllIpsFromCell,
      calculateHaversineDistance, setupNickCounter, loadIpDetailsCache
    };
    const enabled = () => currentSettings['extension-toggle'] !== false && settings.tools?.[config.feature] !== false &&
      (config.file !== 'analytics' || settings.tools?.similarIPsFinder !== false || settings.tools?.actionRepeatsFinder !== false);
    function load() {
      if (!loading) {
        loading = import(chrome.runtime.getURL('content/modules/' + config.file + '.js')).then(module => {
          instance = module.create(context);
          instance.init(settings);
          return instance;
        }).catch(error => {
          loading = null;
          window.ArizonaNotifications.show('Не удалось загрузить инструмент. Повторите попытку.', 'error');
          throw error;
        });
      }
      return loading;
    }
    function checkAutoCalculation() {
      if (!context.automaticCalculationEnabled) return;
      if (!enabled() || !config.auto || new URLSearchParams(location.search).get(config.auto) !== '1') return;
      load().then(manager => {
        if (enabled()) manager.checkAutoCalculation?.();
      }).catch(() => {});
    }
    function update() {
      cancelButtonWait?.();
      if (instance) {
        instance.updateSettings(settings);
        return;
      }
      if (config.id) {
        if (!enabled()) document.getElementById(config.id)?.remove();
        else cancelButtonWait = runWhenElementExists('.filter-buttons', container => {
          if (!enabled() || document.getElementById(config.id)) return;
          const button = document.createElement('button');
          button.id = config.id;
          button.type = 'button';
          button.className = 'btn btn-success';
          button.style.marginLeft = '10px';
          button.innerHTML = `<i class="fa-solid ${config.icon}" style="margin-right: 6px;"></i> ${config.label}`;
          button.onclick = () => {
            button.disabled = true;
            load().then(manager => { if (enabled()) return manager.openModal(); })
              .catch(() => {}).finally(() => { button.disabled = false; });
          };
          container.appendChild(button);
        });
      }
      checkAutoCalculation();
    }
    return new Proxy({
      init(value) {
        autoEnabled = value?.tools?.[config.feature] !== false;
        settings = config.file === 'forms' ? value || {} : toolSettings(value || {});
        update();
      },
      updateSettings(value) {
        autoEnabled = value?.tools?.[config.feature] !== false;
        settings = config.file === 'forms' ? value || {} : toolSettings(value || {});
        update();
      },
      update, checkAutoCalculation
    }, {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => {
          if (!enabled()) return Promise.resolve();
          return load().then(manager => enabled() ? manager[key]?.(...args) : undefined);
        };
      }
    });
  }

  async function loadIpDetailsCache() {
    const ips = new Set();
    for (const row of document.querySelectorAll('table.table tbody tr')) {
      for (const pair of parseAllIpsFromCell(getIpCellFromRow(row))) {
        if (pair.lastIp) ips.add(pair.lastIp);
        if (pair.regIp) ips.add(pair.regIp);
      }
    }
    const response = await window.ArizonaUtils.sendMessageToBackground({ action: 'get_cached_ips', ips: [...ips] });
    for (const [ip, data] of Object.entries(response?.data || {})) saveIpToCaches(ip, data);
  }

  const rowIndex = window.ArizonaRuntime.createRowIndex();
  const ipCellCache = new WeakMap();
  const runWhenElementExists = window.ArizonaRuntime.waitFor;

  function openOverlay(overlay) {
    // Templates historically included a second full-screen overlay. Keep one
    // overlay so focus management and sibling popovers share a stacking context.
    const nested = overlay.firstElementChild;
    if (nested?.classList.contains('alh-modal-overlay') && overlay.children.length === 1) {
      if (nested.id) overlay.id = nested.id;
      overlay.replaceChildren(...nested.childNodes);
    }
    overlay.arzScrollPosition = {left:window.scrollX,top:window.scrollY};
    overlay.arzLogController = new AbortController();
    document.body.appendChild(overlay);
    const requestClose = () => {
      // Reuse cancel handlers: progress dialogs also stop their processing loops.
      const cancel = [...overlay.querySelectorAll('button')].find(button => /cancel/.test(button.id) && !button.disabled);
      const close = cancel || overlay.querySelector('.alh-modal-close-btn');
      if (close?.onclick && !close.disabled) close.click();
      else closeOverlay(overlay);
    };
    window.ArizonaModalControls?.mount(overlay, requestClose);
    overlay.getBoundingClientRect();
    overlay.classList.add('open-active');
    document.body.classList.add('arz-modal-open');

    let backdropDown = false;
    overlay.addEventListener('pointerdown', e => { backdropDown = e.target === overlay; });
    overlay.addEventListener('click', e => {
      if (e.target === overlay && backdropDown) {
        const top = [...document.querySelectorAll('.alh-modal-overlay.open-active')].at(-1);
        if (top === overlay) requestClose();
      }
      backdropDown = false;
    });
  }

  function closeOverlay(overlay) {
    if (overlay.classList.contains('closing')) return;
    window.ArizonaModalControls?.unmount(overlay);
    overlay.arzLogController?.abort();
    overlay.classList.remove('open-active');
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.remove();
      const openOverlays = document.querySelectorAll('.alh-modal-overlay.open-active');
      const filterModal = document.querySelector('.arz-filter-modal');
      const isFilterOpen = filterModal && filterModal.style.display === 'flex';
      if (openOverlays.length === 0 && !isFilterOpen) {
        document.body.classList.remove('arz-modal-open');
        if (overlay.arzScrollPosition) window.scrollTo({...overlay.arzScrollPosition,behavior:'instant'});
      }
    }, 250);
  }

  function formatLocalDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function setupDateShortcuts(container, dateFromId, dateToId) {
    container.querySelectorAll('.arz-btn-shortcut').forEach(btn => {
      btn.onclick = () => {
        const range = btn.dataset.range;
        const toDate = new Date();
        let fromDate = new Date();

        if (range === 'day') {
        } else if (range === 'week') {
          fromDate.setDate(toDate.getDate() - 6);
        } else if (range === 'month') {
          fromDate.setMonth(toDate.getMonth() - 1);
        } else if (range === 'start-week') {
          const day = fromDate.getDay();
          const diff = fromDate.getDate() - day + (day === 0 ? -6 : 1);
          fromDate.setDate(diff);
        } else if (range === 'start-month') {
          fromDate.setDate(1);
        } else if (range === 'start-year') {
          fromDate.setMonth(0, 1);
        }

        const dateFromInput = container.querySelector('#' + dateFromId);
        const dateToInput = container.querySelector('#' + dateToId);
        if (dateFromInput) dateFromInput.value = formatLocalDate(fromDate);
        if (dateToInput) dateToInput.value = formatLocalDate(toDate);
      };
    });
  }

  function logOptions(overlay) {
    return {
      signal: overlay.arzLogController?.signal,
      onWait: text => {
        const status = overlay.querySelector('[id$="status"], #arz-multi-progress-text');
        if (status) status.textContent = text;
      }
    };
  }

  async function fetchWithRetry(url, options = {}) {
    return window.ArizonaLogRequests.request(url, options);
  }

  function writeToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          resolve();
        } else {
          reject(new Error('execCommand copy failed'));
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  class LogAnonymizer {
    constructor() {
      this.reset();
    }

    reset() {
      this.nickMap = new Map();
      this.nickRevMap = new Map();
      this.ipMap = new Map();
      this.ipRevMap = new Map();
      this.moneyMap = new Map();
      this.moneyRevMap = new Map();
      this.dateMap = new Map();
      this.dateRevMap = new Map();

      this.nickCounter = 0;
      this.ipCounter = 0;
      this.moneyCounter = 0;
      this.dateCounter = 0;
      this.baseDate = new Date('2020-01-01T00:00:00');
    }

    exportState() {
      return {
        nickMap: Object.fromEntries(this.nickMap),
        nickRevMap: Object.fromEntries(this.nickRevMap),
        ipMap: Object.fromEntries(this.ipMap),
        ipRevMap: Object.fromEntries(this.ipRevMap),
        moneyMap: Object.fromEntries(this.moneyMap),
        moneyRevMap: Object.fromEntries(this.moneyRevMap),
        dateMap: Object.fromEntries(this.dateMap),
        dateRevMap: Object.fromEntries(this.dateRevMap),
        nickCounter: this.nickCounter,
        ipCounter: this.ipCounter,
        moneyCounter: this.moneyCounter,
        dateCounter: this.dateCounter
      };
    }

    importState(state) {
      if (!state) return;
      this.nickMap = new Map(Object.entries(state.nickMap || {}));
      this.nickRevMap = new Map(Object.entries(state.nickRevMap || {}));
      this.ipMap = new Map(Object.entries(state.ipMap || {}));
      this.ipRevMap = new Map(Object.entries(state.ipRevMap || {}));
      this.moneyMap = new Map(Object.entries(state.moneyMap || {}));
      this.moneyRevMap = new Map(Object.entries(state.moneyRevMap || {}));
      this.dateMap = new Map(Object.entries(state.dateMap || {}));
      this.dateRevMap = new Map(Object.entries(state.dateRevMap || {}));
      this.nickCounter = state.nickCounter || 0;
      this.ipCounter = state.ipCounter || 0;
      this.moneyCounter = state.moneyCounter || 0;
      this.dateCounter = state.dateCounter || 0;
    }

    getFakeNickname(realName) {
      if (this.nickMap.has(realName)) {
        return this.nickMap.get(realName);
      }
      this.nickCounter++;
      const fakeName = `Fake_Player_${this.nickCounter}`;
      this.nickMap.set(realName, fakeName);
      this.nickRevMap.set(fakeName, realName);
      return fakeName;
    }

    getFakeIP(realIP) {
      if (this.ipMap.has(realIP)) {
        return this.ipMap.get(realIP);
      }
      this.ipCounter++;
      const fakeIP = `10.0.0.${this.ipCounter}`;
      this.ipMap.set(realIP, fakeIP);
      this.ipRevMap.set(fakeIP, realIP);
      return fakeIP;
    }

    getFakeMoney(realMoneyStr, currency) {
      const key = realMoneyStr + ' ' + currency;
      if (this.moneyMap.has(key)) {
        return this.moneyMap.get(key);
      }
      this.moneyCounter++;
      const baseVal = this.moneyCounter * 250000;
      const fakeMoneyStr = baseVal.toLocaleString('en-US');
      const fakeVal = `${fakeMoneyStr} ${currency}`;
      this.moneyMap.set(key, fakeVal);
      this.moneyRevMap.set(fakeVal, realMoneyStr + ' ' + currency);
      return fakeVal;
    }

    getFakeDate(realDateStr) {
      if (this.dateMap.has(realDateStr)) {
        return this.dateMap.get(realDateStr);
      }
      this.dateCounter++;
      const newDate = new Date(this.baseDate.getTime() + this.dateCounter * 60000);
      const pad = (num) => String(num).padStart(2, '0');
      const fakeDateStr = `${newDate.getFullYear()}-${pad(newDate.getMonth() + 1)}-${pad(newDate.getDate())} ` +
        `${pad(newDate.getHours())}:${pad(newDate.getMinutes())}:${pad(newDate.getSeconds())}`;
      this.dateMap.set(realDateStr, fakeDateStr);
      this.dateRevMap.set(fakeDateStr, realDateStr);
      return fakeDateStr;
    }

    anonymizeCyrillicNames(query) {
      if (!query) return query;
      let result = query;
      const nicks = Array.from(this.nickMap.keys());
      if (nicks.length === 0) return query;

      const nickPhonetics = nicks.map(realName => {
        const parts = realName.split('_');
        return {
          realName: realName,
          fakeName: this.nickMap.get(realName),
          firstPhonetic: normalizePhonetic(parts[0]),
          lastPhonetic: normalizePhonetic(parts[1] || ''),
          fullPhonetic: normalizePhonetic(parts[0] + (parts[1] || ''))
        };
      });

      function normalizePhonetic(str) {
        if (!str) return '';
        let s = str.toLowerCase();
        const cyrToLat = {
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
          'з': 'z', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
          'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
          'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
          'я': 'ya'
        };
        let res = '';
        for (let i = 0; i < s.length; i++) {
          const char = s[i];
          if (cyrToLat[char] !== undefined) {
            res += cyrToLat[char];
          } else {
            res += char;
          }
        }
        res = res
          .replace(/ph/g, 'f')
          .replace(/th/g, 't')
          .replace(/kh/g, 'h')
          .replace(/oo/g, 'u')
          .replace(/ee/g, 'i')
          .replace(/ck/g, 'k')
          .replace(/c/g, 'k')
          .replace(/y/g, 'i')
          .replace(/x/g, 'ks')
          .replace(/w/g, 'v')
          .replace(/([a-z])\1+/g, '$1');
        return res.replace(/[^a-z0-9]/g, '');
      }

      const cyrWordRegex = /[а-яА-ЯёЁ]+/g;
      const words = [];
      let match;
      while ((match = cyrWordRegex.exec(query)) !== null) {
        words.push({
          text: match[0],
          index: match.index,
          length: match[0].length
        });
      }

      for (let i = 0; i < words.length - 1; i++) {
        const w1 = words[i];
        const w2 = words[i + 1];
        const intermediateText = query.substring(w1.index + w1.length, w2.index);
        if (intermediateText.length > 5 || /[\w]/.test(intermediateText)) continue;

        const combinedCyrillic = w1.text + w2.text;
        const combinedPhonetic = normalizePhonetic(combinedCyrillic);

        const found = nickPhonetics.find(np => {
          const lenDiff = Math.abs(np.fullPhonetic.length - combinedPhonetic.length);
          if (lenDiff > 2) return false;
          return np.fullPhonetic.startsWith(combinedPhonetic.substring(0, Math.min(np.fullPhonetic.length - 1, combinedPhonetic.length))) ||
            combinedPhonetic.startsWith(np.fullPhonetic.substring(0, Math.min(combinedPhonetic.length - 1, np.fullPhonetic.length)));
        });

        if (found) {
          result = result.substring(0, w1.index) + found.fakeName + result.substring(w2.index + w2.length);
          return this.anonymizeCyrillicNames(result);
        }
      }

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const wordPhonetic = normalizePhonetic(w.text);
        if (wordPhonetic.length < 3) continue;

        const found = nickPhonetics.find(np => {
          return (np.firstPhonetic.length >= 3 && (np.firstPhonetic.startsWith(wordPhonetic) || wordPhonetic.startsWith(np.firstPhonetic))) ||
            (np.lastPhonetic.length >= 3 && (np.lastPhonetic.startsWith(wordPhonetic) || wordPhonetic.startsWith(np.lastPhonetic)));
        });

        if (found) {
          result = result.substring(0, w.index) + found.fakeName + result.substring(w.index + w.length);
          return this.anonymizeCyrillicNames(result);
        }
      }

      return result;
    }

    anonymize(text) {
      let result = this.anonymizeCyrillicNames(text);

      const nickRegex = /\b[A-Z][a-zA-Z0-9]*_[A-Z][a-zA-Z0-9]*\b/g;
      const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
      const dateRegex = /\b\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\b|\b\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}\b/g;
      const moneyRegex = /\b\d{1,3}(?:[,\s]\d{3})*(?:\s*(?:\$|руб|VC\$))(?!\w)/g;
      const datesFound = [];
      result = result.replace(dateRegex, (match) => {
        const fake = this.getFakeDate(match);
        datesFound.push(fake);
        return `__DATE_${datesFound.length - 1}__`;
      });

      const ipsFound = [];
      result = result.replace(ipRegex, (match) => {
        const fake = this.getFakeIP(match);
        ipsFound.push(fake);
        return `__IP_${ipsFound.length - 1}__`;
      });

      const moneyFound = [];
      result = result.replace(moneyRegex, (match) => {
        const numPart = match.replace(/[^\d,\s]/g, '').trim();
        const currPart = match.replace(/[\d,\s]/g, '').trim();
        const fake = this.getFakeMoney(numPart, currPart);
        moneyFound.push(fake);
        return `__MONEY_${moneyFound.length - 1}__`;
      });

      const nicksFound = [];
      result = result.replace(nickRegex, (match) => {
        const fake = this.getFakeNickname(match);
        nicksFound.push(fake);
        return `__NICK_${nicksFound.length - 1}__`;
      });

      result = result.replace(/__DATE_(\d+)__/g, (m, idx) => datesFound[parseInt(idx)]);
      result = result.replace(/__IP_(\d+)__/g, (m, idx) => ipsFound[parseInt(idx)]);
      result = result.replace(/__MONEY_(\d+)__/g, (m, idx) => moneyFound[parseInt(idx)]);
      result = result.replace(/__NICK_(\d+)__/g, (m, idx) => nicksFound[parseInt(idx)]);

      return result;
    }

    deanonymize(fakeText) {
      let result = fakeText;

      const fakeNicks = Array.from(this.nickRevMap.keys()).sort((a, b) => b.length - a.length);
      fakeNicks.forEach(fake => {
        const real = this.nickRevMap.get(fake);
        const escaped = fake.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), real);
      });

      const fakeDates = Array.from(this.dateRevMap.keys()).sort((a, b) => b.length - a.length);
      fakeDates.forEach(fake => {
        const real = this.dateRevMap.get(fake);
        const parts = fake.split(' ');
        if (parts.length === 2) {
          const datePart = parts[0];
          const timePart = parts[1];
          const escapedDate = datePart.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const escapedTime = timePart.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const flexibleRegex = new RegExp(escapedDate + '(\\s*(?:в|at|,|-)?\\s*)' + escapedTime, 'g');
          result = result.replace(flexibleRegex, real);
        } else {
          const escaped = fake.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          result = result.replace(new RegExp(escaped, 'g'), real);
        }
      });

      const fakeMoney = Array.from(this.moneyRevMap.keys()).sort((a, b) => b.length - a.length);
      fakeMoney.forEach(fake => {
        const real = this.moneyRevMap.get(fake);
        const escaped = fake.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), real);
      });

      const fakeIPs = Array.from(this.ipRevMap.keys()).sort((a, b) => b.length - a.length);
      fakeIPs.forEach(fake => {
        const real = this.ipRevMap.get(fake);
        const escaped = fake.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        result = result.replace(new RegExp(escaped, 'g'), real);
      });

      return result;
    }
  }

  function copyTextToClipboard(text, element) {
    writeToClipboard(text).then(() => {
      const originalColor = element.style.color;
      const originalBorder = element.style.borderBottom;

      element.style.color = '#28c76f';
      element.style.borderBottom = '1px solid #28c76f';

      setTimeout(() => {
        element.style.color = originalColor;
        element.style.borderBottom = originalBorder;
      }, 1000);
    }).catch(err => {
      console.error('Failed to copy snippet:', err);
    });
  }

  const getCleanCellText = (cell, isIpCell = false) => {
    if (!cell) return '';
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.arz-row-actions-wrapper, .arz-cell-copy-btn, .arz-log-copy-menu-btn, .alh-col-eye-btn, .badge, .bi, svg, i, .az-geo-inserted, .arz-geo-inserted, .arz-dup-badge, button, .arizona-ecosystem-badge').forEach(el => el.remove());
    let text = clone.textContent;
    if (!isIpCell) {
      const ipGeoRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?:\s*\([^)]*\))?(?:\s*~\d+(?:\.\d+)?km)?/g;
      text = text.replace(ipGeoRegex, '');
    }
    return text.replace(/\s+/g, ' ').trim();
  };

  function copyRowToClipboard(tr, btn) {
    const date = getCleanCellText(tr.cells[0]);
    const action = getCleanCellText(tr.cells[1]);
    const data = getCleanCellText(tr.cells[2]);
    const ip = getCleanCellText(tr.cells[3], true);

    const parts = [date, action, data, ip].map(x => x.trim());
    while (parts.length > 0 && !parts[parts.length - 1]) {
      parts.pop();
    }
    const cleanText = parts.join(' | ');

    writeToClipboard(cleanText).then(() => {
      btn.classList.add('copied');
      const icon = btn.querySelector('i');
      icon.className = 'fa-solid fa-check';
      setTimeout(() => {
        btn.classList.remove('copied');
        icon.className = 'fa-regular fa-copy';
      }, 1000);
    }).catch(err => {
      console.error('Failed to copy row:', err);
    });
  }

  function copyCellText(cell, btn) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('.arz-row-actions-wrapper, .arz-cell-copy-btn, .arz-log-copy-menu-btn, .alh-col-eye-btn, .badge, .bi, svg, i, .az-geo-inserted, .arz-geo-inserted, .arz-dup-badge, button, .arizona-ecosystem-badge').forEach(el => el.remove());
    let text = clone.textContent;
    const isIpCell = cell.cellIndex === 3;
    if (!isIpCell) {
      const ipGeoRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?:\s*\([^)]*\))?(?:\s*~\d+(?:\.\d+)?km)?/g;
      text = text.replace(ipGeoRegex, '');
    }
    const textToCopy = text.replace(/\s+/g, ' ').trim();

    writeToClipboard(textToCopy).then(() => {
      btn.classList.add('copied');
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = 'fa-solid fa-check';
      }
      setTimeout(() => {
        btn.classList.remove('copied');
        if (icon) {
          icon.className = 'fa-regular fa-copy';
        }
      }, 1000);
    }).catch(err => {
      console.error('Failed to copy cell text:', err);
    });
  }


  function lazyInjectCopyBtn(tr) {
    if (!tr.cells[1]) return;
    if (tr.getAttribute('data-arz-copy-btn-injected') === 'true') return;

    tr.setAttribute('data-arz-copy-btn-injected', 'true');

    const cell = tr.cells[1];
    if (cell.querySelector('.arz-log-copy-menu-btn')) return;


    const copyBtn = document.createElement('span');
    copyBtn.setAttribute('role', 'button');
    copyBtn.className = 'arz-log-copy-menu-btn';
    copyBtn.title = 'Копировать...';
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    copyBtn.tabIndex = 0;
    cell.appendChild(copyBtn);
  }

  function activateRowCopy(event) {
    const button = event.target.closest?.('.arz-log-copy-menu-btn');
    if (!button || currentSettings['extension-toggle'] === false) return;
    if (event.type === 'keydown' && !['Enter',' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    window.ArizonaCopyPopupMenu.open(event, button.closest('tr'));
  }
  document.addEventListener('click', activateRowCopy);
  document.addEventListener('keydown', activateRowCopy);

  function handleRowHover(e) {
    if (document.body.classList.contains('arz-extension-disabled')) return;

    const tr = e.target.closest('table.table tbody tr');
    if (!tr || tr.contains(e.relatedTarget)) return;

    lazyInjectCopyBtn(tr);
  }

  function initCopyButtonsLazy(settings) {
    document.querySelectorAll('.arz-row-actions-wrapper').forEach(node => node.remove());
    const isEnabled = settings['extension-toggle'] !== false &&
      settings['tweak-copy-btn-visibility'] !== 'off';
    document.querySelector('table.table')?.classList.toggle('alh-copy-gutter', isEnabled);
    if (!isEnabled) {
      document.removeEventListener('mouseover', handleRowHover);
      document.querySelectorAll('.arz-log-copy-menu-btn').forEach(btn => btn.remove());
      document.querySelectorAll('tr[data-arz-copy-btn-injected="true"]').forEach((tr) => {
        tr.removeAttribute('data-arz-copy-btn-injected');
        const cell = tr.cells?.[1];
        if (cell) {
          cell.style.removeProperty('position');
          cell.style.removeProperty('padding-right');
        }
      });
      return;
    }

    const visibilityMode = settings['tweak-copy-btn-visibility'] || 'hover';

    if (visibilityMode === 'always' && isInitialized) refreshRowControls();

    document.removeEventListener('mouseover', handleRowHover);
    document.addEventListener('mouseover', handleRowHover, { passive: true });
  }

  function getIpCellFromRow(tr) {
    if (!tr || !tr.cells) return null;
    if (tr.cells[3] && (tr.cells[3].querySelector('.table-ip') || /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(tr.cells[3].textContent))) {
      return tr.cells[3];
    }
    if (tr.cells[2] && (tr.cells[2].querySelector('.table-ip') || /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(tr.cells[2].textContent))) {
      return tr.cells[2];
    }
    for (let i = 1; i < tr.cells.length; i++) {
      if (tr.cells[i] && tr.cells[i].querySelector('.table-ip')) return tr.cells[i];
    }
    return tr.cells[3] || null;
  }

  function highlightIdenticalIps(tr) {
    if (!arizonaSettings.tools?.identicalIPs) return;
    const ipCell = getIpCellFromRow(tr);
    if (!ipCell) return;
    const links = ipCell.querySelectorAll('a[title="последний"], [title*="последний"], .badge-secondary');
    if (links.length < 2) return;
    const ips = Array.from(links).map(l => l.textContent.trim());
    const hasDup = ips.some((ip, idx) => ips.indexOf(ip) !== idx);
    const col = arizonaSettings.tools.identicalIPsColor || '#ff4444';
    if (hasDup) {
      tr.style.color = col;
      links.forEach(l => l.style.color = col);
    } else {
      tr.style.color = '';
      links.forEach(l => l.style.color = '');
    }
  }

  let cachedTuningPatterns = null;
  let cachedTuningPatternString = null;

  function getTuningPatterns() {
    const patternStr = arizonaSettings.tuningParts?.timePattern || '';
    if (cachedTuningPatternString === patternStr && cachedTuningPatterns !== null) {
      return cachedTuningPatterns;
    }
    cachedTuningPatternString = patternStr;
    cachedTuningPatterns = patternStr.split(',')
      .map(p => p.trim())
      .filter(p => /^\d{2}:\d{2}$/.test(p));
    return cachedTuningPatterns;
  }

  function highlightTuningAHK(tr) {
    if (currentSettings['extension-toggle'] === false || !arizonaSettings.tuningParts?.enabled) return;
    const timeCell = tr.cells[0];
    const actCell = tr.cells[1];
    if (!timeCell || !actCell) return;

    const KEYWORDS = ['тонировка', 'цвет фар', 'установка', 'изменение', 'улучшение', 'прошивка', 'перекраска', 'обклейка'];
    const text = actCell.textContent.toLowerCase();
    const isTuning = KEYWORDS.some(k => text.includes(k));
    const timeMatch = timeCell.textContent.match(/(\d{2}):(\d{2}):(\d{2})/);
    const timeStr = timeMatch ? `${timeMatch[2]}:${timeMatch[3]}` : '';

    const patterns = getTuningPatterns();
    const matchTime = timeStr && (patterns.length === 0 || patterns.includes(timeStr));

    const col = arizonaSettings.tuningParts.highlightColor || '#f02849';
    const w = arizonaSettings.tuningParts.outlineWidth || 2;

    if (isTuning && (matchTime || !arizonaSettings.tuningParts.highlightOnlyMatching)) {
      if (sakaiCompatible()) {
        tr.classList.add('alh-tuning-match');
        tr.style.setProperty('--alh-tuning-outline', `${w}px solid ${col}`);
        return true;
      }
      tr.style.outline = `${w}px solid ${col}`;
      return true;
    } else {
      if (sakaiCompatible()) tr.classList.remove('alh-tuning-match');
      else tr.style.outline = '';
      return false;
    }
  }

  function handleTuningAutoScroll() {
    if (arizonaSettings.tuningParts?.enabled && arizonaSettings.tuningParts.autoScrollToMatch) {
      const match = document.querySelector('tbody tr[style*="outline"]');
      if (match) {
        match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  document.addEventListener('click', event => {
    if (currentSettings['extension-toggle'] === false) return;
    const handle = event.target.closest('.arz-row-mark-handle');
    if (!handle) return;
    const row = handle.closest('tr');
    if (!row) return;
    event.stopPropagation();
    event.preventDefault();
    const marked = row.classList.toggle('arz-row-marked');
    window.ArizonaNotifications.show(marked ? 'Лог отмечен' : 'Метка снята', marked ? 'success' : 'info');
  });

  document.addEventListener('change', event => {
    if (currentSettings['extension-toggle'] === false || !event.target.matches('.arz-row-checkbox')) return;
    const row = event.target.closest('tr');
    if (!row) return;
    event.stopPropagation();
    row.classList.toggle('arz-row-selected', event.target.checked);
    window.ArizonaMultiSelectManager.updateBarVisibility();
  });

  function injectMarkHandle(tr) {
    if (!tr || !tr.cells || !tr.cells[0]) return;
    const firstCell = tr.cells[0];
    if (firstCell.querySelector('.arz-row-mark-handle')) return;

    firstCell.style.setProperty('position', 'relative', 'important');
    firstCell.style.setProperty('padding-left', '14px', 'important');
    const handle = document.createElement('div');
    handle.className = 'arz-row-mark-handle';
    handle.title = 'Отметить / снять метку с лога';

    firstCell.insertBefore(handle, firstCell.firstChild);
  }

  function removeMarkHandle(tr) {
    const handle = tr?.querySelector('.arz-row-mark-handle');
    if (handle) handle.remove();
    if (tr?.cells?.[0]) {
      tr.cells[0].style.removeProperty('position');
      tr.cells[0].style.removeProperty('padding-left');
    }
  }

  let rowControlsObserver = null;
  const pendingRowControls = new Set();
  let rowControlsTask = null;
  function scheduleRowControls() {
    if (rowControlsTask !== null || !pendingRowControls.size) return;
    rowControlsTask = window.ArizonaRuntime.scheduleFrame(() => {
      rowControlsTask = null;
      const deadline = performance.now() + 4;
      window.ArizonaObservers.write(() => {
        for (const row of pendingRowControls) {
          pendingRowControls.delete(row);
          if (row.isConnected && currentSettings['extension-toggle'] !== false) {
            if (arizonaSettings.tools?.markLogsEnabled !== false) injectMarkHandle(row);
            window.ArizonaMultiSelectManager.injectCheckbox(row);
            if (currentSettings['tweak-copy-btn-visibility'] === 'always') lazyInjectCopyBtn(row);
          }
          if (performance.now() >= deadline) break;
        }
      });
      scheduleRowControls();
    });
  }

  function observeRowControls(row) {
    if (currentSettings['extension-toggle'] === false) return;
    if (!rowControlsObserver) {
      rowControlsObserver = window.ArizonaRuntime.createRowObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting || !entry.target.isConnected) continue;
          pendingRowControls.add(entry.target);
          rowControlsObserver.unobserve(entry.target);
        }
        scheduleRowControls();
      });
    }
    rowControlsObserver.observe(row);
  }

  function refreshRowControls() {
    for (const row of document.querySelectorAll('table.table tbody tr')) observeRowControls(row);
  }

  const logDataFields = {
    'ID аккаунта': 'id', 'VC$': 'vc',
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`Доп. счёт №${i + 1}`, `account${i + 1}`])),
    'Депозит': 'deposit', 'Уровень администрирования': 'admin'
  };
  const logDataHeaders = new WeakMap();
  const logDataCells = new WeakMap();
  const logDataSources = new WeakMap();
  const logDataTableSettings = new WeakMap();
  const logDataSettingKeys = ['extension-toggle', 'tweak-log-data', 'tweak-log-labels', 'tweak-log-layout', 'tweak-log-separator', 'tweak-log-accounts-total', 'tweak-log-hide-zero', 'tweak-log-hide-minus', ...Object.values(logDataFields).map(key => `tweak-log-${key}`)];
  let logDataSettingsRef;
  let logDataSettingsSignature;
  function logDataSignature() {
    if (logDataSettingsRef !== currentSettings) {
      logDataSettingsRef = currentSettings;
      logDataSettingsSignature = logDataSettingKeys.map(key => currentSettings[key]).join('|');
    }
    return logDataSettingsSignature;
  }

  function updateLogDataHeader(table) {
    if (!table) return;
    const signature = logDataSignature();
    if (logDataTableSettings.get(table) === signature) return;
    const description = table.tHead?.rows[0]?.cells[2]?.querySelector('.table-description');
    logDataTableSettings.set(table, signature);
    if (!description) return;
    const enabled = currentSettings['extension-toggle'] !== false && currentSettings['tweak-log-data'];
    description.classList.toggle('arz-log-data-description', !!enabled);
    table.classList.toggle('arz-log-data-expanded', !!enabled);
    if (!enabled) {
      const original = logDataHeaders.get(description);
      if (original) {
        description.replaceChildren(...original);
        logDataHeaders.delete(description);
      }
      return;
    }
    if (!logDataHeaders.has(description)) logDataHeaders.set(description, Array.from(description.childNodes));
    const extra = Object.entries(logDataFields)
      .filter(([, key]) => currentSettings[`tweak-log-${key}`] === true)
      .map(([label]) => label);
    if (currentSettings['tweak-log-accounts-total']) extra.push('Баланс всех доп. счетов');
    const text = ['Деньги / Банк / Донат', ...extra].join(' / ');
    if (description.textContent !== text) description.textContent = text;
  }

  function renderLogData(row) {
    const cell = row.cells?.[2];
    if (!cell) return;
    updateLogDataHeader(row.closest('table'));
    const signature = logDataSignature();
    const previous = logDataCells.get(cell);
    if (previous?.signature === signature && previous.text === cell.textContent && previous.first === cell.firstChild) return;
    cell.querySelectorAll('.arz-log-data-extra, .arz-log-data-label, .arz-log-data-unit, .arz-log-data-separator').forEach(node => node.remove());
    if (currentSettings['extension-toggle'] === false || !currentSettings['tweak-log-data']) {
      logDataCells.set(cell, { signature, text: cell.textContent, first: cell.firstChild });
      return;
    }
    const fields = logDataFields;
    let hasFirstPlayer = false;
    for (const hidden of cell.querySelectorAll('.app__hidden[data-title="Дополнительная информация"]')) {
      let button = hidden.previousElementSibling;
      if (!button?.classList.contains('js_entry_format_button')) continue;
      const codes = [];
      let node = button.previousSibling;
      while (node && node.nodeName !== 'BR') {
        if (node.nodeType === 1 && node.tagName === 'CODE') codes.unshift(node);
        node = node.previousSibling;
      }
      if (codes.length < 4 || !/^(I|II):$/.test(codes[0].textContent.trim())) continue;
      const player = codes[0].textContent.trim();
      if (player === 'II:' && hasFirstPlayer && currentSettings['tweak-log-separator']) {
        const separator = document.createElement('hr');
        separator.className = 'arz-log-data-separator';
        codes[0].before(separator);
      }
      if (player === 'I:') hasFirstPlayer = true;
      if (currentSettings['tweak-log-labels']) {
        codes.slice(1, 4).forEach((code, i) => {
          const unit = document.createElement('span');
          unit.className = 'arz-log-data-unit';
          unit.textContent = i === 2 ? ' AZ' : ' SA$';
          code.append(unit);
        });
      }
      const values = [];
      let accountsTotal = 0n;
      let accountsCount = 0;
      const sourceText = hidden.textContent;
      let source = logDataSources.get(hidden);
      if (source?.text !== sourceText) {
        source = { text: sourceText, values: Array.from(hidden.querySelectorAll('li'), item => ({
          value: item.querySelector('code')?.textContent.trim(),
          label: Array.from(item.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim().replace(/:\s*$/, '')
        })) };
        logDataSources.set(hidden, source);
      }
      for (const { value, label } of source.values) {
        if (fields[label]?.startsWith('account') && value) {
          const normalized = value.replace(/[,\s\u00a0]/g, '');
          if (/^\d+$/.test(normalized)) {
            accountsTotal += BigInt(normalized);
            accountsCount++;
          }
        }
        if (!fields[label] || currentSettings[`tweak-log-${fields[label]}`] !== true || !value) continue;
        if (currentSettings['tweak-log-hide-zero'] && /^0+$/.test(value)) continue;
        if (currentSettings['tweak-log-hide-minus'] && value === '-1') continue;
        const code = document.createElement('code');
        code.className = 'arz-log-data-value';
        code.dataset.field = fields[label];
        code.title = label;
        const field = fields[label];
        code.textContent = field === 'id' ? `ID: ${value}` : field === 'vc' ? value + (currentSettings['tweak-log-labels'] ? ' VC$' : '') : field === 'deposit' || field.startsWith('account') ? value + (currentSettings['tweak-log-labels'] ? ' SA$' : '') : field === 'admin' ? `${value} lvl` : value;
        values.push(code);
      }
      if (currentSettings['tweak-log-accounts-total'] && accountsCount && !(currentSettings['tweak-log-hide-zero'] && accountsTotal === 0n)) {
        const total = document.createElement('code');
        total.className = 'arz-log-data-value';
        total.dataset.field = 'accounts-total';
        total.title = 'Баланс всех доп. счетов';
        total.textContent = accountsTotal.toLocaleString('en-US') + (currentSettings['tweak-log-labels'] ? ' SA$' : '');
        values.push(total);
      }
      if (values.length) {
        const extra = document.createElement('span');
        extra.className = 'arz-log-data-extra';
        if (currentSettings['tweak-log-layout'] === 'inline') extra.append(' / ');
        values.forEach((value, index) => {
          if (index) extra.append(' / ');
          extra.append(value);
        });
        if (currentSettings['tweak-log-layout'] !== 'inline') extra.style.display = 'block';
        if (currentSettings['tweak-log-layout'] === 'inline') {
          extra.append(' ');
          button.before(extra);
        } else {
          hidden.after(extra);
        }
      }
    }
    logDataCells.set(cell, { signature, text: cell.textContent, first: cell.firstChild });
  }

  function processRow(tr, reason = 1) {
    if (reason === 2) {
      window.ArizonaInventoryLogs?.processRow(tr);
      return;
    }
    if (reason === 4) {
      renderLogData(tr);
      return;
    }
    if (!tr || !tr.cells || !tr.cells[1]) return;

    if (window.ArizonaMaskingManager && typeof window.ArizonaMaskingManager.maskRow === 'function') {
      window.ArizonaMaskingManager.maskRow(tr);
    }

    renderLogData(tr);
    observeRowControls(tr);

    try { highlightIdenticalIps(tr); } catch (e) { }
    try { highlightTuningAHK(tr); } catch (e) { }
    window.ArizonaInventoryLogs?.processRow(tr);

    const isEnabled = currentSettings['extension-toggle'] !== false;
    const isIpEnabled = isEnabled && (currentSettings['tweak-ip-info'] || arizonaSettings.ipLookupEnabled);
    if (isIpEnabled) {
      try {
        reserveInlineGeoText(tr, parseAllIpsFromCell(getIpCellFromRow(tr)));
        if (currentSettings['tweak-ip-info']) injectIpPlaceholder(tr);
        const observer = getIpRowObserver();
        if (observer) {
          const processed = tr.getAttribute('data-arz-ip-processed');
          if (processed !== 'true' && processed !== 'pending') {
            observer.observe(tr);
          }
        }
      } catch (e) {
        console.error('Error processing IP for row:', e);
      }
    }

  }

  window.ArizonaCopyPopupMenu = (function () {
    let currentPopup = null;

    function close() {
      if (currentPopup) {
        currentPopup.classList.remove('open');
        currentPopup.classList.add('closing');
        const pop = currentPopup;
        setTimeout(() => pop.remove(), 200);
        currentPopup = null;
      }
    }

    function getNicknamesFromRow(tr) {
      const nicks = [];
      const actionCell = tr.cells ? tr.cells[1] : null;
      if (!actionCell) return nicks;

      actionCell.querySelectorAll('a[href*="player="], a[href*="player"]').forEach(lnk => {
        let text = '';
        if (lnk.href) {
          try {
            const url = new URL(lnk.href, window.location.origin);
            text = url.searchParams.get('player') || '';
          } catch (e) { }
        }
        if (!text) text = lnk.textContent.trim();
        if (text && isValidNickname(text) && !nicks.includes(text)) {
          nicks.push(text);
        }
      });

      actionCell.querySelectorAll('a strong').forEach(el => {
        const text = el.textContent.trim();
        if (text && isValidNickname(text) && !nicks.includes(text)) {
          nicks.push(text);
        }
      });

      if (nicks.length === 0) {
        const textContent = actionCell.textContent || '';
        const nickRegex = /\b[A-Z][a-zA-Z0-9]*_[A-Za-z0-9_]+\b/g;
        const matches = textContent.match(nickRegex);
        if (matches) {
          matches.forEach(m => {
            if (isValidNickname(m) && !nicks.includes(m)) nicks.push(m);
          });
        }
      }

      return nicks;
    }

    function open(event, tr) {
      close();

      const getCleanCellText = (cell, isIpCell = false) => {
        if (!cell) return '';
        const clone = cell.cloneNode(true);
        clone.querySelectorAll('.arz-row-actions-wrapper, .arz-cell-copy-btn, .arz-log-copy-menu-btn, .alh-col-eye-btn, .badge, .bi, svg, i, .az-geo-inserted, .arz-geo-inserted, .arz-dup-badge, button, .arizona-ecosystem-badge').forEach(el => el.remove());
        let text = clone.textContent;
        if (!isIpCell) {
          const ipGeoRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?:\s*\([^)]*\))?(?:\s*~\d+(?:\.\d+)?km)?/g;
          text = text.replace(ipGeoRegex, '');
        }
        return text.replace(/\s+/g, ' ').trim();
      };

      const date = getCleanCellText(tr.cells[0]);
      const action = getCleanCellText(tr.cells[1]);
      const data = getCleanCellText(tr.cells[2]);
      const ipCell = getIpCellFromRow(tr);
      const ip = getCleanCellText(ipCell, true);

      const nicks = getNicknamesFromRow(tr);
      const nick1 = nicks[0] || null;
      const nick2 = nicks[1] || null;

      const dropdown = document.createElement('div');
      dropdown.className = 'arz-ip-dropdown arz-copy-dropdown';

      const nick1Btn = nick1
        ? `<button class="arz-ip-dropdown-item" data-action="nick-1" data-nick="${window.ArizonaUtils.escapeHtml(nick1)}"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Никнейм игрока 1 (${window.ArizonaUtils.escapeHtml(nick1)})</button>`
        : `<button class="arz-ip-dropdown-item disabled" data-action="nick-1" disabled style="opacity: 0.4; cursor: not-allowed;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Никнейм игрока 1</button>`;

      const nick2Btn = nick2
        ? `<button class="arz-ip-dropdown-item" data-action="nick-2" data-nick="${window.ArizonaUtils.escapeHtml(nick2)}"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><path d="M17 21v-2a4 4 0 0 0-3-3.87"></path><path d="M9 21v-2a4 4 0 0 0-4-4H3a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg> Никнейм игрока 2 (${window.ArizonaUtils.escapeHtml(nick2)})</button>`
        : `<button class="arz-ip-dropdown-item disabled" data-action="nick-2" disabled style="opacity: 0.4; cursor: not-allowed;"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><path d="M17 21v-2a4 4 0 0 0-3-3.87"></path><path d="M9 21v-2a4 4 0 0 0-4-4H3a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg> Никнейм игрока 2</button>`;

      dropdown.innerHTML = `
        <div class="arz-ip-dropdown-header"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Копирование</div>
        <button class="arz-ip-dropdown-item" data-action="time-log"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Время + Лог</button>
        ${nick1Btn}
        ${nick2Btn}
        <button class="arz-ip-dropdown-item" data-action="log"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Текст лога</button>
        <button class="arz-ip-dropdown-item" data-action="time"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Время</button>
        <button class="arz-ip-dropdown-item" data-action="data"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><circle cx="8" cy="8" r="6"></circle><circle cx="18" cy="18" r="4"></circle><path d="M12 18a6 6 0 0 0-6-6"></path></svg> Данные</button>
        <button class="arz-ip-dropdown-item" data-action="ip"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M12 8v8M5 16v-4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"></path></svg> IP адрес</button>
        <hr class="arz-ip-dropdown-divider">
        <button class="arz-ip-dropdown-item" data-action="all"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline-block; vertical-align: middle;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Скопировать всё</button>
      `;

      document.body.appendChild(dropdown);
      currentPopup = dropdown;

      const rect = event.target.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.top = rect.bottom + 'px';
      dropdown.style.left = rect.left + 'px';

      const dropdownRect = dropdown.getBoundingClientRect();

      if (rect.bottom + dropdownRect.height > window.innerHeight) {
        dropdown.style.top = (rect.top - dropdownRect.height) + 'px';
      }

      if (rect.left + dropdownRect.width > window.innerWidth) {
        dropdown.style.left = (rect.right - dropdownRect.width) + 'px';
      }

      dropdown.classList.add('open');

      dropdown.querySelectorAll('.arz-ip-dropdown-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          if (item.hasAttribute('disabled') || item.classList.contains('disabled')) return;

          const act = item.getAttribute('data-action');
          let textToCopy = '';
          if (act === 'time-log') {
            textToCopy = date && action ? `${date} | ${action}` : (date || action);
          } else if (act === 'nick-1') {
            textToCopy = item.getAttribute('data-nick') || nick1 || '';
          } else if (act === 'nick-2') {
            textToCopy = item.getAttribute('data-nick') || nick2 || '';
          } else if (act === 'log') {
            textToCopy = action;
          } else if (act === 'time') {
            textToCopy = date;
          } else if (act === 'data') {
            textToCopy = data;
          } else if (act === 'ip') {
            textToCopy = ip;
          } else if (act === 'all') {
            const parts = [date, action, data, ip].filter(p => p);
            textToCopy = parts.join(' | ');
          }

          if (!textToCopy) {
            window.ArizonaNotifications.show('Нечего копировать', 'warning');
            return;
          }

          writeToClipboard(textToCopy).then(() => {
            window.ArizonaNotifications.show('Скопировано!', 'success');
            close();
          }).catch(err => {
            console.error('Failed to copy text:', err);
            window.ArizonaNotifications.show('Ошибка копирования', 'error');
          });
        };
      });
    }

    document.addEventListener('click', (e) => {
      if (currentPopup && !currentPopup.contains(e.target)) {
        close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
      }
    });

    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close, { passive: true });

    return {
      open: open,
      close: close
    };
  })();

  let ipDetailsCache = {};
  let ipGeneration = 0;
  const pendingIps = new Map();
  const ipLookupFailures = new Map();
  const ipGeoRequests = new Map();
  let ipRequestSequence = 0;

  chrome.runtime.onMessage.addListener(message => {
    if (message.action === 'ip_geo_result') ipGeoRequests.get(message.requestId)?.(message.data);
  });

  async function ensureIpDetails(ips, force = false, onResult = () => {}) {
    const unique = [...new Set(ips.filter(Boolean))];
    const missing = unique.filter(ip => !ipDetailsCache[ip] && !pendingIps.has(ip) &&
      (force || ipLookupFailures.get(ip)?.retryable !== false));
    for (let i = 0; i < missing.length; i += 15) {
      const chunk = missing.slice(i, i + 15);
      const requestId = `${Date.now()}-${++ipRequestSequence}`;
      const resolvers = new Map();
      for (const ip of chunk) {
        const pending = new Promise(resolve => resolvers.set(ip, resolve))
          .finally(() => { if (pendingIps.get(ip) === pending) pendingIps.delete(ip); });
        pendingIps.set(ip, pending);
      }
      const accept = item => {
        const ip = item?.query;
        if (resolvers.has(ip)) {
          if (item?.status === 'success') {
            saveIpToCaches(ip, item);
            ipLookupFailures.delete(ip);
          } else {
            ipLookupFailures.set(ip, {
              message: item?.message || 'Сервис не вернул данные IP',
              retryable: item.retryable === true
            });
          }
          resolvers.get(ip)();
          resolvers.delete(ip);
        }
      };
      ipGeoRequests.set(requestId, accept);
      Promise.resolve().then(() => window.ArizonaUtils.sendMessageToBackground({ action: 'fetch_ip_geo_batch', ips: chunk, requestId, force }))
        .then(result => {
          for (const item of Array.isArray(result?.data) ? result.data : []) accept(item);
          for (const ip of resolvers.keys()) accept({ query: ip, status: 'fail', retryable: true, message: result?.error });
        }).catch(error => {
          for (const ip of resolvers.keys()) accept({ query: ip, status: 'fail', retryable: true, message: error.message });
        }).finally(() => {
          ipGeoRequests.delete(requestId);
        });
    }
    await Promise.allSettled(unique.map(async ip => {
      await pendingIps.get(ip);
      onResult(ip);
    }));
  }

  function saveIpToCaches(ip, data) {
    if (data?.status === 'success') ipDetailsCache[ip] = data;
    const keys = Object.keys(ipDetailsCache);
    if (keys.length > 3000) {
      for (const key of keys.slice(0, keys.length - 2000)) delete ipDetailsCache[key];
    }
  }

  function parseAllIpsFromCell(ipCell) {
    if (!ipCell) return [];
    if (ipCellCache.has(ipCell)) return ipCellCache.get(ipCell);
    const pairs = [];
    const tableIpDivs = ipCell.querySelectorAll('.table-ip');
    if (tableIpDivs.length > 0) {
      tableIpDivs.forEach((div) => {
        const lastIpEl = div.querySelector('.badge-secondary, [title="последний"], [title*="Последний IP"], [title*="последний"]');
        const regIpEl = div.querySelector('.badge-primary, .badge-danger, .badge-warning, .badge-info, [title="регистрационный"], [title*="Регистрационный IP"], [title*="регистрационный"]');

        let lastIp = lastIpEl ? lastIpEl.textContent.trim() : null;
        let regIp = regIpEl ? regIpEl.textContent.trim() : null;

        if (!lastIp || !regIp) {
          const ipsInDiv = (div.textContent || '').match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g);
          if (ipsInDiv && ipsInDiv.length > 0) {
            if (!lastIp) lastIp = ipsInDiv[0];
            if (!regIp && ipsInDiv.length > 1) regIp = ipsInDiv[1];
          }
        }

        let prefix = '';
        const strongEl = div.querySelector('strong, code');
        if (strongEl) {
          prefix = strongEl.textContent.trim();
        } else {
          const match = div.textContent.match(/^\s*(I+|V+|X+)\s*:/i);
          if (match) prefix = match[0].trim();
        }

        if (lastIp || regIp) {
          pairs.push({
            lastIp: (lastIp && !lastIp.includes('*')) ? lastIp : null,
            regIp: (regIp && !regIp.includes('*')) ? regIp : null,
            prefix: prefix,
            divElement: div,
            lastLink: lastIpEl ? (lastIpEl.closest('a') || lastIpEl) : null,
            regLink: regIpEl ? (regIpEl.closest('a') || regIpEl) : null
          });
        }
      });
    } else {
      const text = ipCell.textContent || '';
      const ips = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g);
      if (ips && ips.length > 0) {
        for (let i = 0; i < ips.length; i += 2) {
          const lastIp = ips[i];
          const regIp = ips[i + 1] || null;
          pairs.push({
            lastIp: lastIp,
            regIp: regIp,
            prefix: i === 0 ? 'I:' : i === 2 ? 'II:' : '',
            divElement: null,
            lastLink: null,
            regLink: null
          });
        }
      }
    }
    ipCellCache.set(ipCell, pairs);
    return pairs;
  }

  function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return null;
    if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function clearIpDetailsFromPage() {
    if (sakaiCompatible()) return;
    const table = document.querySelector('table.table');
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(tr => {
      const ipCell = getIpCellFromRow(tr);
      tr.removeAttribute('data-arz-ip-processed');
      if (!ipCell) return;

      const lastIpEl = ipCell.querySelector('.badge-secondary, [title*="Последний IP"]');
      const regIpEl = ipCell.querySelector('.badge-primary, [title*="Регистрационный IP"]');

      if (lastIpEl) {
        lastIpEl.setAttribute('title', 'последний');
        if (lastIpEl.parentElement && lastIpEl.parentElement.tagName === 'A') {
          lastIpEl.parentElement.setAttribute('title', 'последний');
        }
      }
      if (regIpEl) {
        regIpEl.setAttribute('title', 'регистрационный');
        if (regIpEl.parentElement && regIpEl.parentElement.tagName === 'A') {
          regIpEl.parentElement.setAttribute('title', 'регистрационный');
        }
      }

      const existingDist = ipCell.querySelectorAll('.arz-ip-distance-inline');
      existingDist.forEach(el => el.remove());

      const existingPlaceholder = ipCell.querySelector('.arz-ip-loading-placeholder');
      if (existingPlaceholder) existingPlaceholder.remove();
    });
  }

  function renderIpDetailsForPair(ipCell, pair) {
    if (!currentSettings['tweak-ip-info']) return;
    const lastDetails = pair.lastIp ? ipDetailsCache[pair.lastIp] : null;
    const regDetails = pair.regIp ? ipDetailsCache[pair.regIp] : null;

    const formatTooltipText = (prefix, details) => {
      if (!details) return `${prefix}: Данные не загружены`;
      if (details.status !== 'success') {
        const errorMsg = details.message === 'private range' ? 'Локальный IP' : 'Неизвестно';
        return `${prefix} (${errorMsg})`;
      }
      const country = details.country || details.countryCode || '';
      const city = details.city || '';
      const org = details.org || details.as || '';
      const mobile = details.mobile ? 'Mobile' : '';
      const proxy = details.proxy ? 'Proxy' : '';
      const host = details.hosting ? 'Host' : '';

      return `${prefix} (${country}, ${city}, ${org}, ${mobile} ${proxy} ${host})`;
    };

    if (pair.lastLink && lastDetails) {
      const tooltip = formatTooltipText('Последний IP', lastDetails);
      pair.lastLink.setAttribute('title', tooltip);
      const outerAnchor = pair.lastLink.closest('a');
      if (outerAnchor) outerAnchor.setAttribute('title', tooltip);
    }

    if (pair.regLink && regDetails) {
      const tooltip = formatTooltipText('Регистрационный IP', regDetails);
      pair.regLink.setAttribute('title', tooltip);
      const outerAnchor = pair.regLink.closest('a');
      if (outerAnchor) outerAnchor.setAttribute('title', tooltip);
    }

    if (pair.lastIp && pair.regIp && lastDetails && regDetails) {
      const dist = calculateHaversineDistance(regDetails.lat, regDetails.lon, lastDetails.lat, lastDetails.lon);
      if (dist !== null) {
        const parent = pair.divElement || ipCell;
        const existingDist = parent.querySelector('.arz-ip-distance-inline');
        if (existingDist) existingDist.remove();

        const distEl = document.createElement('span');
        distEl.className = 'arz-ip-distance-inline';

        let alertClass = 'dist-safe';
        if (dist >= 500) {
          alertClass = 'dist-danger';
        } else if (dist >= 50) {
          alertClass = 'dist-warning';
        }
        distEl.classList.add(alertClass);
        distEl.textContent = `~${dist.toFixed(2)}km`;
        distEl.title = distEl.textContent;

        parent.appendChild(distEl);
      }
    }
  }

  let accountScanGeneration = 0;
  let accountScanDirty = true, accountScanSignature = null, accountScanBody = null;
  let accountScanTask = null;
  let accountMarkedRows = new Set();

  function scanAccountSignals() {
    const body = document.querySelector('table.table tbody');
    const signature = JSON.stringify([currentSettings['extension-toggle'], sakaiCompatible(), arizonaSettings.bindingDetector, arizonaSettings.guaranteeDetector]);
    if (!accountScanDirty && accountScanSignature === signature && accountScanBody === body) return;
    accountScanDirty = false; accountScanSignature = signature; accountScanBody = body;
    const generation = ++accountScanGeneration;
    window.ArizonaRuntime.cancelTask(accountScanTask);
    accountScanTask = null;
    const enabled = currentSettings['extension-toggle'] !== false && !sakaiCompatible();
    const binding = enabled && arizonaSettings.bindingDetector?.enabled;
    const guarantee = enabled && arizonaSettings.guaranteeDetector?.enabled;
    if (!binding && !guarantee && !accountMarkedRows.size) return;
    const tbody = document.querySelector('table.table tbody');
    const rows = binding || guarantee ? Array.from(tbody?.rows || []) : [];
    const marks = new Map();
    const exits = new Map();
    let position = 0;
    let updates;
    const mark = (row, label, color) => {
      if (!row?.cells[1]) return;
      if (!marks.has(row)) marks.set(row, []);
      marks.get(row).push({ label, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ff9800' });
    };
    const step = () => {
      accountScanTask = null;
      if (generation !== accountScanGeneration || (tbody && !tbody.isConnected)) return;
      const deadline = performance.now() + 4;
      if (!updates) {
        while (position < rows.length) {
          const row = rows[position++];
          const action = row.cells[1]?.textContent || '';
          if (binding && /изменил почту|привязал почту|изменил пароль|привязал ВК|привязал Telegram|изменил вход по почте|изменил привязку ВК|установил почту/i.test(action)) {
            const amount = (row.cells[2]?.textContent || '').match(/I:\s*([\d,.]+)/i);
            if (amount && Number(amount[1].replace(/[,.]/g, '')) >= 100000000) mark(row, 'Смена данных при балансе от 100 млн', arizonaSettings.bindingDetector.color);
          }
          if (guarantee) {
            const exit = action.match(/Игрок\s+(\S+).*время сессии:\s*(\d{2}):(\d{2}):(\d{2})/i);
            if (exit) exits.set(exit[1], { row, seconds: +exit[2] * 3600 + +exit[3] * 60 + +exit[4] });
            const auth = action.match(/Игрок\s+(\S+).*авторизовался.*Тип клиента:\s*none/i);
            if (auth) {
              const match = exits.get(auth[1]);
              if (match && match.seconds >= 23 && match.seconds <= 60) {
                const reason = `Возможный бот гаранта: клиент none, сессия ${match.seconds} сек.`;
                mark(row, reason, arizonaSettings.guaranteeDetector.color);
                mark(match.row, reason, arizonaSettings.guaranteeDetector.color);
              }
              exits.delete(auth[1]);
            }
          }
          if (performance.now() >= deadline) {
            accountScanTask = window.ArizonaRuntime.scheduleFrame(step);
            return;
          }
        }
        updates = [...new Set([...accountMarkedRows, ...marks.keys()])];
        position = 0;
      }
      window.ArizonaObservers.write(() => {
        while (position < updates.length) {
          const row = updates[position++];
          const data = marks.get(row);
          if (row.isConnected) {
            const existing = Array.from(row.querySelectorAll('.arz-account-signal'));
            if (data) {
              data.forEach((item, index) => {
                const badge = existing[index] || document.createElement('span');
                badge.className = 'arz-account-signal';
                if (badge.title !== item.label || badge.dataset.color !== item.color) {
                  badge.textContent = ` ⚠ ${item.label}`;
                  badge.title = item.label;
                  badge.dataset.color = item.color;
                  badge.style.cssText = `color:${item.color};font-weight:bold`;
                }
                if (!existing[index]) row.cells[1].appendChild(badge);
              });
              existing.slice(data.length).forEach(badge => badge.remove());
              row.style.setProperty('--arz-account-color', data[data.length - 1].color);
              row.classList.add('arz-account-highlight');
              accountMarkedRows.add(row);
            } else {
              existing.forEach(badge => badge.remove());
              row.style.removeProperty('--arz-account-color');
              row.classList.remove('arz-account-highlight');
              accountMarkedRows.delete(row);
            }
            rowIndex.finish(row);
          } else accountMarkedRows.delete(row);
          if (performance.now() >= deadline) break;
        }
      });
      if (position < updates.length) accountScanTask = window.ArizonaRuntime.scheduleFrame(step);
    };
    accountScanTask = window.ArizonaRuntime.scheduleFrame(step);
  }

  function formatGeoText(ipData, distance) {
    if (arizonaSettings.geoTemplate) {
      const fields = arizonaSettings.ipFields || {};
      const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      const values = { ...ipData, ip: ipData.query, distance: distance != null && arizonaSettings.geoIPEnabled ? `~${distance.toFixed(1)}km` : '' };
      const allowed = new Set(['ip', 'country', 'city', 'regionName', 'isp', 'org', 'as', 'mobile', 'proxy', 'hosting', 'distance']);
      return escape(arizonaSettings.geoTemplate).replace(/\{([a-zA-Z]+)(?:\|(#(?:[0-9a-fA-F]{6})))?\}/g, (match, key, color) => {
        if (!allowed.has(key) || (key !== 'ip' && key !== 'distance' && fields[key] === false)) return '';
        let value = values[key];
        if (typeof value === 'boolean') value = value ? key[0].toUpperCase() + key.slice(1) : '';
        if (!value) return '';
        const text = escape(value);
        if (key === 'ip') return `<span class="az-clickable-ip" data-ip="${text}" style="cursor:pointer">${text}</span>`;
        return color ? `<span style="color:${color}">${text}</span>` : text;
      });
    }
    let txt = `<span class="az-clickable-ip" data-ip="${ipData.query}" style="font-weight: 500; cursor: pointer;">${ipData.query}</span>`;
    let fields = [];
    const ipFields = arizonaSettings.ipFields || { country: true, city: true, regionName: true, isp: true, org: true, as: true };

    if (ipFields.country && ipData.country) fields.push(`${ipData.country}`);
    if (ipFields.city && ipData.city) fields.push(`${ipData.city}`);
    if (ipFields.regionName && ipData.regionName) fields.push(`${ipData.regionName}`);
    if (ipFields.isp && ipData.isp) fields.push(`${ipData.isp}`);
    if (ipFields.org && ipData.org) fields.push(`${ipData.org}`);
    if (ipFields.as && ipData.as) fields.push(`${ipData.as}`);
    if (fields.length > 0) txt += ` (${fields.join(', ')})`;

    const sec = [];
    if (ipFields.proxy && ipData.proxy) sec.push('Proxy');
    if (ipFields.hosting && ipData.hosting) sec.push('Host');
    if (ipFields.mobile && ipData.mobile) sec.push('Mobile');
    if (ipData.vpn) sec.push('VPN');
    if (ipData.tor) sec.push('Tor');
    if (sec.length > 0) txt += ` | ${sec.join('/')}`;

    if (distance !== null && arizonaSettings.geoIPEnabled) {
      const col = distance <= 100 ? '#13b982' : distance <= 500 ? '#f59e0b' : '#ef4444';
      txt += ` <span style="color: ${col}; font-weight: 500;">~${distance.toFixed(1)}km</span>`;
    }
    return txt;
  }

  function attachTooltip(link, ip) {
    if (!link) return;
    link.setAttribute('data-ip', ip);
  }

  function attachRegTooltip(link, ip) {
    if (!link) return;
    link.setAttribute('data-ip', ip);
  }

  function shouldShowInlineGeoText(row) {
    const actionCell = row.cells[1];
    if (!actionCell) return false;
    const text = actionCell.textContent.toLowerCase();
    return text.includes('авторизовался') ||
      text.includes('вышел');
  }

  function reserveInlineGeoText(row, pairs) {
    if (!arizonaSettings.ipLookupEnabled || !shouldShowInlineGeoText(row)) return null;
    const count = pairs.filter(pair => pair.lastIp).length;
    if (!count) return null;
    let slot = row.cells[1].querySelector('.az-geo-inserted');
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'az-geo-inserted alh-geo-slot';
      slot.textContent = '—';
      row.cells[1].appendChild(slot);
    }
    slot.style.setProperty('--alh-geo-lines', count);
    return slot;
  }

  function renderInlineGeoText(row, pairs) {

    pairs.forEach(pair => {
      let regData = pair.regIp ? ipDetailsCache[pair.regIp] : null;
      let lastData = pair.lastIp ? ipDetailsCache[pair.lastIp] : null;
      let dist = null;
      if (regData && lastData && regData.lat && regData.lon && lastData.lat && lastData.lon) {
        dist = calculateHaversineDistance(lastData.lat, lastData.lon, regData.lat, regData.lon);
      }
      if (pair.lastLink && lastData) attachTooltip(pair.lastLink, pair.lastIp, lastData, regData, dist);
      if (pair.regLink && regData) attachRegTooltip(pair.regLink, pair.regIp, regData);
    });

    if (!arizonaSettings.ipLookupEnabled) return;
    const actionCell = row.cells[1];
    if (!actionCell) return;

    if (!shouldShowInlineGeoText(row)) {
      const existing = actionCell.querySelector('.az-geo-inserted');
      if (existing) existing.remove();
      return;
    }

    let htmls = [];
    pairs.forEach(pair => {
      if (!pair.lastIp) return;
      const lastData = ipDetailsCache[pair.lastIp];
      if (!lastData) return;

      let dist = null;
      if (pair.regIp && arizonaSettings.geoIPEnabled) {
        const regData = ipDetailsCache[pair.regIp];
        if (regData && regData.lat && regData.lon && lastData.lat && lastData.lon) {
          dist = calculateHaversineDistance(lastData.lat, lastData.lon, regData.lat, regData.lon);
        }
      }

      let lineText = formatGeoText(lastData, dist);
      htmls.push(lineText);
    });

    if (htmls.length === 0) return;

    const existing = reserveInlineGeoText(row, pairs);
    if (!existing) return;
    existing.innerHTML = htmls.join('<br>');
    existing.title = existing.textContent;
  }

  function injectIpPlaceholder(tr) {
    const ipCell = getIpCellFromRow(tr);
    if (!ipCell) return;
    const processed = tr.getAttribute('data-arz-ip-processed');
    if (processed === 'true' || processed === 'pending') return;

    const pairs = parseAllIpsFromCell(ipCell);
    pairs.forEach(pair => {
      if (!pair.lastIp || !pair.regIp) return;
      const parent = pair.divElement || ipCell;
      if (!parent.querySelector('.arz-ip-distance-inline')) {
        const distEl = document.createElement('span');
        distEl.className = 'arz-ip-distance-inline dist-placeholder';
        distEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
        parent.appendChild(distEl);
      }
    });
  }

  let ipRowObserver = null;
  const pendingIpRows = new Set();
  let ipBatchTimeout = null;
  const ipRetryRows = new Map();
  const ipRetryAttempts = new WeakMap();
  let ipRetryTimer = null;

  function scheduleIpRetry(tr) {
    const attempt = (ipRetryAttempts.get(tr) || 0) + 1;
    ipRetryAttempts.set(tr, attempt);
    ipRetryRows.set(tr, Date.now() + Math.min(60000, 2000 * 2 ** Math.min(attempt - 1, 5)));
    armIpRetryTimer();
  }

  function armIpRetryTimer() {
    clearTimeout(ipRetryTimer);
    ipRetryTimer = null;
    if (!ipRetryRows.size) return;
    const next = Math.min(...ipRetryRows.values());
    ipRetryTimer = setTimeout(() => {
      ipRetryTimer = null;
      const observer = getIpRowObserver();
      for (const [tr, retryAt] of ipRetryRows) {
        if (!tr.isConnected || !observer) ipRetryRows.delete(tr);
        else if (retryAt <= Date.now()) {
          ipRetryRows.delete(tr);
          observer.observe(tr);
        }
      }
      armIpRetryTimer();
    }, Math.max(0, next - Date.now()));
  }

  function getIpRowObserver() {
    const isEnabled = currentSettings['extension-toggle'] !== false;
    const isIpEnabled = isEnabled && (currentSettings['tweak-ip-info'] || arizonaSettings.ipLookupEnabled);

    if (!isIpEnabled) {
      if (ipRowObserver) {
        ipRowObserver.disconnect();
        ipRowObserver = null;
      }
      return null;
    }

    if (!ipRowObserver) {
      ipRowObserver = window.ArizonaRuntime.createRowObserver((entries) => {
        if (!ipRowObserver || currentSettings['extension-toggle'] === false) return;
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const tr = entry.target;
            ipRowObserver.unobserve(tr);
            queueIpRowForProcessing(tr);
          }
        });
      }, {
        rootMargin: '1000px 0px',
        threshold: 0.01
      });
    }
    return ipRowObserver;
  }

  function initIpRowsObserver() {
    const observer = getIpRowObserver();
    if (!observer) return;

    const table = document.querySelector('table.table');
    if (table) {
      table.querySelectorAll('tbody tr').forEach(tr => {
        const processed = tr.getAttribute('data-arz-ip-processed');
        if (processed !== 'true' && processed !== 'pending' && !ipRetryRows.has(tr)) {
          observer.observe(tr);
        }
      });
    }
  }

  function queueIpRowForProcessing(tr) {
    const processed = tr.getAttribute('data-arz-ip-processed');
    if (processed === 'true' || processed === 'pending') return;

    pendingIpRows.add(tr);

    if (ipBatchTimeout) clearTimeout(ipBatchTimeout);
    ipBatchTimeout = setTimeout(processPendingIpRows, 50);
  }

  async function processPendingIpRows() {
    if (pendingIpRows.size === 0) return;
    const rows = Array.from(pendingIpRows);
    pendingIpRows.clear();
    await processIpsForRowsBatch(rows);
  }

  async function processIpsForRowsBatch(rowsToProcess) {
    const generation = ipGeneration;
    const waiting = [];
    const missing = new Set();
    window.ArizonaObservers.write(() => {
      for (const tr of rowsToProcess) {
        if (!tr.isConnected || !getIpRowObserver()) continue;
        const ipCell = getIpCellFromRow(tr);
        if (!ipCell) continue;
        const pairs = parseAllIpsFromCell(ipCell);
        if (!pairs.length) continue;
        for (const pair of pairs) {
          for (const ip of [pair.lastIp, pair.regIp]) {
            if (ip) missing.add(ip);
          }
        }
        tr.setAttribute('data-arz-ip-processed', 'pending');
        injectIpPlaceholder(tr);
        waiting.push({ tr, ipCell, pairs });
      }
    });
    const rowsByIp = new Map();
    for (const row of waiting) {
      for (const ip of new Set(row.pairs.flatMap(pair => [pair.lastIp, pair.regIp]).filter(Boolean))) {
        if (!rowsByIp.has(ip)) rowsByIp.set(ip, []);
        rowsByIp.get(ip).push(row);
      }
    }
    function renderRows(rows, final = false) {
      if (generation !== ipGeneration || currentSettings['extension-toggle'] === false || !getIpRowObserver()) return;
      window.ArizonaObservers.write(() => {
        for (const { tr, ipCell, pairs } of rows) {
          if (!tr.isConnected || getIpCellFromRow(tr) !== ipCell || ipCellCache.get(ipCell) !== pairs) continue;
          renderInlineGeoText(tr, pairs);
          for (const pair of pairs) renderIpDetailsForPair(ipCell, pair);
          rowIndex.finish(tr);
          const complete = pairs.every(pair => [pair.lastIp, pair.regIp].every(ip =>
            !ip || ipDetailsCache[ip] || ipLookupFailures.get(ip)?.retryable === false));
          if (complete) {
            tr.setAttribute('data-arz-ip-processed', 'true');
            ipRetryRows.delete(tr);
            ipRetryAttempts.delete(tr);
          } else if (final) {
            tr.removeAttribute('data-arz-ip-processed');
            scheduleIpRetry(tr);
          }
          if (complete || final) {
            ipCell.querySelectorAll('.arz-ip-loading-placeholder').forEach(node => node.remove());
            ipCell.querySelectorAll('.dist-placeholder').forEach(node => {
              node.classList.remove('dist-placeholder');
              node.textContent = '—';
              node.title = 'Геоданные недоступны';
            });
          }
        }
      });
    }
    await ensureIpDetails([...missing], false, ip => renderRows(rowsByIp.get(ip) || []));
    renderRows(waiting, true);
  }

  let tableStructureReady = false;
  const queuedRows = new Set();
  const priorityRows = new Set();
  const rowReasons = new WeakMap();
  let rowTimer = null;
  let finishTask = null;
  let revealTask = null;
  let tableLayoutLock = null;
  let tableHasProcessedRows = false;

  function releaseTableLayout() {
    if (!tableLayoutLock) return;
    const { table, columns, layout, priority, width, widthPriority } = tableLayoutLock;
    columns.remove();
    if (layout) table.style.setProperty('table-layout', layout, priority);
    else table.style.removeProperty('table-layout');
    if (width) table.style.setProperty('width', width, widthPriority);
    else table.style.removeProperty('width');
    tableLayoutLock = null;
  }

  window.addEventListener('resize', releaseTableLayout, { passive: true });

  function lockTableLayout() {
    if (tableLayoutLock || sakaiCompatible() || !tableHasProcessedRows || queuedRows.size < 100 || document.readyState === 'loading') return;
    const table = queuedRows.values().next().value?.closest('table.table');
    const headers = table?.tHead?.rows[0]?.cells;
    if (!headers?.length || table.querySelector('colgroup') || getComputedStyle(table).tableLayout === 'fixed') return;
    updateLogDataHeader(table);
    const tableWidth = table.getBoundingClientRect().width;
    const widths = Array.from(headers, cell => cell.getBoundingClientRect().width);
    if (widths.some(width => !width)) return;
    const columns = document.createElement('colgroup');
    columns.dataset.arzLayoutLock = 'true';
    for (const width of widths) {
      const column = document.createElement('col');
      column.style.width = `${width}px`;
      columns.appendChild(column);
    }
    tableLayoutLock = { table, columns, layout: table.style.getPropertyValue('table-layout'), priority: table.style.getPropertyPriority('table-layout'), width: table.style.getPropertyValue('width'), widthPriority: table.style.getPropertyPriority('width') };
    table.insertBefore(columns, table.tHead);
    table.style.setProperty('width', `${tableWidth}px`, 'important');
    table.style.setProperty('table-layout', 'fixed', 'important');
  }

  function scheduleRowBatch() {
    // The preparing screen can drain without forcing a table layout every frame.
    return document.documentElement.dataset.alhStartup
      ? window.ArizonaRuntime.scheduleFrame(processRowBatch)
      : window.ArizonaRuntime.schedule(processRowBatch);
  }

  function queueRows(rows, reason = 1) {
    if (currentSettings['extension-toggle'] === false) return;
    let first = true;
    for (const row of rows) {
      if (!row.isConnected) continue;
      if (reason !== 2) accountScanDirty = true;
      const previous = rowReasons.get(row);
      const next = (!queuedRows.has(row) && !row.hasAttribute('data-arz-processed')) || previous === 1 || reason === 1 ? 1 : (previous || 0) | reason;
      rowReasons.set(row, next);
      row.removeAttribute('data-arz-processed');
      if (first && accountScanTask !== null && reason !== 2) {
        accountScanGeneration++;
        window.ArizonaRuntime.cancelTask(accountScanTask);
        accountScanTask = null;
      }
      if (queuedRows.size < 50) priorityRows.add(row);
      first = false;
      queuedRows.add(row);
    }
    if (tableStructureReady && rowTimer === null && queuedRows.size) rowTimer = scheduleRowBatch();
  }

  let priorityFrame = null;
  document.addEventListener('scroll', () => {
    if (priorityFrame !== null || !queuedRows.size) return;
    priorityFrame = requestAnimationFrame(() => {
      priorityFrame = null;
      if (!queuedRows.size) return;
      let anchor = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2))?.closest('table.table tbody tr');
      if (!anchor) {
        const rows = document.querySelector('table.table tbody')?.rows;
        let low = 0;
        let high = (rows?.length || 0) - 1;
        const middleY = innerHeight / 2;
        while (low <= high) {
          const middle = (low + high) >> 1;
          const row = rows[middle];
          const rect = row.getBoundingClientRect();
          if (rect.bottom < middleY) low = middle + 1;
          else if (rect.top > middleY) high = middle - 1;
          else { anchor = row; break; }
        }
      }
      if (!anchor) return;
      let row = anchor;
      for (let i = 0; row.previousElementSibling && i < 15; i++) row = row.previousElementSibling;
      for (let i = 0; row && i < 80; i++, row = row.nextElementSibling) {
        if (queuedRows.has(row)) priorityRows.add(row);
      }
    });
  }, { passive: true, capture: true });

  function processRowBatch() {
    rowTimer = null;
    if (currentSettings['extension-toggle'] === false) return;
    isProcessingTable = true;
    try {
      window.ArizonaObservers.write(() => {
        lockTableLayout();
        const deadline = performance.now() + 4;
        while (queuedRows.size) {
          const row = priorityRows.values().next().value || queuedRows.values().next().value;
          priorityRows.delete(row);
          if (!queuedRows.has(row)) continue;
          queuedRows.delete(row);
          const reason = rowReasons.get(row) || 1;
          rowReasons.delete(row);
          if (!row.isConnected || !row.closest('table.table')) continue;
          try {
            if (reason === 1) rowIndex.update(row);
            if (reason === 6) {
              renderLogData(row);
              window.ArizonaInventoryLogs?.processRow(row);
            } else processRow(row, reason);
            rowIndex.finish(row);
          } catch (error) {
            console.error('Error processing row:', error);
          } finally {
            row.setAttribute('data-arz-processed', 'true');
            tableHasProcessedRows = true;
          }
          if (performance.now() >= deadline) break;
        }
      });
    } finally { isProcessingTable = false; }
    if (queuedRows.size) rowTimer = scheduleRowBatch();
    else if (isInitialized) finishTableProcessing();
  }

  function revealPreparedTable() {
    if (revealTask !== null || document.documentElement.dataset.alhStartup) return;
    let waited = false;
    const check = () => {
      revealTask = null;
      if (currentSettings['extension-toggle'] === false || document.documentElement.dataset.alhStartup) return;
      // Give IntersectionObserver its initial delivery, then drain visible controls.
      if (!waited || pendingRowControls.size || rowControlsTask !== null) {
        waited = true; revealTask = window.ArizonaRuntime.scheduleFrame(check); return;
      }
      if (!queuedRows.size) window.ArizonaBootstrap?.markReady();
    };
    revealTask = window.ArizonaRuntime.scheduleFrame(check);
  }

  function finishTableProcessing() {
    if (finishTask !== null) return;
    finishTask = window.ArizonaRuntime.schedule(() => {
      finishTask = null;
      if (queuedRows.size || currentSettings['extension-toggle'] === false) return;
      window.ArizonaObservers.write(() => {
        releaseTableLayout();
        window.ArizonaColumnEyeButtons.update();
        window.ArizonaTgVkDetector.scan();
        window.ArizonaEmailDetector.scan();
        handleTuningAutoScroll();
        scanAccountSignals();
        window.ArizonaOnlineManager.checkAutoCalculation();
        window.ArizonaDateShortcut.reposition();
        revealPreparedTable();
      });
    });
  }

  function processTable() {
    if (currentSettings['extension-toggle'] === false) return false;
    const table = document.querySelector('table.table');
    if (!table) return false;
    queueRows(table.querySelectorAll('tbody tr:not([data-arz-processed="true"])'));
    return true;
  }

  function stopTableWork() {
    window.ArizonaRuntime.cancelTask(revealTask); revealTask = null;
    window.ArizonaRuntime.cancelTask(rowControlsTask); rowControlsTask = null; pendingRowControls.clear();
    releaseTableLayout();
    window.ArizonaRuntime.cancelTask(rowTimer);
    window.ArizonaRuntime.cancelTask(finishTask);
    finishTask = null;
    rowTimer = null;
    queuedRows.clear();
    priorityRows.clear();
    if (priorityFrame !== null) cancelAnimationFrame(priorityFrame);
    priorityFrame = null;
    accountScanGeneration++;
    window.ArizonaRuntime.cancelTask(accountScanTask);
    accountScanTask = null;
    clearTimeout(ipBatchTimeout);
    ipBatchTimeout = null;
    pendingIpRows.clear();
    clearTimeout(ipRetryTimer);
    ipRetryTimer = null;
    ipRetryRows.clear();
    ipRowObserver?.disconnect();
    ipRowObserver = null;
    rowControlsObserver?.disconnect();
    rowControlsObserver = null;
    ipGeneration++;
    window.ArizonaObservers.stop();
    window.ArizonaRuntime.stopWaiting();
  }

  let originalLogoHTML = null;

  function applyLogoCustomization(mode) {
    const logoContainer = document.querySelector('.app-nav-logo');
    if (!logoContainer) return;

    if (originalLogoHTML === null) {
      originalLogoHTML = logoContainer.innerHTML;
    }

    logoContainer.innerHTML = originalLogoHTML;

    if (mode === 'default' || !mode) {
      return;
    }

    const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('icons/icon48.png')
      : 'icons/icon48.png';

    const imgEl = document.createElement('span');
    imgEl.className = 'alh-custom-logo-icon';
    imgEl.setAttribute('role', 'img');
    imgEl.setAttribute('aria-label', 'Logo');
    imgEl.style.setProperty('--alh-logo-image', `url("${iconUrl}")`);
    imgEl.style.width = '22px';
    imgEl.style.height = '22px';
    imgEl.style.marginRight = '8px';
    imgEl.style.verticalAlign = 'middle';
    imgEl.style.borderRadius = '5px';
    imgEl.style.display = 'inline-block';

    if (mode === 'with-icon') {
      logoContainer.insertBefore(imgEl, logoContainer.firstChild);
    } else if (mode === 'with-icon-replace') {
      logoContainer.innerHTML = '';
      logoContainer.appendChild(imgEl);

      const textNode = document.createTextNode(' ');
      logoContainer.appendChild(textNode);

      const spanEl = document.createElement('span');
      spanEl.className = 'text-muted';
      spanEl.textContent = 'LogsParser';
      logoContainer.appendChild(spanEl);
    }
  }

  let originalFavicons = [];

  function applyFaviconCustomization(replace) {
    let faviconLinks = document.querySelectorAll("link[rel*='icon']");

    if (replace) {
      if (originalFavicons.length === 0) {
        if (faviconLinks.length > 0) {
          faviconLinks.forEach(link => {
            originalFavicons.push({
              element: link,
              originalHref: link.getAttribute('href')
            });
          });
        } else {
          const newFavicon = document.createElement('link');
          newFavicon.rel = 'icon';
          document.head.appendChild(newFavicon);
          originalFavicons.push({
            element: newFavicon,
            originalHref: null
          });
          faviconLinks = [newFavicon];
        }
      }

      const newFaviconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('icons/icon16.png')
        : 'icons/icon16.png';

      faviconLinks.forEach(link => {
        link.setAttribute('href', newFaviconUrl);
      });
    } else {
      if (originalFavicons.length > 0) {
        originalFavicons.forEach(item => {
          if (item.originalHref === null) {
            item.element.remove();
          } else {
            item.element.setAttribute('href', item.originalHref);
          }
        });
        originalFavicons = [];
      }
    }
  }

  let filterFab = null;
  let filterModal = null;
  let formPlaceholder = null;
  let scrollHandler = null;
  let formObserver = null;
  let floatingFilterFormWatcher = null;
  let floatingActions = null;
  let scrollButtons = [];
  let scrollButtonsObserver = null;
  let scrollSentinels = [];

  function getFloatingActions() {
    if (!floatingActions) {
      floatingActions = document.createElement('div');
      floatingActions.className = 'arz-floating-actions';
      document.body.appendChild(floatingActions);
    }
    return floatingActions;
  }

  function setupScrollButtons(settings) {
    scrollButtonsObserver?.disconnect(); scrollButtonsObserver = null;
    scrollButtons.forEach(({button}) => button.remove()); scrollButtons = [];
    scrollSentinels.forEach(node => node.remove()); scrollSentinels = [];
    if (settings['extension-toggle'] === false) return;
    const targets = new Map();
    scrollButtonsObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const button = targets.get(entry.target);
        const visible = !entry.isIntersecting;
        if (button && button.classList.contains('visible') !== visible) button.classList.toggle('visible', visible);
      }
    });
    for (const direction of ['top','bottom']) {
      if (!settings[`tweak-scroll-${direction}`]) continue;
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'arz-floating-filter-btn'; button.id = `arz-scroll-${direction}-btn`;
      button.title = direction === 'top' ? 'Прокрутить вверх' : 'Прокрутить вниз';
      button.setAttribute('aria-label', button.title);
      button.innerHTML = `<i class="fa-solid fa-arrow-${direction === 'top' ? 'up' : 'down'}"></i>`;
      button.addEventListener('click', () => window.scrollTo({top: direction === 'top' ? 0 : document.scrollingElement.scrollHeight, behavior:'smooth'}));
      getFloatingActions().append(button); scrollButtons.push({button,direction});
      const sentinel = document.createElement('div'); sentinel.className = `alh-scroll-sentinel alh-scroll-${direction}`; sentinel.setAttribute('aria-hidden','true');
      if (direction === 'top') document.body.prepend(sentinel); else document.body.append(sentinel);
      scrollSentinels.push(sentinel); targets.set(sentinel,button); scrollButtonsObserver.observe(sentinel);
    }
  }

  function setupFloatingFilter(enabled) {
    if (floatingFilterFormWatcher) {
      floatingFilterFormWatcher();
      floatingFilterFormWatcher = null;
    }

    if (formObserver) {
      formObserver.disconnect();
      formObserver = null;
    }
    if (scrollHandler) {
      window.removeEventListener('scroll', scrollHandler);
      scrollHandler = null;
    }

    if (!enabled) {
      if (filterFab) {
        filterFab.remove();
        filterFab = null;
      }
      closeFilterModal();
      return;
    }

    floatingFilterFormWatcher = runWhenElementExists('form.filter', initFloatingFilter);
  }

  function initFloatingFilter(form) {
    if (!filterFab) {
      filterFab = document.createElement('button');
      filterFab.id = 'arz-floating-filter-btn';
      filterFab.className = 'arz-floating-filter-btn';
      filterFab.type = 'button';
      filterFab.title = 'Открыть фильтры поиска';
      filterFab.innerHTML = '<i class="fa-solid fa-filter"></i>';
      filterFab.setAttribute('aria-label', filterFab.title);
      getFloatingActions().prepend(filterFab);

      filterFab.addEventListener('click', () => {
        openFilterModal(form);
      });
    }

    if (formObserver) {
      formObserver.disconnect();
    }

    formObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const isFormVisible = entry.isIntersecting;
        if (!isFormVisible && !isModalOpen()) {
          filterFab.classList.add('visible');
        } else {
          filterFab.classList.remove('visible');
        }
      });
    }, { root: null, threshold: 0 });

    formObserver.observe(form);
  }

  function isModalOpen() {
    return filterModal && filterModal.style.display === 'flex';
  }

  function openFilterModal(form) {
    if (!filterModal) {

      filterModal = document.createElement('div');
      filterModal.className = 'arz-filter-modal';

      const modalContent = document.createElement('div');
      modalContent.className = 'arz-filter-modal-content';

      const modalHeader = document.createElement('div');
      modalHeader.className = 'arz-filter-modal-header';

      const modalTitle = document.createElement('h3');
      modalTitle.textContent = 'Фильтры поиска';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'arz-filter-modal-close';
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Закрыть фильтры');
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
      closeBtn.addEventListener('click', closeFilterModal);

      modalHeader.appendChild(modalTitle);
      modalHeader.appendChild(closeBtn);
      modalContent.appendChild(modalHeader);

      const formContainer = document.createElement('div');
      formContainer.className = 'arz-filter-modal-form-container';
      modalContent.appendChild(formContainer);

      filterModal.appendChild(modalContent);
      document.body.appendChild(filterModal);

      let backdropDown = false;
      filterModal.addEventListener('pointerdown', e => { backdropDown = e.target === filterModal; });
      filterModal.addEventListener('click', (e) => {
        if (e.target === filterModal && backdropDown) {
          closeFilterModal();
        }
        backdropDown = false;
      });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isModalOpen() && !document.querySelector('.alh-modal-overlay.open-active, .alh-control-popover')) { e.preventDefault(); closeFilterModal(); }
        if (e.key === 'Tab' && isModalOpen() && !document.querySelector('.alh-modal-overlay.open-active')) {
          const items = [...filterModal.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
          if (e.shiftKey && document.activeElement === items[0]) {e.preventDefault();items.at(-1)?.focus();}
          else if (!e.shiftKey && document.activeElement === items.at(-1)) {e.preventDefault();items[0]?.focus();}
        }
      });
    }

    const formContainer = filterModal.querySelector('.arz-filter-modal-form-container');

    if (!formPlaceholder) {
      formPlaceholder = document.createElement('div');
      formPlaceholder.id = 'arz-form-placeholder';
      formPlaceholder.style.display = 'none';
      form.parentNode.insertBefore(formPlaceholder, form);
    }

    filterModal.arzScrollPosition = {left:scrollX,top:scrollY};
    formPlaceholder.style.height = `${form.getBoundingClientRect().height}px`; formPlaceholder.style.display='block';
    formContainer.appendChild(form);

    filterModal.style.display = 'flex';
    document.body.classList.add('arz-modal-open');
    filterModal.querySelector('.arz-filter-modal-close')?.focus({preventScroll:true});

    if (filterFab) {
      filterFab.classList.remove('visible');
    }
  }

  function setupNickCounter(overlay, textareaSelector, countNumId) {
    const textarea = overlay.querySelector(textareaSelector);
    const countEl = overlay.querySelector('#' + countNumId);
    if (textarea && countEl) {
      const update = () => {
        const count = textarea.value.split(/[\n,]+/).map(n => n.trim()).filter(Boolean).length;
        countEl.textContent = count;
      };
      textarea.addEventListener('input', update);
      update();
    }
  }

  function closeFilterModal() {
    if (!filterModal || filterModal.style.display !== 'flex') return;
    window.ArizonaModalControls?.dismissAll();

    const form = filterModal.querySelector('form.filter');
    if (form && formPlaceholder) {

      formPlaceholder.parentNode.insertBefore(form, formPlaceholder);
      formPlaceholder.remove();
      formPlaceholder = null;
    }

    filterModal.style.display = 'none';
    filterFab?.focus({preventScroll:true});

    const openOverlays = document.querySelectorAll('.alh-modal-overlay.open-active');
    if (openOverlays.length === 0) {
      document.body.classList.remove('arz-modal-open');
    }

    if (filterModal.arzScrollPosition) window.scrollTo({...filterModal.arzScrollPosition,behavior:'instant'});
    if (scrollHandler) {
      scrollHandler();
    }
  }

  function refreshFeatureManagers() {
    [
      window.ArizonaTgVkDetector,
      window.ArizonaEmailDetector,
      window.ArizonaTuningAHKManager,
      window.ArizonaColumnEyeButtons,
      window.ArizonaLogFilter,
      window.ArizonaFormsManager,
      window.ArizonaOnlineManager,
      window.ArizonaPunishmentManager,
      window.ArizonaIpBatchManager,
      window.ArizonaIdNickManager,
      window.ArizonaReportManager,
      window.ArizonaLookupManager,
      window.ArizonaAnalyticsManager,
      window.ArizonaTemplatesManager,
      window.ArizonaCopyLogsManager,
      window.ArizonaSidebarManager,
      window.ArizonaMultiSelectManager,
      window.ArizonaLoadMoreManager,
      window.ArizonaMultiPlayersManager
    ].forEach((manager) => {
      if (manager && typeof manager.updateSettings === 'function') {
        try { manager.updateSettings(arizonaSettings); } catch (e) { }
      }
    });

    if (window.ArizonaThemeManager && typeof window.ArizonaThemeManager.updateSettings === 'function') {
      try {
        window.ArizonaThemeManager.updateSettings({
          ...arizonaSettings,
          themeEnabled: currentSettings['extension-toggle'] !== false &&
            currentSettings['visual-theme-enabled'] !== false
        });
      } catch (e) { }
    }
  }

  let appliedGeneralSettings = null;

  function applySettings(settings) {
    const previous = appliedGeneralSettings;
    const changed = key => !previous || previous[key] !== settings[key];
    const toggled = changed('extension-toggle');
    const inventoryChanged = window.ArizonaInventoryLogs?.configure(settings, rows => queueRows(rows, 2));
    appliedGeneralSettings = { ...settings };
    if (toggled || changed('tweak-copy-row') || changed('tweak-copy-btn-visibility')) initCopyButtonsLazy(settings);
    if (isInitialized && (toggled || changed('tweak-ip-info'))) initIpRowsObserver();
    updateCopyBlockSetting(
      settings['extension-toggle'] !== false && settings['tweak-block-copy'] !== false
    );
    if (isInitialized && toggled) refreshFeatureManagers();
    else if (isInitialized) {
      if (changed('tweak-multi-select')) {
        window.ArizonaMultiSelectManager.updateSettings(arizonaSettings);
        refreshRowControls();
      }
      if (changed('tweak-load-more')) window.ArizonaLoadMoreManager.updateSettings(arizonaSettings);
      if (changed('visual-toggle-sidebar')) window.ArizonaSidebarManager.updateSettings(arizonaSettings);
      if (changed('visual-theme-enabled')) window.ArizonaThemeManager.updateSettings({ ...arizonaSettings, themeEnabled: settings['extension-toggle'] !== false && settings['visual-theme-enabled'] !== false });
    }
    const isEnabled = settings['extension-toggle'] !== false;
    document.documentElement.classList.toggle('arz-sticky-headers-root', isEnabled && settings['visual-sticky-headers'] === true);
    if (toggled || Object.keys(settings).some(key => key.startsWith('tweak-log-') && changed(key))) {
      window.ArizonaObservers.write(() => {
        document.querySelectorAll('table.table').forEach(updateLogDataHeader);
        if (settings['extension-toggle'] === false) document.querySelectorAll('table.table tbody tr').forEach(renderLogData);
        else if (isInitialized) queueRows(document.querySelectorAll('table.table tbody tr'), 4);
      });
    }

    document.body.classList.remove(
      'arz-sticky-navbar-active',
      'arz-sticky-headers-active',
      'arz-hide-sidebar-active',
      'arz-vertical-borders-active',
      'arz-remove-top-padding-active',
      'arz-extension-disabled',
      'arz-tweak-copy-row-active',
      'arz-tweak-hide-row-active',
      'arz-tweak-copy-cells-active',
      'arz-tweak-ip-info-active',
      'arz-copy-btn-hover',
      'arz-copy-btn-always'
    );

    if (toggled || changed('visual-logo-customization')) {
      applyLogoCustomization(isEnabled ? settings['visual-logo-customization'] : 'default');
      if (isInitialized) window.ArizonaSidebarManager.updateSettings(arizonaSettings);
    }

    if (toggled || changed('visual-replace-favicon')) applyFaviconCustomization(isEnabled && settings['visual-replace-favicon']);

    if (toggled || changed('tweak-floating-filter')) setupFloatingFilter(isEnabled && settings['tweak-floating-filter']);
    if (toggled || changed('tweak-scroll-top') || changed('tweak-scroll-bottom')) setupScrollButtons(settings);

    document.documentElement.classList.toggle('arz-mask-pending', isEnabled && arizonaSettings.masking?.enabled !== false);
    if (!isEnabled) {
      stopTableWork();
      window.ArizonaMaskingManager.refresh();
      document.body.classList.add('arz-extension-disabled');
      clearIpDetailsFromPage();
      clearCopyableSnippets();
      resetBadges();
      return;
    }

    ensureIconStyles();
    if (isInitialized && toggled && !ecosystemApiData) initEcosystemApi();
    if (settings['visual-sticky-navbar']) {
      document.body.classList.add('arz-sticky-navbar-active');
    }
    if (settings['visual-sticky-headers']) {
      document.body.classList.add('arz-sticky-headers-active');
    }
    if (settings['visual-hide-sidebar']) {
      document.body.classList.add('arz-hide-sidebar-active');
    }
    if (settings['visual-vertical-borders']) {
      document.body.classList.add('arz-vertical-borders-active');
    }
    if (settings['visual-remove-top-padding']) {
      document.body.classList.add('arz-remove-top-padding-active');
    }

    if (settings['tweak-copy-row']) {
      document.body.classList.add('arz-tweak-copy-row-active');
    }
    if (settings['tweak-hide-row']) {
      document.body.classList.add('arz-tweak-hide-row-active');
    }
    if (settings['tweak-copy-cells']) {
      document.body.classList.add('arz-tweak-copy-cells-active');
    }
    if (settings['tweak-ip-info']) document.body.classList.add('arz-tweak-ip-info-active');
    if (isInitialized && (toggled || changed('tweak-ip-info'))) {
      ipGeneration++;
      if (settings['tweak-ip-info'] || arizonaSettings.ipLookupEnabled) initIpRowsObserver();
      else clearIpDetailsFromPage();
    }

    if (changed('tweak-copy-cells') && settings['tweak-copy-cells'] === false) {
      clearCopyableSnippets();
    }

    if (toggled && window.ArizonaSidebarManager) {
      window.ArizonaSidebarManager.updateSettings(arizonaSettings);
    }

    const visibilityMode = settings['tweak-copy-btn-visibility'] || 'hover';
    document.body.classList.add(`arz-copy-btn-${visibilityMode}`);

    renderEcosystemBadges();

    if (isInitialized && (toggled || inventoryChanged || changed('tweak-copy-cells'))) {
      queueRows(document.querySelectorAll('table.table tbody tr'));
    }
    if (isInitialized && toggled) window.ArizonaObservers.start();
  }

  window.ArizonaUtils = {
    openOverlay,
    closeOverlay,
    isValidNickname: isValidNickname,
    escapeHtml: function (str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },
    sendMessageToBackground: function (message) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          try {
            chrome.runtime.sendMessage(message, (response) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response || { success: false });
              }
            });
          } catch (err) {
            resolve({ success: false, error: err.message });
          }
        } else {
          resolve({ success: false, error: 'Extension context not available' });
        }
      });
    },
    debounce: function (func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    },
    throttle: function (func, limit) {
      let inThrottle;
      return function (...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },
    generateId: function () {
      return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
  };

  window.ArizonaNotifications = (function () {
    let container = null;
    function getContainer() {
      if (!container) {
        container = document.createElement('div');
        container.id = 'az-notification-container';
        container.style.cssText = `
          position: fixed !important;
          top: 20px !important;
          right: 20px !important;
          z-index: 1000001 !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 12px !important;
          pointer-events: none !important;
        `;
        document.body.appendChild(container);
      }
      return container;
    }
    const style = document.createElement('style');
    style.id = 'az-notification-styles';
    style.textContent = `
      .az-notification {
        position: relative !important;
        width: 360px !important;
        max-width: calc(100vw - 40px) !important;
        background: var(--az-bg-sidebar) !important;
        border: 1px solid var(--az-border) !important;
        border-left: 4px solid !important;
        border-radius: var(--az-border-radius) !important;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35) !important;
        display: flex !important;
        align-items: flex-start !important;
        gap: 12px !important;
        padding: 14px 16px !important;
        pointer-events: auto !important;
        transform: translateX(420px) !important;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        overflow: hidden !important;
        margin-bottom: 5px;
        font-family: inherit !important;
      }
      .az-notification.show { transform: translateX(0) !important; }
      .az-notification.hide { transform: translateX(420px) !important; }
      .az-notification-success { border-left-color: #10b981 !important; }
      .az-notification-error { border-left-color: #ef4444 !important; }
      .az-notification-warning { border-left-color: #f59e0b !important; }
      .az-notification-info { border-left-color: #3b82f6 !important; }
      .az-notification-icon { flex-shrink: 0 !important; width: 20px !important; height: 20px !important; }
      .az-notification-icon svg { width: 100% !important; height: 100% !important; }
      .az-notification-content { flex: 1 !important; }
      .az-notification-title { font-size: 14px !important; font-weight: 600 !important; color: var(--az-text) !important; margin-bottom: 4px !important; }
      .az-notification-message { font-size: 13px !important; color: var(--az-text-secondary) !important; line-height: 1.4 !important; }
      .az-notification-close { flex-shrink: 0 !important; width: 20px !important; height: 20px !important; background: none !important; border: none !important; color: var(--az-text-secondary) !important; cursor: pointer !important; font-size: 14px !important; display: flex !important; align-items: center !important; justify-content: center !important; border-radius: 4px !important; }
      .az-notification-close:hover { color: var(--az-text) !important; background: var(--az-table-row-hover) !important; }
      .az-notification-progress { position: absolute !important; bottom: 0 !important; left: 0 !important; height: 3px !important; opacity: 0.3 !important; animation: azProgress 4s linear forwards !important; }
      @keyframes azProgress { from { width: 100%; } to { width: 0%; } }
    `;
    (document.head || document.documentElement).appendChild(style);

    return {
      show: function (message, type = 'success') {
        const container = getContainer();
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        const titles = { success: 'Успешно', error: 'Ошибка', warning: 'Внимание', info: 'Информация' };
        const icons = {
          success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17L4 12"/></svg>',
          error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6L18 18"/></svg>',
          warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z"/></svg>',
          info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M12 3a9 9 0 110 18 9 9 0 010-18z"/></svg>'
        };

        const notif = document.createElement('div');
        notif.className = `az-notification az-notification-${type}`;
        notif.style.borderLeftColor = colors[type];
        notif.innerHTML = `
          <div class="az-notification-icon" style="color: ${colors[type]}">${icons[type]}</div>
          <div class="az-notification-content">
            <div class="az-notification-title">${titles[type]}</div>
            <div class="az-notification-message">${window.ArizonaUtils.escapeHtml(message)}</div>
          </div>
          <button class="az-notification-close">✕</button>
          <div class="az-notification-progress" style="background: ${colors[type]};"></div>
        `;
        container.appendChild(notif);
        setTimeout(() => notif.classList.add('show'), 10);

        const removeNotif = () => {
          notif.classList.remove('show');
          notif.classList.add('hide');
          setTimeout(() => notif.remove(), 300);
        };

        notif.querySelector('.az-notification-close').addEventListener('click', removeNotif);
        let t = setTimeout(removeNotif, 4000);

        notif.addEventListener('mouseenter', () => {
          clearTimeout(t);
          const prog = notif.querySelector('.az-notification-progress');
          if (prog) prog.style.animationPlayState = 'paused';
        });

        notif.addEventListener('mouseleave', () => {
          t = setTimeout(removeNotif, 1000);
          const prog = notif.querySelector('.az-notification-progress');
          if (prog) prog.style.animationPlayState = 'running';
        });
      }
    };
  })();

  window.ArizonaHelper = {
    showNotification: function (message, type, force) {
      window.ArizonaNotifications.show(message, type);
    }
  };

  window.ArizonaIpPopupMenu = (function () {
    let currentPopup = null;

    function getIpData(ip) {
      if (ipDetailsCache && ipDetailsCache[ip]) {
        return ipDetailsCache[ip];
      }
      if (window.ArizonaIpLookupManager && typeof window.ArizonaIpLookupManager.getIpData === 'function') {
        return window.ArizonaIpLookupManager.getIpData(ip);
      }
      return null;
    }

    function close() {
      if (currentPopup) {
        currentPopup.classList.remove('open');
        currentPopup.classList.add('closing');
        const pop = currentPopup;
        setTimeout(() => pop.remove(), 200);
        currentPopup = null;
      }
    }

    function open(event, ip, tr) {
      close();

      const nickname = tr ? tr.querySelector('td:nth-child(2) a[href*="player="]')?.textContent.trim() : null;

      const params = new URLSearchParams(window.location.search);
      const serverNumber = params.get('server_number') || '5';
      const minPeriod = params.get('min_period') || '';
      const maxPeriod = params.get('max_period') || '';
      const sort = params.get('sort') || 'desc';
      const limit = params.get('limit') || '1000';

      const buildIpLogsUrl = (ipAddress) => {
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('server_number', serverNumber);
        url.searchParams.set('ip', ipAddress);
        if (minPeriod) url.searchParams.set('min_period', minPeriod);
        if (maxPeriod) url.searchParams.set('max_period', maxPeriod);
        url.searchParams.set('sort', sort);
        url.searchParams.set('limit', limit);
        for (const [key, value] of params.entries()) {
          if (key.startsWith('type')) {
            url.searchParams.append(key, value);
          }
        }
        return url.toString();
      };

      const buildIpPlayerLogsUrl = (ipAddress, playerNick) => {
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set('server_number', serverNumber);
        url.searchParams.set('ip', ipAddress);
        if (playerNick) url.searchParams.set('player', playerNick);
        if (minPeriod) url.searchParams.set('min_period', minPeriod);
        if (maxPeriod) url.searchParams.set('max_period', maxPeriod);
        url.searchParams.set('sort', sort);
        url.searchParams.set('limit', limit);
        for (const [key, value] of params.entries()) {
          if (key.startsWith('type')) {
            url.searchParams.append(key, value);
          }
        }
        return url.toString();
      };

      const ipLogsUrl = buildIpLogsUrl(ip);
      const ipPlayerLogsUrl = buildIpPlayerLogsUrl(ip, nickname);

      const dropdown = document.createElement('div');
      dropdown.className = 'arz-ip-dropdown';

      function getInfoHtml(loading = false) {
        const ipData = getIpData(ip);
        let infoHtml = '';
        if (ipData && ipData.status === 'success') {
          const locationParts = [];
          if (ipData.country) locationParts.push(ipData.country);
          if (ipData.regionName) locationParts.push(ipData.regionName);
          if (ipData.city) locationParts.push(ipData.city);
          const locationText = locationParts.join(', ');

          const safetyBadges = [];
          if (ipData.proxy) {
            safetyBadges.push(`<span class="arz-badge-proxy" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-user-shield" style="font-size: 10px; color: #ef4444 !important; width: auto !important; margin: 0 !important;"></i> VPN/Прокси</span>`);
          }
          if (ipData.mobile) {
            safetyBadges.push(`<span class="arz-badge-mobile" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-mobile-screen-button" style="font-size: 10px; color: #3b82f6 !important; width: auto !important; margin: 0 !important;"></i> Мобильный</span>`);
          }
          if (ipData.hosting) {
            safetyBadges.push(`<span class="arz-badge-hosting" style="background: rgba(168, 85, 247, 0.15); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.3); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-cloud" style="font-size: 10px; color: #a855f7 !important; width: auto !important; margin: 0 !important;"></i> Хостинг</span>`);
          }

          const safetyBadgesHtml = safetyBadges.length > 0
            ? `<hr class="arz-ip-dropdown-divider" style="display: block !important;"><div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; padding: 2px 0;">${safetyBadges.join('')}</div>`
            : '';

          infoHtml = `
            <div class="arz-ip-dropdown-info">
              ${locationText ? `<div><i class="fa-solid fa-location-dot"></i> <span><b>Место:</b> ${window.ArizonaUtils.escapeHtml(locationText)}</span></div>` : ''}
              ${ipData.isp ? `<div><i class="fa-solid fa-wifi"></i> <span><b>Провайдер:</b> ${window.ArizonaUtils.escapeHtml(ipData.isp)}</span></div>` : ''}
              ${ipData.org && ipData.org !== ipData.isp ? `<div><i class="fa-solid fa-building"></i> <span><b>Орг:</b> ${window.ArizonaUtils.escapeHtml(ipData.org)}</span></div>` : ''}
              ${ipData.as ? `<div><i class="fa-solid fa-hashtag"></i> <span><b>AS:</b> <span style="font-size: 11px; color: var(--az-text-secondary);">${window.ArizonaUtils.escapeHtml(ipData.as)}</span></span></div>` : ''}
              ${safetyBadgesHtml}
            </div>
            <hr class="arz-ip-dropdown-divider">
          `;
        } else {
          infoHtml = `
            <div class="arz-ip-dropdown-info" style="color: #cbd5e1; font-weight: 500;">
              <i class="fa-solid ${loading ? 'fa-circle-notch fa-spin' : 'fa-location-dot'}"></i>
              ${loading ? 'Загрузка геолокации…' : ipLookupFailures.get(ip)?.retryable === false ? 'Данные о геолокации не найдены' : 'Не удалось загрузить геолокацию'}
            </div>
            ${loading ? '' : '<button class="arz-ip-dropdown-item arz-ip-dropdown-retry"><i class="fa-solid fa-rotate-right"></i> Повторить загрузку</button>'}
            <hr class="arz-ip-dropdown-divider">
          `;
        }
        return infoHtml;
      }

      dropdown.innerHTML = `
        <div class="arz-ip-dropdown-header"><i class="fa-solid fa-earth-americas"></i> IP: ${ip}</div>
        <div class="arz-ip-dropdown-geo">${getInfoHtml(!getIpData(ip))}</div>
        <button class="arz-ip-dropdown-item arz-ip-dropdown-copy"><i class="fa-regular fa-copy"></i> Копировать IP</button>
        <a href="${ipLogsUrl}" class="arz-ip-dropdown-item"><i class="fa-solid fa-magnifying-glass"></i> Логи IP</a>
        ${nickname ? `<a href="${ipPlayerLogsUrl}" class="arz-ip-dropdown-item"><i class="fa-solid fa-user"></i> Логи IP + Ник</a>` : ''}
      `;

      document.body.appendChild(dropdown);
      currentPopup = dropdown;

      async function loadInfo() {
        const info = dropdown.querySelector('.arz-ip-dropdown-geo');
        info.innerHTML = getInfoHtml(true);
        await ensureIpDetails([ip], true);
        if (currentPopup !== dropdown) return;
        info.innerHTML = getInfoHtml();
        if (tr?.isConnected && getIpData(ip)) processIpsForRowsBatch([tr]);
      }

      dropdown.addEventListener('click', event => {
        if (event.target.closest('.arz-ip-dropdown-retry')) {
          event.stopPropagation();
          loadInfo();
        }
      });
      if (!getIpData(ip)) loadInfo();

      const rect = event.target.getBoundingClientRect();
      dropdown.style.position = 'fixed';
      dropdown.style.top = rect.bottom + 'px';
      dropdown.style.left = rect.left + 'px';

      const dropdownRect = dropdown.getBoundingClientRect();

      if (rect.bottom + dropdownRect.height > window.innerHeight) {
        dropdown.style.top = (rect.top - dropdownRect.height) + 'px';
      }

      if (rect.left + dropdownRect.width > window.innerWidth) {
        dropdown.style.left = (rect.right - dropdownRect.width) + 'px';
      }

      dropdown.classList.add('open');

      dropdown.querySelector('.arz-ip-dropdown-copy').onclick = (e) => {
        e.stopPropagation();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ip).then(() => {
            window.ArizonaNotifications.show('IP скопирован', 'success');
            close();
          });
        }
      };
    }

    document.addEventListener('click', (e) => {
      if (currentPopup && !currentPopup.contains(e.target)) {
        close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
      }
    });

    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close, { passive: true });

    return {
      open: open,
      close: close
    };
  })();

  document.addEventListener('click', (e) => {
    const target = e.target;

    if (target.closest('.arz-ip-dropdown')) {
      return;
    }

    const anchor = target.closest('a');
    let ip = null;

    const href = anchor ? anchor.getAttribute('href') : null;
    if (href && !href.startsWith('#')) {
      try {
        const url = new URL(anchor.href, window.location.href);
        ip = url.searchParams.get('ip') || url.searchParams.get('dynamic[109]');
      } catch (err) {
        const match = anchor.href.match(/[?&]ip=([^&]+)/);
        if (match) ip = decodeURIComponent(match[1]);
      }
    }

    if (!ip) {
      const elWithDataIp = target.closest('[data-ip]');
      if (elWithDataIp) {
        ip = elWithDataIp.getAttribute('data-ip');
      }
    }

    const clickableSpan = target.closest('.az-clickable-ip');
    if (clickableSpan && !ip) {
      ip = clickableSpan.getAttribute('data-ip');
    }

    const IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (ip && IP_REGEX.test(ip.trim())) {
      ip = ip.trim();
      e.preventDefault();
      e.stopPropagation();

      const tr = target.closest('tr');
      window.ArizonaIpPopupMenu.open(e, ip, tr);
    }
  }, true);

  window.ArizonaModalManager = (function () {
    let currentModal = null;
    return {
      open: function (options) {
        this.close();
        const overlay = document.createElement('div');
        overlay.className = 'alh-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'arz-modal';
        if (options.width) modal.style.width = options.width;

        let buttonsHtml = '';
        if (options.buttons) {
          buttonsHtml = options.buttons.map(btn => `<button class="btn ${btn.class || 'btn-secondary'}" data-action="${btn.text}">${btn.text}</button>`).join('');
        }

        modal.innerHTML = `
          <div class="alh-modal-header" style="display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--az-border); background: var(--az-bg-sidebar);">
            <h3 style="font-size: 17px; font-weight: 600; color: var(--az-text); margin: 0;">${options.title || ''}</h3>
            <button class="alh-modal-close" style="background: none; border: none; cursor: pointer; color: var(--az-text-secondary); font-size: 20px; font-weight: bold;">&times;</button>
          </div>
          <div class="alh-modal-body" style="padding: 20px; color: var(--az-text); font-size: 13px; line-height: 1.5; background: var(--az-card-bg);">
            ${options.content || ''}
          </div>
          <div class="alh-modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; padding: 18px 20px; border-top: 1px solid var(--az-border); background: var(--az-bg-sidebar);">
            ${buttonsHtml}
          </div>
        `;
        overlay.appendChild(modal);
        openOverlay(overlay);
        currentModal = overlay;

        modal.querySelector('.alh-modal-close').addEventListener('click', () => this.close());

        if (options.buttons) {
          const buttons = modal.querySelectorAll('.alh-modal-footer button');
          buttons.forEach((btn, idx) => {
            btn.addEventListener('click', () => {
              if (options.buttons[idx].onClick) options.buttons[idx].onClick();
              if (options.buttons[idx].closeOnClick !== false) this.close();
            });
          });
        }
        if (options.onOpen) setTimeout(options.onOpen, 10);
      },
      close: function () {
        if (currentModal) {
          closeOverlay(currentModal);
          currentModal = null;
        }
      }
    };
  })();

  window.ArizonaObservers = (function () {
    let observer = null;
    let structureObserver = null;
    let tbody = null;
    let writing = false;
    const ownedSelector = '[class*="arz-"], [class*="alh-"], .az-geo-inserted, .arizona-ecosystem-badge';

    function forget(row) {
      accountScanDirty = true;
      queuedRows.delete(row);
      pendingRowControls.delete(row);
      priorityRows.delete(row);
      rowReasons.delete(row);
      accountMarkedRows.delete(row);
      pendingIpRows.delete(row);
      ipRetryRows.delete(row);
      ipRetryAttempts.delete(row);
      ipRowObserver?.unobserve(row);
      rowControlsObserver?.unobserve(row);
      window.ArizonaInventoryLogs?.forget(row);
      rowIndex.remove(row);
      if (row.cells) for (const cell of row.cells) {
        ipCellCache.delete(cell);
        logDataCells.delete(cell);
      }
    }

    function bind() {
      const next = document.querySelector('table.table tbody');
      if (next === tbody) return;
      releaseTableLayout();
      if (tbody) for (const row of tbody.rows) forget(row);
      observer?.disconnect();
      window.ArizonaRuntime.cancelTask(finishTask);
      finishTask = null;
      tbody = next;
      tableHasProcessedRows = false;
      rowIndex.clear();
      ipGeneration++;
      accountScanGeneration++;
      window.ArizonaRuntime.cancelTask(accountScanTask);
      accountScanTask = null;
      if (tbody) {
        observer?.observe(tbody, { childList: true, subtree: true, characterData: true });
        logDataTableSettings.delete(tbody.closest('table'));
        queueRows(tbody.rows);
      }
      if (!tbody?.rows.length) finishTableProcessing();
      styleResetButton();
    }

    function structureChanges(records) {
      if (currentSettings['extension-toggle'] === false) return;
      for (const record of records) {
        if (record.target.nodeType === 1 && record.target.closest('tbody, form.filter, .alh-page-popovers, #arz-bulk-actions-bar')) continue;
        if (record.target.nodeType === 1 && record.target.closest('thead')) {
          const table = record.target.closest('table.table');
          if (table) {
            logDataTableSettings.delete(table);
            updateLogDataHeader(table);
          }
        }
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== 1) continue;
          if ((tbody && (node === tbody || node.contains(tbody))) || node.matches('table.table') ||
              (node.tagName === 'TBODY' && record.target.nodeType === 1 && record.target.matches('table.table')) ||
              (node.childElementCount && node.querySelector('table.table'))) {
            bind();
            return;
          }
        }
      }
    }

    function changes(records) {
      if (!records.length || !tbody || currentSettings['extension-toggle'] === false) return;
      const changed = new Set();
      let removed = false;
      for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!target || (target !== tbody && !tbody.contains(target))) continue;
        const owner = target.closest(ownedSelector);
        if (owner && tbody.contains(owner) && owner !== tbody && owner.tagName !== 'TR' && !owner.classList.contains('arz-copyable-snippet')) continue;
        if (record.type === 'childList') {
          const nodes = [...record.addedNodes, ...record.removedNodes];
          if (nodes.length && nodes.every(node => node.nodeType === 1 && node.tagName !== 'TR' && node.matches(ownedSelector))) continue;
        }
        const row = target.closest('tr');
        if (row && row.parentElement === tbody) changed.add(row);
        for (const node of record.removedNodes || []) {
          if (node.nodeType === 1 && node.tagName === 'TR' && node.parentElement !== tbody) {
            forget(node);
            removed = true;
          }
        }
        for (const node of record.addedNodes || []) {
          if (node.nodeType === 1 && node.tagName === 'TR' && node.parentElement === tbody) changed.add(node);
        }
        if (row && row.parentElement === tbody) {
          const cell = target.closest('td');
          if (cell === row.cells[2]) logDataCells.delete(cell);
        }
      }
      for (const row of changed) {
        for (const cell of row.cells) ipCellCache.delete(cell);
        row.removeAttribute('data-arz-ip-processed');
      }
      queueRows(changed);
      if (removed && !queuedRows.size) finishTableProcessing();
    }

    return {
      init() { this.start(); },
      start() {
        if (observer || currentSettings['extension-toggle'] === false) return;
        observer = new MutationObserver(changes);
        structureObserver = new MutationObserver(structureChanges);
        structureObserver.observe(document.body, { childList: true, subtree: true });
        const previous = tbody;
        bind();
        if (previous === tbody && tbody) {
          observer.observe(tbody, { childList: true, subtree: true, characterData: true });
          processTable();
        }
      },
      stop() {
        observer?.disconnect();
        structureObserver?.disconnect();
        observer = null;
        structureObserver = null;
      },
      write(callback) {
        if (writing) return callback();
        if (structureObserver) structureChanges(structureObserver.takeRecords());
        if (observer) changes(observer.takeRecords());
        writing = true;
        try { return callback(); }
        finally {
          if (structureObserver) structureChanges(structureObserver.takeRecords());
          observer?.takeRecords();
          writing = false;
        }
      }
    };
  })();

  window.ArizonaMaskingManager = (function () {
    const IP_REGEX = /\b\d{1,3}(\.\d{1,3}){3}\b/g;
    const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
    const TG_REGEX = /@([A-Za-z0-9_]+)/g;
    const TG_ID_REGEX = /TG ID:\s*(\d+)/g;
    const VK_REGEX = /([А-Яа-яA-Za-z0-9_]+)\s*\(VK ID:\s*(\d+)\)/g;
    const VK_ID_REGEX = /VK ID:\s*(\d+)/g;
    const originalText = new WeakMap();
    let settings = { masking: { enabled: true, maskIp: true, maskEmail: true, maskTG: true, maskVK: true } };

    function maskIP(ip) {
      if (settings.masking?.maskIp === false) return ip;
      if (ip.includes('***') || ip.includes('****')) return ip;
      const parts = ip.split('.');
      if (parts.length === 4) return parts[0] + '.***';
      return ip.substring(0, 2) + '****';
    }

    function maskEmail(email) {
      if (settings.masking?.maskEmail === false) return email;
      if (email.includes('***') || email.includes('****')) return email;
      const atIndex = email.indexOf('@');
      if (atIndex <= 3) return email.slice(0, 1) + '***@' + email.slice(atIndex + 1);
      if (atIndex <= 6) return email.slice(0, 3) + '***@' + email.slice(atIndex + 1);
      return email.slice(0, 4) + '***@' + email.slice(atIndex + 1);
    }

    function maskTG(text) {
      if (settings.masking?.maskTG === false) return text;
      let result = text;
      result = result.replace(TG_REGEX, (match, username) => {
        if (username.includes('***') || username.includes('****')) return match;
        if (username.length > 4) return '@' + username.slice(0, 4) + '****';
        return '@' + username.slice(0, 2) + '***';
      });
      result = result.replace(TG_ID_REGEX, (match, id) => {
        if (id.includes('***') || id.includes('****')) return match;
        if (id.length > 8) return 'TG ID: ' + id.slice(0, 4) + '****' + id.slice(-4);
        return 'TG ID: ' + id.slice(0, 2) + '****' + id.slice(-2);
      });
      return result;
    }

    function maskVK(text) {
      if (settings.masking?.maskVK === false) return text;
      let result = text;
      result = result.replace(VK_REGEX, (match, name, id) => {
        let mName = name;
        let mId = id;
        if (!name.includes('***') && !name.includes('****')) {
          mName = name.length > 6 ? name.slice(0, 4) + '****' + name.slice(-2) : name.slice(0, 4) + '****';
        }
        if (!id.includes('***') && !id.includes('****')) {
          mId = id.length > 8 ? id.slice(0, 4) + '****' + id.slice(-4) : id.slice(0, 2) + '****' + id.slice(-2);
        }
        return `${mName} (VK ID: ${mId})`;
      });
      result = result.replace(VK_ID_REGEX, (match, id) => {
        if (id.includes('***') || id.includes('****')) return match;
        if (id.length > 8) return 'VK ID: ' + id.slice(0, 4) + '****' + id.slice(-4);
        return 'VK ID: ' + id.slice(0, 2) + '****' + id.slice(-2);
      });
      return result;
    }

    function processTextNode(node) {
      const stored = originalText.get(node);
      const text = stored && node.nodeValue === stored.rendered ? stored.original : node.nodeValue;
      if (currentSettings['extension-toggle'] === false || settings.masking?.enabled === false) {
        if (node.nodeValue !== text) node.nodeValue = text;
        originalText.delete(node);
        return;
      }
      if (!text || text.trim() === '') return;
      const masking = settings.masking || { maskIp: true, maskEmail: true, maskTG: true, maskVK: true };
      let changed = false;
      let newText = text;

      const hasDigit = /\d/.test(newText);
      const hasDot = newText.includes('.');
      const hasAt = newText.includes('@');
      const hasVk = newText.includes('VK') || newText.includes('vk') || newText.includes('Vk') || newText.includes('vK');
      const hasTg = hasAt || newText.includes('TG') || newText.includes('tg') || newText.includes('Tg') || newText.includes('tG');

      if (!hasDigit && !hasDot && !hasAt && !hasVk && !hasTg) {
        return;
      }

      if (masking.maskIp !== false && hasDot && hasDigit) {
        const temp = newText.replace(IP_REGEX, ip => maskIP(ip));
        if (temp !== newText) { newText = temp; changed = true; }
      }
      if (masking.maskEmail !== false && hasAt && hasDot) {
        const temp = newText.replace(EMAIL_REGEX, email => maskEmail(email));
        if (temp !== newText) { newText = temp; changed = true; }
      }
      if (masking.maskTG !== false && hasTg) {
        const temp = maskTG(newText);
        if (temp !== newText) { newText = temp; changed = true; }
      }
      if (masking.maskVK !== false && hasVk) {
        const temp = maskVK(newText);
        if (temp !== newText) { newText = temp; changed = true; }
      }
      if (changed || node.nodeValue !== newText) {
        originalText.set(node, { original: text, rendered: newText });
        node.nodeValue = newText;
      }
    }

    function walk(node) {
      if (node.nodeType === 3) {
        processTextNode(node);
      } else if (node.nodeType === 1) {
        const tagName = node.tagName;
        if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'TEXTAREA' || tagName === 'INPUT') return;

        const classList = node.classList;
        if (classList && (classList.contains('az-geo-inserted') || classList.contains('table-ip'))) return;
        if (tagName === 'A' && node.hasAttribute('data-ip')) return;

        let child = node.firstChild;
        while (child) {
          walk(child);
          child = child.nextSibling;
        }
      }
    }

    function runMasking() {
      const tableBody = document.querySelector('table.table tbody');
      if (tableBody) {
        walk(tableBody);
      } else {
        walk(document.body);
      }
    }

    return {
      init: function (settingsData) {
        settings = settingsData || {};
        if (!settings.masking) settings.masking = { enabled: true, maskIp: true, maskEmail: true, maskTG: true, maskVK: true };
        document.documentElement.classList.toggle('arz-mask-pending', currentSettings['extension-toggle'] !== false && settings.masking?.enabled !== false);
      },
      updateSettings: function (settingsData) {
        settings = settingsData || {};
        queueRows(document.querySelectorAll('table.table tbody tr'));
      },
      maskText: function (text) {
        const node = document.createTextNode(text);
        processTextNode(node);
        return node.nodeValue;
      },
      maskRow: function (tr) {
        const len = tr.cells.length;
        for (let i = 1; i < len; i++) {
          const cell = tr.cells[i];
          if (!cell) continue;
          if (currentSettings['extension-toggle'] !== false && settings.masking?.enabled !== false && !/[.@]|vk|tg/i.test(cell.textContent)) continue;
          walk(cell);
        }
      },
      startObserver: function () {
      },
      stopObserver: function () {
      },
      refresh: function () {
        runMasking();
      },
      handleCopy: function (e, settingsData) {
        if (currentSettings['extension-toggle'] === false) return;
        const selection = window.getSelection().toString();
        if (!selection) return;

        let cleaned = selection;
        const singleIpRegex = /^\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s*$/;
        if (!singleIpRegex.test(selection)) {
          const ipGeoRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?:\s*\([^)]*\))?(?:\s*~\d+(?:\.\d+)?km)?/g;
          cleaned = cleaned.replace(ipGeoRegex, '');
        }

        const masking = settingsData?.masking || { enabled: true, maskIp: true, maskEmail: true, maskTG: true, maskVK: true };
        if (masking.enabled !== false) {
          if (masking.maskEmail !== false) cleaned = cleaned.replace(EMAIL_REGEX, email => maskEmail(email));
          if (masking.maskTG !== false) cleaned = maskTG(cleaned);
          if (masking.maskVK !== false) cleaned = maskVK(cleaned);
        }
        if (cleaned !== selection) {
          e.clipboardData.setData('text/plain', cleaned);
          e.preventDefault();
        }
      }
    };
  })();

  window.ArizonaIpLookupManager = (function () {
    return {
      init: function (settingsData) {
        initIpRowsObserver();
      },
      processTable: function () {
        initIpRowsObserver();
      },
      updateSettings: function (newSettings) {
        ipGeneration++;
        if (!newSettings.ipLookupEnabled && !currentSettings['tweak-ip-info']) clearIpDetailsFromPage();
        else {
          for (const row of document.querySelectorAll('table.table tbody tr')) row.removeAttribute('data-arz-ip-processed');
        }
        initIpRowsObserver();
      },
      getIpData: function (ip) {
        return ipDetailsCache[ip];
      }
    };
  })();

  window.ArizonaTuningAHKManager = (function () {
    return {
      init: function (s) {
        arizonaSettings = s || {};
        if (isInitialized && currentSettings['extension-toggle'] !== false && arizonaSettings.tuningParts?.enabled) {
          runWhenElementExists('tbody tr', () => this.apply());
        }
      },
      updateSettings: function (s) {
        arizonaSettings = s || {};
        if (currentSettings['extension-toggle'] !== false && arizonaSettings.tuningParts?.enabled) {
          this.apply();
        } else {
          document.querySelectorAll('tbody tr').forEach(row => {
            if (sakaiCompatible()) row.classList.remove('alh-tuning-match');
            else row.style.outline = '';
          });
        }
      },
      apply: function () {
        document.querySelectorAll('tbody tr').forEach(row => {
          highlightTuningAHK(row);
        });
        handleTuningAutoScroll();
      }
    };
  })();

  window.ArizonaTgVkDetector = (function () {
    let done = false;
    let scannedRevision = -1;
    let settings = {};
    let lastScannedRowCount = 0;
    return {
      init: function (s) { settings = s || {}; done = false; lastScannedRowCount = 0; runWhenElementExists('.filter-buttons', () => this.scan()); },
      reset: function () { done = false; lastScannedRowCount = 0; },
      updateSettings: function (s) {
        settings = s || {};
        done = false;
        lastScannedRowCount = 0;
        this.scan();
      },
      scan: function () {
        const existing = document.getElementById('az-tgvk-check-section');
        const isEnabled = currentSettings['extension-toggle'] !== false && settings.tools?.tgVkDetectorEnabled !== false;
        if (!isEnabled) {
          if (existing) existing.remove();
          return;
        }
        if (done && scannedRevision === rowIndex.revision) return;
        scannedRevision = rowIndex.revision;
        const sel = document.querySelector('select[name="type[]"]');
        if (!sel || !Array.from(sel.selectedOptions).some(o => o.value === 'mail')) { existing?.remove(); return; }
        const btn = document.querySelector('.filter-buttons');
        if (!btn) return;

        if (existing) existing.remove();
        const tg = rowIndex.tg, vk = rowIndex.vk;
        const dupTg = Array.from(tg.entries()).filter(([_, e]) => e > 1);
        const dupVk = Array.from(vk.entries()).filter(([_, e]) => e > 1);
        if (dupTg.length === 0 && dupVk.length === 0) return;

        const sec = document.createElement('div');
        sec.id = 'az-tgvk-check-section';
        sec.className = 'arz-warn-section';
        let html = `<div class="arz-warn-header"><i class="fa-solid fa-magnifying-glass"></i> Повторяющиеся TG/VK (возможные боты)</div>`;
        if (dupTg.length > 0) {
          html += `<div class="arz-warn-group-title"><i class="fa-brands fa-telegram"></i> Telegram</div><div class="arz-warn-list">`;
          dupTg.forEach(([id, e]) => {
            const col = e >= 10 ? '#ef4444' : e >= 5 ? '#f59e0b' : '#10b981';
            html += `<div class="arz-warn-item"><span class="arz-warn-item-key">${window.ArizonaUtils.escapeHtml(window.ArizonaMaskingManager.maskText("@" + id).slice(1))}</span><span class="arz-warn-badge" style="background: ${col};">${e} акк.</span></div>`;
          });
          html += `</div>`;
        }
        if (dupVk.length > 0) {
          html += `<div class="arz-warn-group-title"><i class="fa-brands fa-vk"></i> VK</div><div class="arz-warn-list">`;
          dupVk.forEach(([id, e]) => {
            const col = e >= 10 ? '#ef4444' : e >= 5 ? '#f59e0b' : '#10b981';
            html += `<div class="arz-warn-item"><span class="arz-warn-item-key">VK ID: ${window.ArizonaUtils.escapeHtml(window.ArizonaMaskingManager.maskText("@" + id).slice(1))}</span><span class="arz-warn-badge" style="background: ${col};">${e} акк.</span></div>`;
          });
          html += `</div>`;
        }
        sec.innerHTML = html;
        btn.insertAdjacentElement('afterend', sec);
        done = true;
      }
    };
  })();

  window.ArizonaEmailDetector = (function () {
    let done = false;
    let scannedRevision = -1;
    let settings = {};
    let lastScannedRowCount = 0;
    return {
      init: function (s) { settings = s || {}; done = false; lastScannedRowCount = 0; runWhenElementExists('.filter-buttons', () => this.scan()); },
      reset: function () { done = false; lastScannedRowCount = 0; },
      updateSettings: function (s) {
        settings = s || {};
        done = false;
        lastScannedRowCount = 0;
        this.scan();
      },
      scan: function () {
        const existing = document.getElementById('az-email-check-section');
        const isEnabled = currentSettings['extension-toggle'] !== false && settings.emailCheck?.enabled !== false;
        if (!isEnabled) {
          if (existing) existing.remove();
          return;
        }
        if (done && scannedRevision === rowIndex.revision) return;
        scannedRevision = rowIndex.revision;
        const sel = document.querySelector('select[name="type[]"]');
        if (!sel || !Array.from(sel.selectedOptions).some(o => o.value === 'mail')) { existing?.remove(); return; }
        const btn = document.querySelector('.filter-buttons');
        if (!btn) return;

        if (existing) existing.remove();
        const emails = rowIndex.emails;
        const threshold = settings.emailCheck?.threshold || 3;
        const dups = Array.from(emails.entries()).filter(([_, c]) => c >= threshold).sort((a, b) => b[1] - a[1]);
        if (dups.length === 0) return;

        const sec = document.createElement('div');
        sec.id = 'az-email-check-section';
        sec.className = 'arz-warn-section';

        const server = document.querySelector('select[name="server_number"]')?.value || '5';
        const minP = document.querySelector('input[name="min_period"]')?.value || '2026-01-01 00:00:00';
        const low = settings.emailCheck?.lowColor || '#10b981';
        const med = settings.emailCheck?.mediumColor || '#f59e0b';
        const high = settings.emailCheck?.highColor || '#ef4444';

        let html = `<div class="arz-warn-header"><i class="fa-solid fa-magnifying-glass"></i> Повторяющиеся почты (возможные боты)</div><table class="arz-warn-table"><thead><tr><th><i class="fa-regular fa-envelope"></i> Почта</th><th><i class="fa-solid fa-users"></i> Аккаунтов</th></tr></thead><tbody>`;
        dups.forEach(([mail, count]) => {
          const bg = count >= 10 ? high : count >= 5 ? med : low;
          const url = `https://arizonarp.logsparser.info/?server_number=${server}&type%5B%5D%5B%5D=mail&sort=desc&min_period=${encodeURIComponent(minP)}&dynamic%5B109%5D=${encodeURIComponent(mail)}`;
          html += `<tr><td><a href="${url}">${window.ArizonaUtils.escapeHtml(window.ArizonaMaskingManager.maskText(mail))}</a></td><td><span class="arz-warn-badge" style="background: ${bg};">${count}</span></td></tr>`;
        });
        html += '</tbody></table>';
        sec.innerHTML = html;
        btn.insertAdjacentElement('afterend', sec);
        done = true;
      }
    };
  })();

  window.ArizonaColumnEyeButtons = (function () {
    let col3Hidden = false, col4Hidden = false;
    let settings = {};

    function toggle(idx, hide) {
      const name = `arz-hide-column-${idx}`;
      if (document.documentElement.classList.contains(name) !== hide) document.documentElement.classList.toggle(name, hide);
    }

    function addEye(th, type, getHidden, setHidden, idx) {
      if (!th) return;
      let btn = th.querySelector('.alh-col-eye-btn');
      if (!btn) {
        btn = document.createElement('span');
        btn.setAttribute('role', 'button');
        btn.className = 'alh-col-eye-btn';
        btn.onclick = (e) => {
          e.stopPropagation();
          setHidden(!getHidden());
          if (!settings.hiddenColumns) settings.hiddenColumns = {};
          settings.hiddenColumns[type === 'data' ? 'col3' : 'col4'] = getHidden();
          chrome.storage.local.set({ arizonaSettings: settings });
          btn.innerHTML = `<i class="fa-regular fa-eye${getHidden() ? '-slash' : ''}" style="font-size:13px;"></i>`;
          th.style.opacity = getHidden() ? '0.4' : '';
          toggle(idx, getHidden());
        };
        th.appendChild(btn);
      }
      const icon = getHidden() ? 'fa-eye-slash' : 'fa-eye';
      if (!btn.firstElementChild?.classList.contains(icon)) btn.innerHTML = `<i class="fa-regular ${icon}" style="font-size:13px;"></i>`;
      const opacity = getHidden() ? '0.4' : '';
      if (th.style.opacity !== opacity) th.style.opacity = opacity;
      toggle(idx, getHidden());
    }

    function removeEye(th, idx) {
      if (!th) return;
      const btn = th.querySelector('.alh-col-eye-btn');
      if (btn) btn.remove();
      th.style.opacity = '';
      toggle(idx, false);
    }

    return {
      init: function (s) {
        settings = s || {};
        if (settings.hiddenColumns) {
          col3Hidden = !!settings.hiddenColumns.col3;
          col4Hidden = !!settings.hiddenColumns.col4;
        }
        this.update();
      },
      updateSettings: function (s) {
        settings = s || {};
        if (settings.hiddenColumns) {
          col3Hidden = !!settings.hiddenColumns.col3;
          col4Hidden = !!settings.hiddenColumns.col4;
        }
        this.update();
      },
      update: function () {
        if (sakaiCompatible()) return;
        const isEnabled = currentSettings['extension-toggle'] !== false && settings.tools?.columnEyeButtons !== false;
        const ths = document.querySelectorAll('table.table thead tr th');
        if (ths.length >= 4) {
          if (isEnabled) {
            addEye(ths[2], 'data', () => col3Hidden, (val) => col3Hidden = val, 3);
            addEye(ths[3], 'ip', () => col4Hidden, (val) => col4Hidden = val, 4);
          } else {
            removeEye(ths[2], 3);
            removeEye(ths[3], 4);
          }
        }
      }
    };
  })();

  window.ArizonaLogFilter = (function () {
    let settings = {};
    function getMode() { return document.querySelector('input[name="arz-filter-logs-mode"]:checked')?.value || 'show'; }
    function autoApply() { if (document.getElementById('arz-filter-logs-auto')?.checked) apply(false); }

    function apply(toast = false) {
      const ta = document.getElementById('arz-filter-logs');
      if (!ta) return;
      const useRegex = !!document.getElementById('arz-filter-logs-regex')?.checked;
      const filters = ta.value.split('\n').map(f => f.trim()).filter(f => f.length > 0);
      let regexFilters = [];
      if (useRegex) {
        try {
          regexFilters = filters.map(f => new RegExp(f, 'i'));
        } catch (error) {
          if (toast && window.ArizonaNotifications) window.ArizonaNotifications.show(`Ошибка регулярного выражения: ${error.message}`, 'error');
          return;
        }
      }
      const rows = document.querySelectorAll('table.table tbody tr');
      const mode = getMode();
      let shown = 0, hidden = 0;

      rows.forEach(row => {
        const cell = row.querySelector('td:nth-child(2)');
        if (!cell) return;
        const text = cell.textContent;
        if (filters.length === 0) { row.style.display = ''; shown++; return; }
        const match = useRegex
          ? regexFilters.some(regex => regex.test(text))
          : filters.some(f => text.toLowerCase().includes(f.toLowerCase()));
        const hide = mode === 'show' ? !match : match;
        row.style.display = hide ? 'none' : '';
        if (hide) hidden++; else shown++;
      });
      if (toast && filters.length > 0) window.ArizonaNotifications.show(`Показано: ${shown} / Скрыто: ${hidden}`, 'info');
      chrome.storage.local.set({ arzLogFilter: { text: ta.value, mode: mode, auto: document.getElementById('arz-filter-logs-auto')?.checked, regex: useRegex } });
    }

    return {
      init: function (s) {
        settings = s || {};
        this.update();
      },
      updateSettings: function (s) {
        settings = s || {};
        this.update();
      },
      update: function () {
        const isEnabled = currentSettings['extension-toggle'] !== false && settings.tools?.filterWindow !== false;
        if (isEnabled) {
          runWhenElementExists('.filter-buttons', () => this.createUI());
        } else {
          this.removeUI();
        }
      },
      removeUI: function () {
        const root = document.getElementById('alh-log-filter-root');
        if (root) root.remove();
        const ta = document.getElementById('arz-filter-logs');
        if (ta) {
          const container = ta.closest('.col-sm-3, .col-sm-4');
          if (container) container.remove();
          else ta.remove();
        }
        if (!sakaiCompatible()) document.querySelectorAll('table.table tbody tr').forEach(r => r.style.display = '');
      },
      createUI: function () {
        if (document.getElementById('alh-log-filter-root')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;

        const div = document.createElement('div');
        div.id = 'alh-log-filter-root';
        div.className = 'col-sm-4 pt-3';
        div.innerHTML = `
          
          <div class="alh-search-actions">
            <button type="button" id="alh-filter-logs-submit" class="btn btn-success"><i class="fa-solid fa-magnifying-glass"></i> Применить поиск</button>
            <button type="button" id="alh-filter-logs-reset" class="btn btn-secondary" title="Сбросить поиск"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3-3"/></svg></button>
          </div>
          <div id="arz-filter-logs-options">
            <div class="alh-search-segments" role="group" aria-label="Режим поиска"><div class="form-check alh-search-mode">
              <input class="form-check-input" type="radio" name="arz-filter-logs-mode" id="arz-filter-mode-show" value="show" checked>
              <label class="form-check-label" for="arz-filter-mode-show">Оставить</label>
            </div>
            <div class="form-check alh-search-mode">
              <input class="form-check-input" type="radio" name="arz-filter-logs-mode" id="arz-filter-mode-hide" value="hide">
              <label class="form-check-label" for="arz-filter-mode-hide">Скрыть</label>
            </div>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="arz-filter-logs-auto">
              <label class="form-check-label" for="arz-filter-logs-auto">Применять при загрузке страницы</label>
            </div>
          </div>
        `;
        const taDiv = document.createElement('div');
        taDiv.className = 'pt-3 col-sm-4';
        taDiv.innerHTML = `
          <div id="arz-log-filter-title" class="arz-filter-field-title"><i class="fa-solid fa-magnifying-glass"></i>Фильтр для поиска среди логов на странице</div>
          <textarea id="arz-filter-logs" class="form-control" rows="3" placeholder="Фильтр для поиска в логах..." style="height:102px; background:var(--az-input-bg); border:1px solid var(--az-input-border); color:var(--az-input-text);"></textarea>
          <div class="arz-log-filter-regex-row">
            <label><input type="checkbox" id="arz-filter-logs-regex"> Регулярные выражения</label>
            <span class="arz-regex-presets">
              <button type="button" data-regex="\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b">IP</button>
              <button type="button" data-regex="\\b\\d{1,2}:\\d{2}:\\d{2}\\b">Время</button>
              <button type="button" data-regex="(?:получил|передал|отдал)">Действие</button>
              <button type="button" data-regex="\\$\\s?\\d[\\d ,]*">Деньги</button>
            </span>
          </div>
        `;

        const row = container.closest('form') || container.parentElement;
        row.appendChild(taDiv);
        row.appendChild(div);

        document.getElementById('alh-filter-logs-submit').onclick = () => apply(true);
        document.getElementById('alh-filter-logs-reset').onclick = () => {
          const ta = document.getElementById('arz-filter-logs');
          if (ta) ta.value = '';
          const auto = document.getElementById('arz-filter-logs-auto');
          if (auto) auto.checked = false;
          const regex = document.getElementById('arz-filter-logs-regex');
          if (regex) regex.checked = false;
          const show = document.getElementById('arz-filter-mode-show');
          if (show) show.checked = true;
          document.querySelectorAll('table.table tbody tr').forEach(r => r.style.display = '');
          chrome.storage.local.remove('arzLogFilter');
        };
        const ta = document.getElementById('arz-filter-logs');
        if (ta) ta.oninput = autoApply;
        const regex = document.getElementById('arz-filter-logs-regex');
        if (regex) regex.onchange = autoApply;
        document.querySelectorAll('.arz-regex-presets button').forEach(button => button.onclick = () => {
          const value = button.dataset.regex || '';
          ta.value = ta.value.trim() ? `${ta.value.trim()}\n${value}` : value;
          if (regex) regex.checked = true;
          autoApply();
        });
        document.querySelectorAll('input[name="arz-filter-logs-mode"]').forEach(r => r.onchange = autoApply);
        document.getElementById('arz-filter-logs-auto').onchange = () => chrome.storage.local.set({ arzLogFilter: { text: ta.value, mode: getMode(), auto: document.getElementById('arz-filter-logs-auto').checked, regex: !!regex?.checked } });

        chrome.storage.local.get(['arzLogFilter'], (res) => {
          if (res.arzLogFilter) {
            const data = res.arzLogFilter;
            if (ta) ta.value = data.text || '';
            if (regex) regex.checked = !!data.regex;
            const rad = document.querySelector(`input[name="arz-filter-logs-mode"][value="${data.mode || 'show'}"]`);
            if (rad) rad.checked = true;
            const auto = document.getElementById('arz-filter-logs-auto');
            if (auto) auto.checked = !!data.auto;
            if (data.text?.trim() && data.auto) apply(false);
          }
        });
      }
    };
  })();

  window.ArizonaFormsManager = createLazyManager({"file": "forms", "feature": "formsEnabled", "id": "arz-forms-btn", "icon": "fa-list-check", "label": "Формы"});

  window.ArizonaOnlineManager = createLazyManager({"file": "online", "feature": "online", "auto": "arz_online"});

  window.ArizonaPunishmentManager = createLazyManager({"file": "punishment", "feature": "punishment", "auto": "arz_punish"});

  window.ArizonaLoadMoreManager = (function () {
    let settings = {};
    let isLoading = false;

    function updateTopPagination() {
      const enabled = currentSettings['extension-toggle'] !== false && settings.tools?.duplicatePaginationTop !== false;
      const old = document.getElementById('arz-top-pagination');
      const bottom = document.querySelector('nav[role="navigation"]:not(#arz-top-pagination)');
      const table = document.querySelector('table.table');
      const host = table?.closest('.alh-table-frame, .table-responsive') || table?.parentElement;
      if (!enabled) { old?.remove(); return; }
      if (!bottom || !table || !host) return;

      const top = bottom.cloneNode(true);
      top.id = 'arz-top-pagination';

      const topLoadMore = top.querySelector('#arz-load-more-btn');
      if (topLoadMore) {
        topLoadMore.id = 'arz-load-more-btn-top';
        topLoadMore.onclick = () => loadNextPage();
      } else if (currentSettings['tweak-load-more'] !== false) {
        const bottomBtn = bottom.querySelector('#arz-load-more-btn');
        if (bottomBtn) {
          const btn = bottomBtn.cloneNode(true);
          btn.id = 'arz-load-more-btn-top';
          btn.onclick = () => loadNextPage();
          const paginationUl = top.querySelector('.pagination');
          if (paginationUl) paginationUl.parentElement.insertBefore(btn, paginationUl);
        }
      }

      const bottomList = bottom.querySelector('.pagination');
      const topList = top.querySelector('.pagination');
      if (topList && bottomList) topList.innerHTML = bottomList.innerHTML;

      if (old) old.remove();
      host.insertBefore(top, table);
    }

    function getNextPageUrl(doc = document) {
      const nextBtn = doc.querySelector('.pagination a[aria-label*="Вперёд"], .pagination a[aria-label*="Next"]');
      if (nextBtn && nextBtn.href && !nextBtn.closest('li').classList.contains('disabled')) {
        return nextBtn.href;
      }

      const activeLi = doc.querySelector('.pagination li.page-item.active');
      if (activeLi) {
        const nextLi = activeLi.nextElementSibling;
        if (nextLi && !nextLi.classList.contains('disabled')) {
          const a = nextLi.querySelector('a');
          if (a && a.href && a.href !== '#' && !a.href.startsWith('javascript:')) {
            return a.href;
          }
        }
      }
      return null;
    }

    function injectButton() {
      const isEnabled = currentSettings['extension-toggle'] !== false && currentSettings['tweak-load-more'] !== false;
      const existingBtn = document.getElementById('arz-load-more-btn');

      if (!isEnabled) {
        if (existingBtn) existingBtn.remove();
        return;
      }

      const nextPageUrl = getNextPageUrl();
      if (!nextPageUrl) {
        if (existingBtn) existingBtn.remove();
        return;
      }

      const nav = document.querySelector('nav[role="navigation"]');
      if (!nav) return;

      const paginationUl = nav.querySelector('.pagination');
      if (!paginationUl) return;

      if (existingBtn) return;

      const btn = document.createElement('button');
      btn.id = 'arz-load-more-btn';
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.style.cssText = 'margin-right: 12px; height: 38px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: 600; font-size: 13px; border: none !important; color: white !important;';
      btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> Загрузить ещё`;

      btn.onclick = () => loadNextPage();

      const parentDiv = paginationUl.parentElement;
      if (parentDiv) {
        parentDiv.insertBefore(btn, paginationUl);
        updateTopPagination();
      }
    }

    async function loadNextPage() {
      if (isLoading) return;

      const nextPageUrl = getNextPageUrl();
      if (!nextPageUrl) {
        window.ArizonaNotifications.show('Больше нет страниц для загрузки', 'warning');
        return;
      }

      const btn = document.getElementById('arz-load-more-btn');
      isLoading = true;
      for (const btn of document.querySelectorAll('#arz-load-more-btn, #arz-load-more-btn-top')) {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Загрузка...`;
      }

      try {
        const response = await fetchWithRetry(nextPageUrl, { onWait: text => { if (btn) btn.textContent = text; } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const htmlText = await response.text();
        const parser = new DOMParser();
        const newDoc = parser.parseFromString(htmlText, 'text/html');

        const newRows = newDoc.querySelectorAll('table.table tbody tr');
        const currentTbody = document.querySelector('table.table tbody');

        if (currentTbody && newRows.length > 0) {
          newRows.forEach(row => {
            row.removeAttribute('data-arz-processed');
            row.removeAttribute('data-arz-ip-processed');
            row.removeAttribute('data-arz-copy-btn-injected');
            currentTbody.appendChild(row);
          });
        }

        const newNav = newDoc.querySelector('nav[role="navigation"]');
        const currentNav = document.querySelector('nav[role="navigation"]:not(#arz-top-pagination)');

        if (newNav && currentNav) {
          const currentStrongTo = currentNav.querySelector('p.text-muted strong:nth-of-type(2)');
          const newStrongTo = newNav.querySelector('p.text-muted strong:nth-of-type(2)');
          if (currentStrongTo && newStrongTo) {
            currentStrongTo.textContent = newStrongTo.textContent;
          }

          const currentUl = currentNav.querySelector('ul.pagination');
          const newUl = newNav.querySelector('ul.pagination');
          if (currentUl && newUl) {
            currentUl.innerHTML = newUl.innerHTML;
          }
          updateTopPagination();
        }

        if (typeof processTable === 'function') {
          processTable();
        }

        window.ArizonaNotifications.show(`Загружено ещё ${newRows.length} логов`, 'success');

      } catch (err) {
        console.error('Error loading next page logs:', err);
        window.ArizonaNotifications.show(`Ошибка загрузки: ${err.message}`, 'error');
      } finally {
        isLoading = false;
        for (const btn of document.querySelectorAll('#arz-load-more-btn, #arz-load-more-btn-top')) {
          btn.disabled = false;
          btn.innerHTML = `<i class="fa-solid fa-angles-down"></i> Загрузить ещё`;
        }

        const hasMorePages = getNextPageUrl();
        if (!hasMorePages && btn) {
          btn.remove();
          updateTopPagination();
        }
      }
    }

    return {
      init: function (s) {
        settings = s || {};
        this.update();
      },
      updateSettings: function (s) {
        settings = s || {};
        this.update();
      },
      update: function () {
        const isEnabled = currentSettings['extension-toggle'] !== false && currentSettings['tweak-load-more'] !== false;
        if (isEnabled) {
          runWhenElementExists('nav[role="navigation"]', () => injectButton());
        } else {
          const btn = document.getElementById('arz-load-more-btn');
          if (btn) btn.remove();
        }
        if (currentSettings['extension-toggle'] !== false) {
          runWhenElementExists('table.table', () => updateTopPagination());
        } else {
          document.getElementById('arz-top-pagination')?.remove();
        }
      },
      injectButton: injectButton,
      loadNextPage: loadNextPage
    };
  })();

  window.ArizonaIpBatchManager = createLazyManager({"file": "ipbatch", "feature": "ipBatch"});

  window.ArizonaIdNickManager = createLazyManager({"file": "idnick", "feature": "idNick"});

  window.ArizonaReportManager = createLazyManager({"file": "report", "feature": "report", "auto": "arz_report"});

  window.ArizonaLookupManager = (function () {
    let settings = {};
    let activeTab = 'online';
    let cancelButtonWait;

    const modalHTML = `
      <div id="arz-lookup-overlay" class="alh-modal-overlay">
        <div class="alh-layout-1 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-user-shield"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Панель пробива игрока</div>
              <div class="arz-modal-subtitle">Все проверки в одном модальном окне</div>
            </div>
            <button id="arz-lookup-close" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <div class="arz-lookup-tabs">
            <button class="arz-tab-btn active" data-tab="online"><i class="fa-solid fa-clock"></i> Онлайн</button>
            <button class="arz-tab-btn" data-tab="punish"><i class="fa-solid fa-gavel"></i> Наказания</button>
            <button class="arz-tab-btn" data-tab="report"><i class="fa-solid fa-comments"></i> Репорты</button>
            <button class="arz-tab-btn" data-tab="ip"><i class="fa-solid fa-network-wired"></i> IP-адреса</button>
            <button class="arz-tab-btn" data-tab="idnick"><i class="fa-solid fa-id-badge"></i> ID / Ник</button>
            <button class="arz-tab-btn" data-tab="dump"><i class="fa-solid fa-file-export"></i> Выгрузка логов</button>
          </div>

          <div class="alh-layout-2 alh-modal-body">
            <div class="arz-modal-form-group">
              <div class="alh-layout-3">
                <label class="alh-layout-4 arz-modal-label" id="arz-lookup-input-label"><i class="fa-solid fa-users"></i> Ник(и) игрока(ов)</label>
                <div class="alh-layout-5">
                  <span class="alh-layout-6">Введено: <strong id="arz-lookup-count-num" class="alh-layout-7">0</strong></span>
                  <span id="arz-lookup-extract-btn" title="Извлечь ники Nick_Name из любого текста" class="alh-layout-8"><i class="fa-solid fa-wand-magic-sparkles"></i> Извлечь ники</span>
                  <span id="arz-lookup-my-nick-btn" title="Добавить ваш авторизованный никнейм" class="alh-layout-8"><i class="fa-solid fa-user-plus"></i> Свой никнейм</span>
                </div>
              </div>
              <textarea id="arz-lookup-nicks" class="arz-textarea" rows="4" placeholder="Введите никнеймы (каждый с новой строки или через запятую) или вставьте текст для извлечения"></textarea>
            </div>

            <div id="arz-lookup-date-group" class="alh-layout-9">
              <div class="alh-layout-10">
                <div class="alh-layout-11 arz-modal-form-group">
                  <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата от</label>
                  <input type="date" id="arz-lookup-date-from" class="arz-input">
                </div>
                <div class="alh-layout-11 arz-modal-form-group">
                  <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата до</label>
                  <input type="date" id="arz-lookup-date-to" class="arz-input">
                </div>
              </div>
              <div class="alh-layout-12 arz-date-shortcuts">
                <button type="button" class="arz-btn-shortcut" data-range="day">За день</button>
                <button type="button" class="arz-btn-shortcut" data-range="week">За неделю</button>
                <button type="button" class="arz-btn-shortcut" data-range="month">За месяц</button>
                <button type="button" class="arz-btn-shortcut" data-range="start-week">С начала недели</button>
                <button type="button" class="arz-btn-shortcut" data-range="start-month">С начала месяца</button>
                <button type="button" class="arz-btn-shortcut" data-range="start-year">С начала года</button>
              </div>
            </div>

            <div id="arz-lookup-tab-online" class="alh-layout-9 arz-tab-content active">
              <div class="alh-layout-13 arz-modal-form-group">
                <input type="checkbox" id="arz-lookup-stealth" class="alh-stealth-switch">
                <label for="arz-lookup-stealth" class="alh-layout-15 arz-modal-label">
                  <i class="fa-solid fa-user-secret"></i> Скрытный режим (анализ общих логов)
                </label>
              </div>
              <div class="arz-accordion alh-clean-online">
                <div class="arz-accordion-header">
                  <div class="arz-accordion-header-left"><i class="fa-solid fa-filter"></i> <span>Чистый онлайн</span></div>
                  <i class="fa-solid fa-chevron-down arz-accordion-chevron"></i>
                </div>
                <div class="alh-layout-16 arz-accordion-content">
                  <div class="alh-clean-hint"> Учитывать только указанный промежуток суток</div>
                  <div class="alh-clean-row">
                    <span class="alh-layout-19">Будни</span>
                    <div class="alh-time-range">
                      <input type="time" id="arz-lookup-wd-from" class="alh-layout-21 arz-input">
                      <span class="alh-layout-22">—</span>
                      <input type="time" id="arz-lookup-wd-to" class="alh-layout-21 arz-input">
                    </div>
                  </div>
                  <div class="alh-clean-row">
                    <span class="alh-layout-19">Выходные</span>
                    <div class="alh-time-range">
                      <input type="time" id="arz-lookup-we-from" class="alh-layout-21 arz-input">
                      <span class="alh-layout-22">—</span>
                      <input type="time" id="arz-lookup-we-to" class="alh-layout-21 arz-input">
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div id="arz-lookup-tab-punish" class="alh-layout-23 arz-tab-content">
              <div class="alh-layout-24">
                <i class="alh-layout-7 fa-solid fa-circle-info"></i>
                <span>Будут выгружены все наказания игроков за выбранный период (баны, муты, джайлы и др.)</span>
              </div>
            </div>

            <div id="arz-lookup-tab-ip" class="alh-layout-23 arz-tab-content">
              <div class="alh-layout-24">
                <i class="alh-layout-7 fa-solid fa-circle-info"></i>
                <span>Поиск IP-адресов по последнему выходу с сервера. Поиск производится вглубь истории.</span>
              </div>
            </div>

            <div id="arz-lookup-tab-idnick" class="alh-layout-23 arz-tab-content">
              <div class="alh-layout-24">
                <i class="alh-layout-7 fa-solid fa-circle-info"></i>
                <span>Поиск ID аккаунта по никнейму или наоборот. Можно вводить как Nick_Name, так и числовые ID.</span>
              </div>
            </div>

            <div id="arz-lookup-tab-dump" class="alh-layout-23 arz-tab-content">
              <div class="arz-dump-hint"><i class="fa-solid fa-circle-info"></i><span>Выберите тип лога и период. При необходимости задайте фильтры и слова для поиска в действиях.</span></div>
              <div class="arz-modal-form-group">
                <label class="arz-modal-label" for="arz-dump-type"><i class="fa-solid fa-list"></i> Тип лога</label>
                <select id="arz-dump-type" class="arz-input" multiple data-alh-allow-custom="true" aria-label="Типы логов"></select>
                <datalist id="arz-dump-types"></datalist>
              </div>
              <div id="arz-dump-fields" class="arz-dump-fields"></div>
              <div class="arz-modal-form-group">
                <label class="arz-modal-label" for="arz-dump-search"><i class="fa-solid fa-magnifying-glass"></i> Поиск в действиях</label>
                <textarea id="arz-dump-search" class="arz-textarea" rows="3" placeholder="Значения через запятую или с новой строки"></textarea>
                <span class="arz-dump-help">Необязательно. Найдутся строки, содержащие хотя бы одно значение.</span>
              </div>
              <div class="arz-modal-form-group">
                <label class="arz-modal-label" for="arz-dump-limit"><i class="fa-solid fa-layer-group"></i> Максимум страниц</label>
                <input type="number" min="0" step="1" value="0" id="arz-dump-limit" class="arz-input">
                <span class="arz-dump-help">0 — загрузить все страницы.</span>
              </div>
              <div class="arz-dump-output" id="arz-dump-output" hidden>
                <div class="arz-dump-output-header">
                  <span class="arz-modal-label"><i class="fa-solid fa-file-lines"></i> Результат</span>
                  <button type="button" id="arz-dump-download" class="arz-btn-secondary" disabled><i class="fa-solid fa-download"></i> Скачать TXT</button>
                </div>
                <pre id="arz-dump-result" aria-live="polite"></pre>
              </div>
            </div>

            <div id="arz-lookup-tab-report" class="alh-layout-23 arz-tab-content">
              <div class="alh-layout-24">
                <i class="alh-layout-7 fa-solid fa-circle-info"></i>
                <span>Вывод количества отвеченных репортов за выбранный период и детальная статистика ответов.</span>
              </div>
            </div>
          </div>

          <div class="alh-modal-footer">
            <button id="arz-lookup-close-bottom" class="alh-layout-11 arz-btn-danger">Закрыть</button>
            <button id="arz-lookup-start-btn" class="alh-layout-25 arz-btn-primary"><i class="fa-solid fa-magnifying-glass"></i> Пробить онлайн</button>
          </div>
        </div>
      </div>
    `;

    function switchTab(modal, tabName) {
      activeTab = tabName;

      modal.querySelectorAll('.arz-tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      modal.querySelectorAll('.arz-tab-content').forEach(content => {
        if (content.id === `arz-lookup-tab-${tabName}`) {
          content.style.display = 'flex';
        } else {
          content.style.display = 'none';
        }
      });

      const dateGroup = modal.querySelector('#arz-lookup-date-group');
      if (tabName === 'online' || tabName === 'punish' || tabName === 'report' || tabName === 'dump') {
        dateGroup.style.display = 'flex';
      } else {
        dateGroup.style.display = 'none';
      }

      const nicksTextarea = modal.querySelector('#arz-lookup-nicks');
      const inputLabel = modal.querySelector('#arz-lookup-input-label');
      const startBtn = modal.querySelector('#arz-lookup-start-btn');
      nicksTextarea.closest('.arz-modal-form-group').style.setProperty('display', tabName === 'dump' ? 'none' : 'flex', 'important');

      if (tabName === 'idnick') {
        inputLabel.innerHTML = `<i class="fa-solid fa-id-card"></i> Никнеймы или ID аккаунтов`;
        nicksTextarea.placeholder = 'Введите никнеймы (Nick_Name) или ID аккаунтов (числа)\nКаждый элемент с новой строки или через запятую';
        startBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Узнать данные`;
      } else {
        inputLabel.innerHTML = `<i class="fa-solid fa-users"></i> Ник(и) игрока(ов)`;
        nicksTextarea.placeholder = 'Введите один или несколько ников (каждый с новой строки или через запятую)';

        if (tabName === 'online') {
          startBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Пробить онлайн`;
        } else if (tabName === 'punish') {
          startBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Пробить наказания`;
        } else if (tabName === 'ip') {
          startBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Пробить IP`;
        } else if (tabName === 'report') {
          startBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Пробить репорты`;
        }
      }
      if (tabName === 'dump') startBtn.innerHTML = `<i class="fa-solid fa-file-export"></i> Начать выгрузку`;
    }

    function openModal(defaultTab) {
      if (defaultTab) {
        activeTab = defaultTab;
      }
      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = modalHTML;
      openOverlay(overlay);

      const tabEnabled = {
        online: settings.tools?.online !== false,
        punish: settings.tools?.punishment !== false,
        report: settings.tools?.report !== false,
        ip: settings.tools?.ipBatch !== false,
        idnick: settings.tools?.idNick !== false,
        dump: true
      };
      overlay.querySelectorAll('.arz-tab-btn').forEach((button) => {
        button.style.setProperty('display', tabEnabled[button.dataset.tab] ? '' : 'none', 'important');
      });
      const firstEnabledTab = Object.keys(tabEnabled).find(tab => tabEnabled[tab]);
      if (!firstEnabledTab) {
        closeOverlay(overlay);
        return;
      }
      if (!tabEnabled[activeTab]) {
        activeTab = firstEnabledTab;
      }

      setupNickCounter(overlay, '#arz-lookup-nicks', 'arz-lookup-count-num');

      const dumpType = overlay.querySelector('#arz-dump-type');
      const dumpFields = overlay.querySelector('#arz-dump-fields');
      const dumpResult = overlay.querySelector('#arz-dump-result');
      const dumpDownload = overlay.querySelector('#arz-dump-download');
      let dumpText = '';
      document.querySelectorAll('select[name="type[]"] option').forEach(option => {
        if (!option.value) return;
        const item = document.createElement('option');
        item.value = option.value;
        item.label = option.textContent.trim();
        dumpType.appendChild(item);
      });
      dumpType.addEventListener('input', () => {
        dumpFields.replaceChildren();
        document.querySelectorAll('.js_component_filter_item').forEach(field => {
          if (![...dumpType.selectedOptions].some(option => option.value.toLowerCase() === (field.dataset.filterType || '').toLowerCase())) return;
          if ([...dumpFields.querySelectorAll('input')].some(input => input.name === field.querySelector('input[name^="dynamic["]')?.name)) return;
          const original = field.querySelector('input[name^="dynamic["]');
          if (!original) return;
          const label = document.createElement('label');
          label.className = 'arz-modal-form-group';
          const caption = document.createElement('span');
          caption.className = 'arz-modal-label';
          caption.textContent = field.querySelector('label')?.textContent.trim() || original.name;
          label.appendChild(caption);
          const input = document.createElement('input');
          input.className = 'arz-input';
          input.name = original.name;
          input.value = original.value;
          label.appendChild(input);
          dumpFields.appendChild(label);
        });
      });
      dumpDownload.onclick = () => {
        const url = URL.createObjectURL(new Blob([dumpText], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'logs.txt';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      async function runDump() {
        const types = [...dumpType.selectedOptions].map(option => option.value).filter(Boolean);
        const from = overlay.querySelector('#arz-lookup-date-from').value;
        const to = overlay.querySelector('#arz-lookup-date-to').value;
        const limit = Number(overlay.querySelector('#arz-dump-limit').value);
        overlay.querySelector('#arz-dump-output').hidden = false;
        dumpDownload.disabled = true;
        dumpText = '';
        if (!types.length || !from || !to || from > to || !Number.isInteger(limit) || limit < 0) { dumpResult.textContent = 'Укажите тип, корректный период и лимит страниц.'; return; }
        const search = overlay.querySelector('#arz-dump-search').value.split(/[\n,]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
        const url = new URL(location.pathname, location.origin);
        const server = new URL(location.href).searchParams.get('server_number');
        if (server) url.searchParams.set('server_number', server);
        types.forEach(type => url.searchParams.append('type[]',type));
        url.searchParams.set('min_period', `${from} 00:00:00`);
        url.searchParams.set('max_period', `${to} 23:59:59`);
        url.searchParams.set('limit', '1000');
        url.searchParams.set('sort', 'asc');
        dumpFields.querySelectorAll('input').forEach(input => { if (input.value.trim()) url.searchParams.set(input.name, input.value.trim()); });
        const button = overlay.querySelector('#arz-lookup-start-btn');
        button.disabled = true;
        dumpDownload.disabled = true;
        const lines = [];
        try {
          let page = 1, last = 1;
          do {
            dumpResult.textContent = `Загрузка страницы ${page}...`;
            url.searchParams.set('page', page);
            const response = await fetchWithRetry(url.href, logOptions(overlay));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            doc.querySelectorAll('.pagination a[href]').forEach(link => { const value = Number(new URL(link.getAttribute('href'), url).searchParams.get('page')); if (value > last) last = value; });
            doc.querySelectorAll('table.table tbody tr').forEach(row => {
              if (row.cells.length < 2) return;
              const action = row.cells[1].textContent.replace(/\s+/g, ' ').trim();
              if (!search.length || search.some(term => action.toLowerCase().includes(term))) lines.push(`${row.cells[0].textContent.trim()} | ${action}`);
            });
            page++;
          } while (page <= last && (!limit || page <= limit));
          dumpText = lines.join('\n');
          dumpResult.textContent = dumpText || 'Совпадений не найдено';
          dumpDownload.disabled = !dumpText;
        } catch (error) { dumpResult.textContent = `Ошибка: ${error.message}`; }
        finally { button.disabled = false; }
      }

      const params = new URLSearchParams(window.location.search);
      const urlMin = params.get('min_period');
      const urlMax = params.get('max_period');
      if (urlMin) {
        overlay.querySelector('#arz-lookup-date-from').value = urlMin.split(' ')[0];
      }
      if (urlMax) {
        overlay.querySelector('#arz-lookup-date-to').value = urlMax.split(' ')[0];
      }
      const urlPlayer = params.get('player');
      if (urlPlayer) {
        overlay.querySelector('#arz-lookup-nicks').value = urlPlayer;
      }

      overlay.querySelector('#arz-lookup-wd-from').value = localStorage.getItem('arz-clean-weekday-from') || '';
      overlay.querySelector('#arz-lookup-wd-to').value = localStorage.getItem('arz-clean-weekday-to') || '';
      overlay.querySelector('#arz-lookup-we-from').value = localStorage.getItem('arz-clean-weekend-from') || '';
      overlay.querySelector('#arz-lookup-we-to').value = localStorage.getItem('arz-clean-weekend-to') || '';

      const isStealth = localStorage.getItem('arz-online-stealth-enabled') === 'true';
      overlay.querySelector('#arz-lookup-stealth').checked = isStealth;

      const contentEl = overlay.querySelector('.arz-accordion-content');
      const chevron = overlay.querySelector('.arz-accordion-chevron');
      overlay.querySelector('.arz-accordion-header').onclick = () => {
        const show = contentEl.style.display === 'none' || contentEl.style.display === '';
        contentEl.style.display = show ? 'flex' : 'none';
        chevron.style.transform = show ? 'rotate(180deg)' : '';
      };

      setupDateShortcuts(overlay, 'arz-lookup-date-from', 'arz-lookup-date-to');

      overlay.querySelector('#arz-lookup-close').onclick = () => closeOverlay(overlay);
      overlay.querySelector('#arz-lookup-close-bottom').onclick = () => closeOverlay(overlay);


      overlay.querySelector('#arz-lookup-extract-btn').onclick = (e) => {
        e.preventDefault();
        const textarea = overlay.querySelector('#arz-lookup-nicks');
        const text = textarea.value;
        const nickRegex = /\b[A-Z][a-zA-Z0-9]*_[A-Za-z0-9_]+\b/g;
        const matches = text.match(nickRegex);
        const validMatches = matches ? matches.filter(isValidNickname) : [];
        if (validMatches.length === 0) {
          window.ArizonaNotifications.show('Никнеймы Nick_Name не найдены!', 'error');
          return;
        }

        const uniqueNicks = Array.from(new Set(validMatches));
        textarea.value = uniqueNicks.join(',');
        textarea.dispatchEvent(new Event('input'));
        window.ArizonaNotifications.show(`Извлечено никнеймов: ${uniqueNicks.length}`, 'success');
      };

      overlay.querySelector('#arz-lookup-my-nick-btn').onclick = (e) => {
        e.preventDefault();

        const getNavNick = () => {
          const el = document.querySelector('a#navbarDropdown');
          if (!el) return '';
          let text = '';
          for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
          }
          text = text.trim();
          return text || el.textContent.split('\n')[0].trim();
        };

        const myNick = getNavNick();
        if (!myNick) {
          window.ArizonaNotifications.show('Никнейм авторизованного пользователя не найден', 'error');
          return;
        }

        const textarea = overlay.querySelector('#arz-lookup-nicks');
        const currentVal = textarea.value.trim();
        const nicksList = currentVal ? currentVal.split(/[\n,]+/).map(n => n.trim()).filter(Boolean) : [];

        if (nicksList.includes(myNick)) {
          window.ArizonaNotifications.show('Ваш никнейм уже есть в списке!', 'info');
          return;
        }

        nicksList.push(myNick);
        textarea.value = nicksList.join('\n');
        textarea.dispatchEvent(new Event('input'));
        window.ArizonaNotifications.show(`Добавлен никнейм: ${myNick}`, 'success');
      };

      overlay.querySelectorAll('.arz-tab-btn').forEach(btn => {
        btn.onclick = () => {
          switchTab(overlay, btn.dataset.tab);
        };
      });

      overlay.querySelector('#arz-lookup-start-btn').onclick = () => {
        if (activeTab === 'dump') { runDump(); return; }
        const inputVal = overlay.querySelector('#arz-lookup-nicks').value.trim();
        const inputs = inputVal.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);

        if (inputs.length === 0) {
          window.ArizonaNotifications.show(
            activeTab === 'idnick' ? 'Введите хотя бы один ник или ID' : 'Введите хотя бы один ник',
            'error'
          );
          return;
        }

        const dateFrom = overlay.querySelector('#arz-lookup-date-from').value;
        const dateTo = overlay.querySelector('#arz-lookup-date-to').value;

        if (activeTab === 'online') {
          const stealthOn = overlay.querySelector('#arz-lookup-stealth').checked;
          const cleanOn = contentEl.style.display === 'flex';

          localStorage.setItem('arz-clean-weekday-from', cleanOn ? overlay.querySelector('#arz-lookup-wd-from').value.trim() : '');
          localStorage.setItem('arz-clean-weekday-to', cleanOn ? overlay.querySelector('#arz-lookup-wd-to').value.trim() : '');
          localStorage.setItem('arz-clean-weekend-from', cleanOn ? overlay.querySelector('#arz-lookup-we-from').value.trim() : '');
          localStorage.setItem('arz-clean-weekend-to', cleanOn ? overlay.querySelector('#arz-lookup-we-to').value.trim() : '');
          localStorage.setItem('arz-online-stealth-enabled', stealthOn ? 'true' : 'false');

          closeOverlay(overlay);
          if (stealthOn) {
            window.ArizonaOnlineManager.processStealthOnline(inputs, dateFrom, dateTo);
          } else {
            window.ArizonaOnlineManager.processMultiplePlayers(inputs, dateFrom, dateTo);
          }
        } else if (activeTab === 'punish') {
          closeOverlay(overlay);
          window.ArizonaPunishmentManager.processMultiplePlayers(inputs, dateFrom, dateTo);
        } else if (activeTab === 'report') {
          closeOverlay(overlay);
          window.ArizonaReportManager.processMultiplePlayers(inputs, dateFrom, dateTo);
        } else if (activeTab === 'ip') {
          closeOverlay(overlay);
          window.ArizonaIpBatchManager.processMultiplePlayers(inputs);
        } else if (activeTab === 'idnick') {
          closeOverlay(overlay);
          window.ArizonaIdNickManager.processMultipleInputs(inputs);
        }
      };

      switchTab(overlay, activeTab);
    }

    return {
      init: function (s) {
        settings = toolSettings(s || {});
        this.update();
      },
      updateSettings: function (s) {
        settings = toolSettings(s || {});
        this.update();
      },
      update: function () {
        const hasLookupTab = [
          settings.tools?.online,
          settings.tools?.punishment,
          settings.tools?.report,
          settings.tools?.ipBatch,
          settings.tools?.idNick
        ].some(value => value !== false);
        const isEnabled = currentSettings['extension-toggle'] !== false &&
          settings.tools?.lookup !== false && hasLookupTab;
        const existingBtn = document.getElementById('arz-lookup-btn');
        cancelButtonWait?.();
        if (isEnabled) {
          cancelButtonWait = runWhenElementExists('.filter-buttons', () => this.injectButton());
        } else {
          if (existingBtn) existingBtn.remove();
        }
      },
      injectButton: function () {
        if (document.getElementById('arz-lookup-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-lookup-btn';
        btn.className = 'btn btn-success';
        btn.style.cssText = 'margin-left: 10px;';
        btn.innerHTML = `<i class="fa-solid fa-user-shield" style="margin-right: 6px;"></i> Пробив`;
        btn.onclick = () => openModal();
        container.appendChild(btn);
      },
      openModal: openModal
    };
  })();

  window.ArizonaDateShortcut = (function () {
    let settings = {};

    function getRelativeDateStr(daysAgo) {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    function setDate(date) {
      if (!date) return;
      const min = document.querySelector('input[name="min_period"]');
      const max = document.querySelector('input[name="max_period"]');
      if (min && max) {
        min.value = `${date} 00:00:00`;
        max.value = `${date} 23:59:59`;
        ['change', 'input'].forEach(e => {
          min.dispatchEvent(new Event(e, { bubbles: true }));
          max.dispatchEvent(new Event(e, { bubbles: true }));
        });
        window.ArizonaNotifications.show(`Установлен период: ${date}`, 'success');
      }
    }

    function formatDate(date, time) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d} ${time}`;
    }

    function setMinPeriod(range) {
      const min = document.querySelector('input[name="min_period"]');
      if (!min) return;
      const date = new Date();
      if (range === '1y') {
        date.setFullYear(date.getFullYear() - 1);
      } else if (range === '3m') {
        date.setMonth(date.getMonth() - 3);
      } else if (range === '1w') {
        date.setDate(date.getDate() - 7);
      }
      min.value = formatDate(date, '00:00:00');
      ['change', 'input'].forEach(e => {
        min.dispatchEvent(new Event(e, { bubbles: true }));
      });
      window.ArizonaNotifications.show(`Установлено начало периода: ${min.value}`, 'success');
    }

    function setMaxPeriod(range) {
      const max = document.querySelector('input[name="max_period"]');
      if (!max) return;
      const date = new Date();
      if (range === '1y') {
        date.setFullYear(date.getFullYear() - 1);
      } else if (range === '3m') {
        date.setMonth(date.getMonth() - 3);
      } else if (range === '1w') {
        date.setDate(date.getDate() - 7);
      }
      max.value = formatDate(date, '23:59:59');
      ['change', 'input'].forEach(e => {
        max.dispatchEvent(new Event(e, { bubbles: true }));
      });
      window.ArizonaNotifications.show(`Установлен конец периода: ${max.value}`, 'success');
    }

    function setSortOrder(val) {
      const container = document.querySelector('.js_component_filter_item_sort');
      if (!container) return;
      const select = container.querySelector('select[name="sort"]') || container.querySelector('select');
      if (!select) return;

      select.value = val;
      ['change', 'input'].forEach(eName => {
        select.dispatchEvent(new Event(eName, { bubbles: true }));
      });

      if (window.jQuery) {
        window.jQuery(select).val(val).trigger('change');
      }

      const valLabel = val === 'desc' ? 'Сначала новые' : 'Сначала старые';
      if (window.ArizonaNotifications) {
        window.ArizonaNotifications.show(`Сортировка: ${valLabel}`, 'success');
      }
    }

    function getMyNickname() {
      const el = document.querySelector('a#navbarDropdown');
      if (!el) return '';
      let text = '';
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        }
      }
      text = text.trim();
      if (!text) {
        text = el.textContent.split('\n')[0].trim();
      }
      return text;
    }

    async function readClipboardText() {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text) return text.trim();
        }
      } catch (e) {
        console.warn('[Content] Failed to read clipboard:', e);
      }
      return '';
    }

    function setPlayerInputValue(input, val) {
      if (!input) return;
      input.value = val;
      ['input', 'change', 'keyup'].forEach(eName => {
        input.dispatchEvent(new Event(eName, { bubbles: true }));
      });
      input.focus();
    }

    function getPlayerContainers() {
      const containers = [];
      const selectors = [
        '.js_component_filter_item_player',
        '.js_component_filter_item_target',
        '.js_component_filter_item_player1',
        '.js_component_filter_item_player2'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!containers.includes(el)) containers.push(el);
        });
      });

      document.querySelectorAll('.js_component_filter_item').forEach(item => {
        if (!containers.includes(item)) {
          const input = item.querySelector('input[name="player"], input[name="target"], input[name="player1"], input[name="player2"]');
          if (input) containers.push(item);
        }
      });

      return containers;
    }

    function getTypeContainers() {
      const containers = [];
      const selectors = [
        '.js_component_filter_item_type',
        '.js_component_filter_item_types',
        '.js_component_filter_item_type_id',
        '.js_component_filter_item_action',
        '.js_component_filter_item_actions'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!containers.includes(el)) containers.push(el);
        });
      });

      document.querySelectorAll('.js_component_filter_item').forEach(item => {
        if (!containers.includes(item)) {
          const label = item.querySelector('label');
          const input = item.querySelector('input, select, textarea');
          if (label && /Тип|Типы|Action/i.test(label.textContent.trim())) {
            containers.push(item);
          } else if (input && /type|action/i.test(input.name || '')) {
            containers.push(item);
          }
        }
      });

      return containers;
    }

    function appendEmojiToType(container, emoji) {
      const custom = container.querySelector('.alh-combo-display');
      if (custom) {
        custom.click();
        const search = document.querySelector('.alh-page-popovers .alh-combo-search');
        if (search) { search.value = emoji; search.dispatchEvent(new Event('input', {bubbles:true})); }
        return;
      }
      const select2Selection = container.querySelector('.select2-selection');
      if (select2Selection && !document.querySelector('.select2-container--open')) {
        select2Selection.click();
      }

      setTimeout(() => {
        const openSelect2Input = document.querySelector('.select2-container--open .select2-search__field');
        const containerInput = container.querySelector('.select2-search__field, input[type="text"], input:not([type="hidden"]), textarea');
        const targetInput = openSelect2Input || containerInput;

        if (targetInput) {
          targetInput.focus();
          const val = targetInput.value || '';
          const newVal = val ? (val.endsWith(' ') ? val + emoji : val + ' ' + emoji) : emoji;
          targetInput.value = newVal;

          ['input', 'change', 'keyup', 'keydown'].forEach(eventType => {
            targetInput.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
        }
      }, select2Selection ? 60 : 0);
    }

    function createShortcutLink(label, onClick) {
      const btn = document.createElement('a');
      btn.href = '#';
      btn.className = 'arz-shortcut-link';
      btn.textContent = label;
      btn.style.cssText = 'color: var(--az-text-secondary); text-decoration: none; border-bottom: 1px dashed currentColor; display: inline-block; font-size: 11px; margin-right: 8px; margin-bottom: 4px; transition: color 0.15s; cursor: pointer;';
      btn.onmouseover = () => {
        btn.style.color = 'var(--az-accent-hover)';
      };
      btn.onmouseout = () => {
        btn.style.color = 'var(--az-text-secondary)';
      };
      btn.onclick = (e) => {
        e.preventDefault();
        onClick();
      };
      return btn;
    }

    function createEmojiShortcutButton(item, onClick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'arz-type-emoji-btn';
      btn.textContent = item.char;
      btn.title = item.title;
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 13px;
        line-height: 1.2;
        cursor: pointer;
        user-select: none;
        transition: all 0.15s ease;
      `;
      btn.onmouseover = () => {
        btn.style.background = 'rgba(255, 255, 255, 0.14)';
        btn.style.borderColor = 'var(--az-accent-hover, #ff4d4d)';
        btn.style.transform = 'translateY(-1px)';
      };
      btn.onmouseout = () => {
        btn.style.background = 'rgba(255, 255, 255, 0.06)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.14)';
        btn.style.transform = 'none';
      };
      btn.onclick = (e) => {
        e.preventDefault();
        onClick();
      };
      return btn;
    }

    return {
      init: function (s) {
        settings = s || {};
        if (settings.tools?.dateShortcutEnabled) {
          runWhenElementExists('.js_component_filter_item_min_period', () => this.addMinPeriodButtons());
          runWhenElementExists('.js_component_filter_item_max_period', () => this.addMaxPeriodButtons());
          runWhenElementExists('.js_component_filter_item_sort', () => {
            this.addButton();
            this.addSortShortcuts();
          });
          if (sakaiCompatible()) runWhenElementExists('#arz-date-shortcut-wrap', () => this.addButton());
          this.addTypeEmojiButtons();
          this.addPlayerShortcuts();
          setTimeout(() => {
            this.addTypeEmojiButtons();
            this.addPlayerShortcuts();
          }, 500);
          setTimeout(() => {
            this.addTypeEmojiButtons();
            this.addPlayerShortcuts();
          }, 1500);
        }
      },
      createClearShortcut: function (onClick) {
        const button = createShortcutLink('X', onClick);
        button.classList.add('arz-filter-clear-shortcut');
        button.title = 'Очистить поле';
        button.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        return button;
      },
      addButton: function () {
        if (sakaiCompatible()) {
          const container = document.getElementById('arz-date-shortcut-wrap');
          const input = container?.querySelector('input[type="date"]');
          if (input) this.addSpecificDateShortcuts(input, container);
          return;
        }
        if (document.getElementById('alh-date-shortcut-wrap')) return;
        const container = document.querySelector('.js_component_filter_item_sort');
        if (!container) return;
        const wrap = document.createElement('div');
        wrap.id = 'alh-date-shortcut-wrap';
        wrap.className = 'col-sm-3 mb-2';
        wrap.innerHTML = `
          <label class="mb-1 mt-2 text-muted">Выбор конкретной даты</label>
          <div class="form-group">
            <input id="alh-date-shortcut-input" type="text" placeholder="год-месяц-день" class="form-control" style="background: var(--az-input-bg); border: 1px solid var(--az-input-border); color: var(--az-accent); border-radius: var(--az-border-radius-small); padding: 8px;">
          </div>
        `;

        const input = wrap.querySelector('#alh-date-shortcut-input');
        input.onchange = (e) => setDate(e.target.value.trim());

        this.addSpecificDateShortcuts(input, wrap);
        container.insertAdjacentElement('afterend', wrap);
      },
      addSpecificDateShortcuts: function (input, container) {
        if (document.getElementById('arz-specific-date-shortcuts')) return;
        const shortcutsWrap = document.createElement('div');
        shortcutsWrap.id = 'arz-specific-date-shortcuts';
        shortcutsWrap.style.cssText = 'margin-top: 6px; display: flex; flex-wrap: wrap;';
        const applySpecificDate = daysAgo => {
          const dateStr = getRelativeDateStr(daysAgo);
          input.value = dateStr;
          setDate(dateStr);
        };
        shortcutsWrap.appendChild(createShortcutLink('Сегодня', () => applySpecificDate(0)));
        shortcutsWrap.appendChild(createShortcutLink('Вчера', () => applySpecificDate(1)));
        shortcutsWrap.appendChild(createShortcutLink('Позавчера', () => applySpecificDate(2)));
        shortcutsWrap.appendChild(createShortcutLink('Неделю назад', () => applySpecificDate(7)));
        shortcutsWrap.appendChild(this.createClearShortcut(() => { input.value = ''; setDate(''); }));
        container.appendChild(shortcutsWrap);
      },
      addSortShortcuts: function () {
        if (document.getElementById('arz-sort-shortcuts')) return;
        const container = document.querySelector('.js_component_filter_item_sort');
        if (!container) return;

        const wrap = document.createElement('div');
        wrap.id = 'arz-sort-shortcuts';
        wrap.style.cssText = 'margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;';

        wrap.appendChild(createShortcutLink('Сначала новые', () => setSortOrder('desc')));
        wrap.appendChild(createShortcutLink('Сначала старые', () => setSortOrder('asc')));

        container.appendChild(wrap);
      },
      addMinPeriodButtons: function () {
        if (document.getElementById('arz-min-period-shortcuts')) return;
        const container = document.querySelector('.js_component_filter_item_min_period');
        if (!container) return;
        const formGroup = container.querySelector('.form-group');
        if (!formGroup) return;

        const wrap = document.createElement('div');
        wrap.id = 'arz-min-period-shortcuts';
        wrap.style.cssText = 'margin-top: 6px; display: flex; flex-wrap: wrap;';

        wrap.appendChild(createShortcutLink('От 1 год назад', () => setMinPeriod('1y')));
        wrap.appendChild(createShortcutLink('От 3 месяца назад', () => setMinPeriod('3m')));
        wrap.appendChild(createShortcutLink('От 1 недели назад', () => setMinPeriod('1w')));
        wrap.appendChild(createShortcutLink('От сегодня 00:00', () => setMinPeriod('today')));

          formGroup.insertAdjacentElement('afterend', wrap);
      },
      addMaxPeriodButtons: function () {
        if (document.getElementById('arz-max-period-shortcuts')) return;
        const container = document.querySelector('.js_component_filter_item_max_period');
        if (!container) return;
        const formGroup = container.querySelector('.form-group');
        if (!formGroup) return;

        const wrap = document.createElement('div');
        wrap.id = 'arz-max-period-shortcuts';
        wrap.style.cssText = 'margin-top: 6px; display: flex; flex-wrap: wrap;';

        wrap.appendChild(createShortcutLink('До сегодня', () => setMaxPeriod('today')));
        wrap.appendChild(createShortcutLink('До 1 недели назад', () => setMaxPeriod('1w')));
        wrap.appendChild(createShortcutLink('До 3 месяца назад', () => setMaxPeriod('3m')));
        wrap.appendChild(createShortcutLink('До 1 год назад', () => setMaxPeriod('1y')));

          formGroup.insertAdjacentElement('afterend', wrap);
          const clear = this.createClearShortcut(() => { const input = container.querySelector('input[name="max_period"]'); if (input) { input.value = ''; input.dispatchEvent(new Event('change', { bubbles: true })); } });
          wrap.appendChild(clear);
      },
      addTypeEmojiButtons: function () {
        const typeContainers = getTypeContainers();
        typeContainers.forEach((container, idx) => {
          if (container.querySelector('.arz-type-emoji-shortcuts')) return;

          const formGroup = container.querySelector('.form-group') || container;
          const wrap = document.createElement('div');
          wrap.className = 'arz-type-emoji-shortcuts';
          wrap.style.cssText = 'margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px;';

          const emojis = [
            { char: '➕', title: 'Прибавление / Взял / Получил' },
            { char: '➖', title: 'Потерял / Положил / Отдал' },
            { char: '🎒', title: 'Инвентарь / Предметы' },
            { char: '💰', title: 'Деньги / Наличные / Перевод' },
            { char: '🏦', title: 'Банк / Банковский счет' },
            { char: '🤝', title: 'Трейд / Сделка / Обмен' },
            { char: '🪙', title: 'AZ-Coins' },
            { char: '🚗', title: 'Действия с багажником' }
          ];

          emojis.forEach(item => {
            const btn = createEmojiShortcutButton(item, () => appendEmojiToType(container, item.char));
            wrap.appendChild(btn);
          });

          formGroup.insertAdjacentElement('beforeend', wrap);
          wrap.appendChild(this.createClearShortcut(() => {
            container.querySelectorAll('select').forEach(select => {
              Array.from(select.options).forEach(option => option.selected = false);
              select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            container.querySelectorAll('.select2-selection__rendered').forEach(el => el.textContent = '');
          }));
        });
      },
      addPlayerShortcuts: function () {
        const playerContainers = getPlayerContainers();
        playerContainers.forEach((container) => {
          if (container.querySelector('.arz-player-shortcuts')) return;

          const input = container.querySelector('input[type="text"], input:not([type="hidden"])');
          if (!input) return;

          const wrap = document.createElement('div');
          wrap.className = 'arz-player-shortcuts';
          wrap.style.cssText = 'margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;';

          wrap.appendChild(createShortcutLink('Из буфера', async () => {
            const text = await readClipboardText();
            if (text) {
              setPlayerInputValue(input, text);
              if (window.ArizonaNotifications) window.ArizonaNotifications.show(`Вставлено из буфера: ${text}`, 'success');
            } else {
              if (window.ArizonaNotifications) window.ArizonaNotifications.show('Буфер обмена пуст или доступ запрещён', 'warning');
            }
          }));

          wrap.appendChild(createShortcutLink('Свой никнейм', () => {
            const nick = getMyNickname();
            if (nick) {
              setPlayerInputValue(input, nick);
              if (window.ArizonaNotifications) window.ArizonaNotifications.show(`Вставлен свой никнейм: ${nick}`, 'success');
            } else {
              if (window.ArizonaNotifications) window.ArizonaNotifications.show('Никнейм авторизованного пользователя не найден', 'warning');
            }
          }));

          wrap.appendChild(createShortcutLink('Конверт в ID/Никнейм', async () => {
            const currentVal = input.value.trim();
            if (!currentVal) {
              if (window.ArizonaNotifications) window.ArizonaNotifications.show('Введите Никнейм или ID в поле!', 'warning');
              return;
            }

            if (window.ArizonaNotifications) window.ArizonaNotifications.show(`Поиск данных для ${currentVal}...`, 'info');

            const isId = /^\d+$/.test(currentVal);
            const res = await window.ArizonaIdNickManager.resolveSingle(currentVal);

            if (!res) {
              if (window.ArizonaNotifications) window.ArizonaNotifications.show(`Не удалось найти данные для ${currentVal}`, 'error');
              return;
            }

            if (isId) {
              if (res.nickname && res.nickname !== '—') {
                setPlayerInputValue(input, res.nickname);
                if (window.ArizonaNotifications) window.ArizonaNotifications.show(`ID ${currentVal} ➔ Ник: ${res.nickname}`, 'success');
              } else {
                if (window.ArizonaNotifications) window.ArizonaNotifications.show(`Никнейм не найден для ID ${currentVal}`, 'error');
              }
            } else {
              if (res.accountId && res.accountId !== '—') {
                setPlayerInputValue(input, res.accountId);
                if (window.ArizonaNotifications) window.ArizonaNotifications.show(`Ник ${currentVal} ➔ ID: ${res.accountId}`, 'success');
              } else {
                if (window.ArizonaNotifications) window.ArizonaNotifications.show(`ID аккаунта не найден для ника ${currentVal}`, 'error');
              }
            }
          }));

          container.appendChild(wrap);
          wrap.appendChild(this.createClearShortcut(() => setPlayerInputValue(input, '')));
        });
      },
      reposition: function () {
        if (settings.tools?.dateShortcutEnabled) {
          this.addMinPeriodButtons();
          this.addMaxPeriodButtons();
          this.addButton();
          this.addSortShortcuts();
          this.addTypeEmojiButtons();
          this.addPlayerShortcuts();
        }
      }
    };
  })();

  window.ArizonaMultiPlayersManager = (function () {
    let settings = {};
    let progressOverlay = null;
    let loading = false;

    async function readClipboardText() {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          return text ? text.trim() : '';
        }
      } catch (error) {
        console.warn('[MultiPlayers] Failed to read clipboard:', error);
      }
      return '';
    }

    function getPlayerFields() {
      return Array.from(document.querySelectorAll('input[name="player"], input[name="target"], input[name="player1"], input[name="player2"]'));
    }

    const disabledFields = new Map();

    function setFieldsDisabled(disabled) {
      getPlayerFields().forEach(field => {
        if (disabled) {
          if (!disabledFields.has(field)) disabledFields.set(field, { disabled: field.disabled, title: field.getAttribute('title') });
          field.disabled = true;
          field.title = 'Очистите поле нескольких ID/никнеймов, чтобы использовать это поле';
        } else if (disabledFields.has(field)) {
          const previous = disabledFields.get(field);
          field.disabled = previous.disabled;
          if (previous.title === null) field.removeAttribute('title');
          else field.title = previous.title;
          disabledFields.delete(field);
        }
      });
    }

    function inject() {
      if (document.getElementById('arz-multi-player-wrap')) return;
      const ipContainer = document.querySelector('.js_component_filter_item_ip');
      if (!ipContainer) return;
      const wrap = document.createElement('div');
      wrap.id = 'arz-multi-player-wrap';
      wrap.className = 'col-sm-3 pt-3 mb-2';
      wrap.innerHTML = `<div id="arz-multi-player-title" class="arz-filter-field-title"><i class="fa-solid fa-users"></i>Ввод нескольких ID/никнеймов</div><div class="form-group"><textarea id="arz-multi-player-input" aria-labelledby="arz-multi-player-title" class="form-control" rows="2" placeholder="Nick_One, Nick_Two Nick_Three&#10;Можно разделять пробелом или запятой" style="resize:vertical; background:var(--az-input-bg);border:1px solid var(--az-input-border);color:var(--az-input-text);"></textarea></div><div class="arz-multi-player-shortcuts"></div>`;
      ipContainer.insertAdjacentElement('afterend', wrap);
      const input = wrap.querySelector('#arz-multi-player-input');
      const shortcuts = wrap.querySelector('.arz-multi-player-shortcuts');
      try { input.value = sessionStorage.getItem('arzMultiPlayersInput') || ''; } catch (error) { }
      shortcuts.appendChild(createShortcut('Из буфера', async () => {
        const text = await readClipboardText();
        if (text) { input.value = text; input.dispatchEvent(new Event('input', { bubbles: true })); }
      }));
      shortcuts.appendChild(createClearShortcut(() => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }));
      const update = () => setFieldsDisabled(input.value.trim().length > 0);
      input.addEventListener('input', () => {
        update();
        try {
          if (input.value.trim()) sessionStorage.setItem('arzMultiPlayersInput', input.value);
          else sessionStorage.removeItem('arzMultiPlayersInput');
        } catch (error) { }
      });
      update();
    }

    function createShortcut(label, onClick) {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'arz-shortcut-link';
      link.textContent = label;
      link.onclick = (event) => { event.preventDefault(); onClick(); };
      return link;
    }

    function createClearShortcut(onClick) {
      const link = createShortcut('', onClick);
      link.classList.add('arz-filter-clear-shortcut');
      link.title = 'Очистить поле';
      link.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
      return link;
    }

    function addIpShortcuts() {
      const container = document.querySelector('.js_component_filter_item_ip');
      if (!container || container.querySelector('.arz-ip-filter-shortcuts')) return;
      const input = container.querySelector('input, textarea');
      if (!input) return;
      const shortcuts = document.createElement('div');
      shortcuts.className = 'arz-ip-filter-shortcuts';
      shortcuts.appendChild(createShortcut('Из буфера', async () => {
        const text = await readClipboardText();
        if (text) { input.value = text; ['input', 'change'].forEach(type => input.dispatchEvent(new Event(type, { bubbles: true }))); }
      }));
      shortcuts.appendChild(createClearShortcut(() => {
        input.value = '';
        ['input', 'change'].forEach(type => input.dispatchEvent(new Event(type, { bubbles: true })));
      }));
      container.appendChild(shortcuts);
    }

    function sortRowsByDate() {
      const tbody = document.querySelector('table.table tbody');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const getTime = row => {
        const value = row.querySelector('td:first-child')?.textContent.replace(/\s+/g, ' ').trim() || '';
        const isoMatch = value.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
        if (isoMatch) return Date.parse(`${isoMatch[1]}T${isoMatch[2]}`);
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? -Infinity : parsed;
      };
      rows.sort((a, b) => {
        const difference = getTime(b) - getTime(a);
        return Number.isNaN(difference) ? 0 : difference;
      });
      rows.forEach(row => tbody.appendChild(row));
    }

    function showProgress(total) {
      progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `<div class="arz-modal-container" style="max-width:420px;width:90%;"><div class="alh-modal-header"><div class="arz-modal-icon-wrapper"><i class="fa-solid fa-users"></i></div><div class="arz-modal-title-block"><div class="arz-modal-title">Загрузка логов игроков</div><div class="arz-modal-subtitle">Логи добавляются на текущую страницу</div></div></div><div class="alh-modal-body" style="text-align:center;"><div id="arz-multi-progress-text">Подготовка...</div><div style="height:7px;background:var(--az-input-bg);border-radius:4px;margin-top:14px;overflow:hidden;"><div id="arz-multi-progress-bar" style="height:100%;width:0;background:linear-gradient(90deg,var(--az-accent),var(--az-accent-hover));transition:width .25s ease;"></div></div></div><div class="alh-modal-footer"><button id="arz-multi-progress-cancel" class="arz-btn-danger" style="flex:1;"><i class="fa-solid fa-ban"></i> Отмена</button></div></div>`;
      openOverlay(progressOverlay);
      progressOverlay.querySelector('#arz-multi-progress-cancel').onclick = () => { loading = false; closeOverlay(progressOverlay); };
    }

    async function loadOthers(players) {
      if (loading || players.length < 2 || !document.querySelector('table.table tbody')) return;
      loading = true;
      showProgress(players.length - 1);
      const base = new URL(window.location.href);
      base.searchParams.delete('player'); base.searchParams.delete('target'); base.searchParams.delete('page'); base.searchParams.set('limit', '1000');
      const tbody = document.querySelector('table.table tbody');
      const known = new Set(Array.from(tbody.querySelectorAll('tr')).map(row => row.innerHTML));
      let done = 0;
      for (const player of players.slice(1)) {
        if (!loading) break;
        const url = new URL(base.href);
        url.searchParams.set('player', player);
        try {
          const response = await fetchWithRetry(url.href, logOptions(progressOverlay));
          const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
          doc.querySelectorAll('table.table tbody tr').forEach(row => {
            if (!known.has(row.innerHTML)) { known.add(row.innerHTML); row.removeAttribute('data-arz-processed'); row.removeAttribute('data-arz-ip-processed'); tbody.appendChild(row); }
          });
          sortRowsByDate();
        } catch (error) { if (error.name === 'AbortError') { loading = false; break; } console.warn('[Arizona] Ошибка загрузки игрока:', player, error); }
        done++;
        const text = progressOverlay?.querySelector('#arz-multi-progress-text');
        const bar = progressOverlay?.querySelector('#arz-multi-progress-bar');
        if (text) text.textContent = `Загружено игроков: ${done} из ${players.length - 1}`;
        if (bar) bar.style.width = `${done / (players.length - 1) * 100}%`;
        if (typeof processTable === 'function') processTable();
      }
      loading = false;
      sortRowsByDate();
      if (progressOverlay) closeOverlay(progressOverlay);
      try { sessionStorage.removeItem('arzMultiPlayersQueue'); } catch (error) { }
      if (window.ArizonaNotifications) window.ArizonaNotifications.show(`Загрузка завершена: добавлено игроков ${done}`, 'success');
    }

    return {
      prepareSubmit(form) {
        if (settings.tools?.multiPlayersEnabled === false) return [];
        const input = document.getElementById('arz-multi-player-input');
        const players = input ? input.value.split(/[\s,]+/).map(value => value.trim()).filter(Boolean) : [];
        if (players.length) {
          const field = form?.querySelector('input[name="player"]');
          if (field) {
            field.value = players[0];
            field.disabled = false;
          }
        }
        try {
          if (players.length) sessionStorage.setItem('arzMultiPlayersQueue', JSON.stringify(players));
          else sessionStorage.removeItem('arzMultiPlayersQueue');
        } catch (error) {
          console.warn('[Arizona] Не удалось сохранить очередь игроков:', error);
        }
        return players;
      },
      init(s) {
        settings = s || {};
        runWhenElementExists('.js_component_filter_item_ip', () => {
          if (currentSettings['extension-toggle'] === false) return;
          if (settings.tools?.multiPlayersEnabled !== false) inject();
          addIpShortcuts();
        });
        if (currentSettings['extension-toggle'] !== false && settings.tools?.multiPlayersEnabled !== false) {
          setTimeout(() => {
            try {
              const players = JSON.parse(sessionStorage.getItem('arzMultiPlayersQueue') || '[]');
              if (players.length > 1) loadOthers(players);
            } catch (error) { }
          }, 800);
        }
      },
      updateSettings(s) {
        settings = s || {};
        const disabled = currentSettings['extension-toggle'] === false || settings.tools?.multiPlayersEnabled === false;
        if (disabled) {
          document.getElementById('arz-multi-player-wrap')?.remove();
          setFieldsDisabled(false);
        } else {
          inject();
          const input = document.getElementById('arz-multi-player-input');
          if (input) setFieldsDisabled(input.value.trim().length > 0);
        }
      }
    };
  })();

  window.ArizonaIdenticalIpHighlight = {
    init: function (s) {
      arizonaSettings = s || {};
      if (isInitialized) this.apply();
    },
    updateSettings: function (s) {
      arizonaSettings = s || {};
      if (sakaiCompatible()) return;
      if (!arizonaSettings.tools?.identicalIPs) {
        document.querySelectorAll('table.table tbody tr').forEach(row => {
          row.style.color = '';
          const ipCell = row.cells[3];
          if (ipCell) {
            ipCell.querySelectorAll('a[title="последний"]').forEach(l => l.style.color = '');
          }
        });
      } else {
        this.apply();
      }
    },
    apply: function () {
      document.querySelectorAll('table.table tbody tr').forEach(row => {
        highlightIdenticalIps(row);
      });
    }
  };

  window.ArizonaAnalyticsManager = createLazyManager({"file": "analytics", "feature": "analytics", "id": "arz-analytics-btn", "icon": "fa-chart-simple", "label": "Аналитика"});

  window.ArizonaCopyLogsManager = (function () {
    let settings = {};
    function formatAction(cell) {
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('.btn, button, .js_entry_format_button, .alh-col-eye-btn, .badge, .bi, svg, i, .app__hidden, .az-geo-inserted, .arz-geo-inserted, .arz-dup-badge, button, .arizona-ecosystem-badge').forEach(el => el.remove());
      clone.querySelectorAll('a[href*="?player="]').forEach(lnk => {
        const b = lnk.querySelector('b, strong');
        if (b) {
          const l = document.createElement('a');
          l.href = lnk.href;
          l.target = '_blank';
          l.style.cssText = 'color: rgb(242, 50, 50); font-weight: bold; text-decoration: none;';
          l.textContent = b.textContent;
          b.parentNode.replaceChild(l, b);
        }
      });
      clone.querySelectorAll('span[style*="color"], font').forEach(sp => {
        const sty = sp.getAttribute('style');
        if (sty?.includes('color')) {
          const s = document.createElement('span');
          s.setAttribute('style', sty);
          s.innerHTML = sp.innerHTML;
          sp.parentNode.replaceChild(s, sp);
        }
      });
      let html = clone.innerHTML;
      const ipGeoRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?:\s*\([^)]*\))?(?:\s*~\d+(?:\.\d+)?km)?/g;
      html = html.replace(ipGeoRegex, '');
      return html.trim();
    }

    function formatData(cell) {
      const txt = cell.textContent.trim();
      const parts = [];
      const iMatch = txt.match(/I:\s*([\d,\s]+\/[\d,\s]+\/[\d,\s]+)/i);
      const iiMatch = txt.match(/II:\s*([\d,\s]+\/[\d,\s]+\/[\d,\s]+)/i);
      if (iMatch) {
        const v = iMatch[1].split('/').map(x => x.trim());
        parts.push(`<span style="color: #d63384; font-weight: bold;">I:</span> <span style="color: #d63384;">${v[0]}</span> / <span style="color: #d63384;">${v[1]}</span> / <span style="color: #d63384;">${v[2]}</span>`);
      }
      if (iiMatch) {
        const v = iiMatch[1].split('/').map(x => x.trim());
        parts.push(`<span style="color: #d63384; font-weight: bold;">II:</span> <span style="color: #d63384;">${v[0]}</span> / <span style="color: #d63384;">${v[1]}</span> / <span style="color: #d63384;">${v[2]}</span>`);
      }
      return parts.length > 0 ? parts.join('<br>') : txt;
    }

    function formatIP(cell) {
      const clone = cell.cloneNode(true);
      const blocks = clone.querySelectorAll('.table-ip');
      const res = [];
      if (blocks.length > 0) {
        blocks.forEach(b => {
          const lbl = b.querySelector('strong code')?.textContent.trim() || '';
          const ips = Array.from(b.querySelectorAll('a[href*="ip="]')).map(lnk => {
            const ip = lnk.textContent.trim().replace(/\*/g, '***');
            return `<a href="${lnk.href}" target="_blank" style="color: rgb(242, 50, 50); text-decoration: none;">${ip}</a>`;
          });
          if (ips.length) res.push(`<span style="color: rgb(242, 50, 50); font-weight: bold;">${lbl}</span> ${ips.join(' · ')}`);
        });
        return res.join('<br>');
      }
      const links = clone.querySelectorAll('a[href*="ip="]');
      if (links.length > 0) {
        return Array.from(links).map(lnk => `<a href="${lnk.href}" target="_blank" style="color: rgb(242, 50, 50); text-decoration: none;">${lnk.textContent.trim().replace(/\*/g, '***')}</a>`).join(' · ');
      }
      return clone.textContent;
    }

    function isRowVisible(row) {
      if (!row) return false;
      if (row.classList.contains('arz-row-hidden')) return false;
      if (row.style.display === 'none') return false;
      const style = window.getComputedStyle(row);
      return style && style.display !== 'none' && style.visibility !== 'hidden';
    }

    function copyTable(rows) {
      const visibleRows = (rows || []).filter(isRowVisible);
      const tbl = document.querySelector('table.table');
      if (!tbl || visibleRows.length === 0) return;
      const headers = tbl.querySelectorAll('thead th');
      const visible = [];
      headers.forEach((th, idx) => {
        const eye = th.querySelector('.alh-col-eye-btn');
        if (!eye || !eye.querySelector('.fa-eye-slash')) visible.push(idx);
      });
      if (visible.length === 0) visible.push(0, 1);

      let html = '<table width="100%" cellpadding="3" cellspacing="0" border="0" style="border-collapse: collapse; font-family: Nunito, sans-serif; font-size: 13px;">';
      let plain = '';
      visibleRows.forEach(row => {
        html += '<tr>';
        const cells = row.querySelectorAll('td');
        const plainCells = [];
        visible.forEach(idx => {
          if (cells[idx]) {
            let inner = '';
            if (idx === 0) inner = cells[idx].textContent.trim();
            else if (idx === 1) inner = formatAction(cells[idx]);
            else if (idx === 2) inner = formatData(cells[idx]);
            else if (idx === 3) inner = formatIP(cells[idx]);
            html += `<td style="padding: 4px 8px; border: 1px solid #ddd; vertical-align: top; ${idx !== 1 ? 'white-space: nowrap;' : ''}">${inner}</td>`;
            plainCells.push(cells[idx].textContent.replace(/\s+/g, ' ').trim());
          }
        });
        html += '</tr>';
        plain += plainCells.join('\t') + '\n';
      });
      html += '</table>';

      navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain.trim()], { type: 'text/plain' })
        })
      ]);
    }

    return {
      init: function (s) {
        settings = s || {};
        this.update();
      },
      updateSettings: function (s) {
        settings = s || {};
        this.update();
      },
      update: function () {
        const isEnabled = currentSettings['extension-toggle'] !== false && settings.tools?.copyAllLogsEnabled !== false;
        const existingBtn = document.getElementById('arz-copy-page-logs-btn');
        if (isEnabled) {
          runWhenElementExists('.filter-buttons', () => this.injectButton());
        } else {
          if (existingBtn) existingBtn.remove();
        }
      },
      injectButton: function () {
        if (document.getElementById('arz-copy-page-logs-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-copy-page-logs-btn';
        btn.className = 'btn btn-primary';
        btn.style.cssText = 'margin-left: 10px;';
        btn.innerHTML = `<i class="fa-regular fa-copy" style="margin-right: 6px;"></i> Копировать страницу`;
        btn.onclick = () => {
          this.copyAllPageLogs();
          const oldHTML = btn.innerHTML;
          btn.innerHTML = `<i class="fa-solid fa-check" style="margin-right: 6px;"></i> Скопировано!`;
          setTimeout(() => {
            btn.innerHTML = oldHTML;
          }, 2000);
        };
        container.appendChild(btn);
      },
      copyAllPageLogs: function () {
        const tbl = document.querySelector('table.table');
        if (!tbl) return;
        const rows = Array.from(tbl.querySelectorAll('tbody tr')).filter(isRowVisible);
        if (rows.length === 0) return;

        const formattedLines = [];
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const time = cells[0].textContent.trim();
            const actionCell = cells[1].cloneNode(true);
            actionCell.querySelectorAll('.btn, button, .js_entry_format_button, .alh-col-eye-btn, .badge, .bi, svg, i, .app__hidden, .az-geo-inserted, .arz-geo-inserted, .arz-dup-badge, button, .arizona-ecosystem-badge').forEach(el => el.remove());
            let logText = actionCell.textContent;
            const ipGeoRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?:\s*\([^)]*\))?(?:\s*~\d+(?:\.\d+)?km)?/g;
            logText = logText.replace(ipGeoRegex, '').replace(/\s+/g, ' ').trim();
            formattedLines.push(`[${time}] ${logText}`);
          }
        });

        const textToCopy = formattedLines.join('\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
          window.ArizonaNotifications.show('Логи скопированы!', 'success');
        }).catch(err => {
          console.error('Failed to copy logs:', err);
          window.ArizonaNotifications.show('Ошибка копирования', 'error');
        });
      },
      copyAllLogs: function () {
        const tbl = document.querySelector('table.table');
        if (!tbl) return;
        const rows = Array.from(tbl.querySelectorAll('tbody tr')).filter(isRowVisible);
        if (rows.length > 0) copyTable(rows);
      }
    };
  })();

  window.ArizonaSidebarManager = (function () {
    let settings = {};

    return {
      init: function (s) {
        settings = s || {};
        this.update();
      },
      updateSettings: function (s) {
        settings = s || {};
        this.update();
      },
      update: function () {
        const isToggleEnabled = currentSettings['extension-toggle'] !== false && currentSettings['visual-toggle-sidebar'] !== false;
        const btn = document.getElementById('arz-sidebar-toggle-btn');

        if (isToggleEnabled) {
          document.body.classList.add('arz-toggle-sidebar-active');
          if (!btn) {
            this.createButton();
          }
          let savedState;
          try { savedState = localStorage.getItem('arz_sidebar_collapsed'); } catch (error) { }
          if (savedState === 'true') {
            document.body.classList.add('arz-sidebar-collapsed');
            this.updateButtonLabel(true);
          } else {
            document.body.classList.remove('arz-sidebar-collapsed');
            this.updateButtonLabel(false);
          }
        } else {
          document.body.classList.remove('arz-toggle-sidebar-active', 'arz-sidebar-collapsed');
          if (btn) btn.remove();
        }
      },
      createButton: function () {
        if (document.getElementById('arz-sidebar-toggle-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'arz-sidebar-toggle-btn';
        btn.type = 'button';
        btn.title = 'Открыть / скрыть боковое меню';
        btn.innerHTML = `<i class="fa-solid fa-bars-staggered" style="font-size: 13px;"></i> <span class="arz-sidebar-btn-text" style="font-size: 12px;">Меню</span>`;
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.documentElement.classList.remove('arz-layout-pending');
          const isCollapsed = document.body.classList.toggle('arz-sidebar-collapsed');
          try { localStorage.setItem('arz_sidebar_collapsed', isCollapsed ? 'true' : 'false'); } catch (error) { }
          this.updateButtonLabel(isCollapsed);
        };

        const logoContainer = document.querySelector('.app-nav-logo, .navbar-brand.logo, .navbar-brand');
        if (logoContainer) {
          logoContainer.prepend(btn);
        } else {
          const nav = document.querySelector('.app-nav, .app-header');
          if (nav) nav.prepend(btn);
          else document.body.appendChild(btn);
        }
      },
      updateButtonLabel: function (isCollapsed) {
        const btn = document.getElementById('arz-sidebar-toggle-btn');
        if (!btn) return;
        if (isCollapsed) {
          btn.innerHTML = `<i class="fa-solid fa-bars" style="font-size: 13px; color: var(--az-accent-hover);"></i> <span class="arz-sidebar-btn-text" style="font-size: 12px;">Меню</span>`;
        } else {
          btn.innerHTML = `<i class="fa-solid fa-bars-staggered" style="font-size: 13px;"></i> <span class="arz-sidebar-btn-text" style="font-size: 12px;">Меню</span>`;
        }
      }
    };
  })();

  window.ArizonaTemplatesManager = (function () {
    let settings = {};
    let templates = [];
    let currentModal = null;

    function getCurrentFilterState() {
      const state = {
        formParams: {},
        formParamSummary: [],
        searchText: '',
        searchMode: 'show',
        searchAuto: false
      };

      const form = document.querySelector('form.filter');
      if (form) {
        const formData = new FormData(form);
        for (const [key, value] of formData.entries()) {
          if (value !== '') {
            if (!state.formParams[key]) {
              state.formParams[key] = [];
            }
            state.formParams[key].push(value);
          }
        }

        const selectedTypeLabels = [];
        form.querySelectorAll('select[name*="type"] option:checked, select[name*="types"] option:checked').forEach(opt => {
          const txt = opt.textContent.trim();
          if (txt && !selectedTypeLabels.includes(txt)) selectedTypeLabels.push(txt);
        });

        form.querySelectorAll('.select2-selection__choice, .tag-item, .badge, .label').forEach(b => {
          const txt = b.textContent.replace('×', '').trim();
          if (txt && !selectedTypeLabels.includes(txt) && !txt.includes('Сбросить') && !txt.includes('Применить')) {
            selectedTypeLabels.push(txt);
          }
        });

        const playerInput = form.querySelector('input[name="player"]');
        if (playerInput && playerInput.value.trim()) {
          state.formParamSummary.push(`Игрок: ${playerInput.value.trim()}`);
        }

        if (selectedTypeLabels.length > 0) {
          state.formParamSummary.push(`Типы: ${selectedTypeLabels.slice(0, 3).join(', ')}${selectedTypeLabels.length > 3 ? '...' : ''}`);
        } else if (state.formParams['type[]'] || state.formParams['types[]'] || state.formParams['type'] || state.formParams['types']) {
          const arr = state.formParams['type[]'] || state.formParams['types[]'] || state.formParams['type'] || state.formParams['types'];
          state.formParamSummary.push(`Типов: ${arr.length}`);
        }
      }

      const filterTa = document.getElementById('arz-filter-logs');
      if (filterTa && filterTa.value.trim()) {
        state.searchText = filterTa.value.trim();
        state.searchMode = document.querySelector('input[name="arz-filter-logs-mode"]:checked')?.value || 'show';
        state.searchAuto = !!document.getElementById('arz-filter-logs-auto')?.checked;
        state.formParamSummary.push(`Поиск: ${state.searchText}`);
      }

      return state;
    }

    function render() {
      const container = document.getElementById('arz-templates-list');
      const search = document.getElementById('arz-templates-search');
      if (!container) return;

      const term = search ? search.value.toLowerCase() : '';
      const filtered = templates.filter(t => t.name.toLowerCase().includes(term) || (t.filters && t.filters.toLowerCase().includes(term)));
      document.getElementById('arz-templates-total-count').textContent = templates.length;

      if (filtered.length === 0) {
        container.innerHTML = `<div class="alh-empty-state"><i class="alh-layout-134 fa-regular fa-folder-open"></i> Нет сохраненных шаблонов</div>`;
        return;
      }

      container.innerHTML = filtered.map(t => `
        <div class="arz-template-card" data-id="${t.id}">
          <div class="alh-layout-26">
            <div class="arz-template-card-title">${window.ArizonaUtils.escapeHtml(t.name)}</div>
            <div class="arz-template-card-subtitle">${window.ArizonaUtils.escapeHtml(t.filters || 'Шаблон фильтров')}</div>
          </div>
          <div class="alh-layout-27">
            <button class="btn-delete arz-list-item-btn" data-id="${t.id}"><i class="fa-regular fa-trash-can"></i></button>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.arz-template-card').forEach(card => {
        card.onclick = (e) => {
          if (e.target.closest('.btn-delete')) {
            const id = parseInt(e.target.closest('.btn-delete').dataset.id);
            templates = templates.filter(t => t.id !== id);
            localStorage.setItem('filter_templates', JSON.stringify(templates));
            render();
            window.ArizonaNotifications.show('Шаблон удален', 'info');
            return;
          }
          const id = parseInt(card.dataset.id);
          const t = templates.find(item => item.id === id);
          if (!t) return;

          if (t.formParams && Object.keys(t.formParams).length > 0) {
            const targetUrl = new URL(window.location.origin + window.location.pathname);

            const currentUrl = new URL(window.location.href);
            if (currentUrl.searchParams.get('server_number') && !t.formParams['server_number']) {
              targetUrl.searchParams.set('server_number', currentUrl.searchParams.get('server_number'));
            }

            for (const key in t.formParams) {
              const vals = t.formParams[key];
              if (Array.isArray(vals)) {
                vals.forEach(v => targetUrl.searchParams.append(key, v));
              } else if (vals) {
                targetUrl.searchParams.append(key, vals);
              }
            }

            if (t.searchFilter) {
              chrome.storage.local.set({
                arzLogFilter: {
                  text: t.searchFilter.text || '',
                  mode: t.searchFilter.mode || 'show',
                  auto: t.searchFilter.auto !== false
                }
              });
            }

            window.ArizonaNotifications.show('Применение шаблона...', 'info');
            closeModal();
            setTimeout(() => {
              window.location.href = targetUrl.toString();
            }, 50);
            return;
          }

          const filterText = t.searchFilter?.text || t.filters || '';
          const ta = document.getElementById('arz-filter-logs');
          if (ta && filterText) {
            ta.value = filterText;
            if (t.searchFilter?.mode) {
              const rad = document.querySelector(`input[name="arz-filter-logs-mode"][value="${t.searchFilter.mode}"]`);
              if (rad) rad.checked = true;
            }
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
            window.ArizonaNotifications.show('Шаблон применен', 'success');
            closeModal();
          } else {
            window.ArizonaNotifications.show('Шаблон применен', 'info');
            closeModal();
          }
        };
      });
    }

    function closeModal() {
      if (currentModal) {
        closeOverlay(currentModal);
        currentModal = null;
      }
    }

    const modalHTML = `
      <div id="alh-templates-overlay" class="alh-modal-overlay">
        <div class="arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-folder-open"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Шаблоны фильтров</div>
              <div class="arz-modal-subtitle">Быстрый доступ к сохраненным фильтрам</div>
            </div>
            <button id="arz-templates-close" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-modal-body">
            <div class="arz-modal-form-group">
              <label class="arz-modal-label"><i class="fa-solid fa-square-plus"></i> Новый шаблон</label>
              <div class="alh-layout-10">
                <input type="text" id="arz-new-template-name" class="alh-layout-11 arz-input" placeholder="Название шаблона...">
                <button id="arz-add-template-btn" class="alh-layout-135 arz-btn-primary">Сохранить</button>
              </div>
            </div>
            <div class="arz-modal-form-group">
              <label class="arz-modal-label"><i class="fa-solid fa-magnifying-glass"></i> Поиск</label>
              <input type="text" id="arz-templates-search" class="arz-input" placeholder="Поиск шаблонов...">
            </div>
            <div class="arz-modal-form-group">
              <div class="alh-layout-136">
                <label class="arz-modal-label"><i class="fa-solid fa-bookmark"></i> Сохраненные шаблоны</label>
                <span class="alh-layout-137">Всего: <span id="arz-templates-total-count">0</span></span>
              </div>
              <div id="arz-templates-list" class="arz-list-container"></div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-templates-close-bottom" class="alh-layout-11 arz-btn-danger">Закрыть</button>
          </div>
        </div>
      </div>
    `;

    return {
      init: function (s) {
        settings = s || {};
        try {
          templates = JSON.parse(localStorage.getItem('filter_templates')) || [];
        } catch (e) { templates = []; }
        this.update();
      },
      updateSettings: function (s) {
        settings = s || {};
        this.update();
      },
      update: function () {
        const isEnabled = currentSettings['extension-toggle'] !== false && settings.templatesEnabled !== false;
        const existingBtn = document.getElementById('arz-templates-btn');
        if (isEnabled) {
          runWhenElementExists('.filter-buttons', () => this.injectButton());
        } else {
          if (existingBtn) existingBtn.remove();
        }
      },
      injectButton: function () {
        if (document.getElementById('arz-templates-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-templates-btn';
        btn.className = 'btn btn-success';
        btn.style.cssText = 'margin-left: 10px;';
        btn.innerHTML = `<i class="alh-layout-62 fa-solid fa-folder-open"></i> Шаблоны`;
        btn.onclick = () => {
          const overlay = document.createElement('div');
          overlay.innerHTML = modalHTML;
          const el = overlay.firstElementChild;
          openOverlay(el);
          currentModal = el;
          render();

          el.querySelector('#arz-templates-close').onclick = closeModal;
          el.querySelector('#arz-templates-close-bottom').onclick = closeModal;
          el.querySelector('#arz-templates-search').oninput = () => render();
          el.querySelector('#arz-add-template-btn').onclick = () => {
            const nameInput = el.querySelector('#arz-new-template-name');
            const name = nameInput.value.trim();
            if (!name) { window.ArizonaNotifications.show('Введите название шаблона', 'error'); return; }

            const state = getCurrentFilterState();
            const hasFormParams = Object.keys(state.formParams).some(k => state.formParams[k].length > 0);
            const hasSearch = !!state.searchText;

            if (!hasFormParams && !hasSearch) {
              window.ArizonaNotifications.show('Фильтры не установлены!', 'error');
              return;
            }

            let summaryText = state.formParamSummary.join(' | ');
            if (!summaryText) {
              summaryText = state.searchText ? `Поиск: ${state.searchText}` : 'Сохраненные фильтры';
            }

            templates.unshift({
              id: Date.now(),
              name: name,
              filters: summaryText,
              formParams: state.formParams,
              searchFilter: {
                text: state.searchText,
                mode: state.searchMode,
                auto: state.searchAuto
              }
            });

            localStorage.setItem('filter_templates', JSON.stringify(templates));
            nameInput.value = '';
            render();
            window.ArizonaNotifications.show('Шаблон сохранен!', 'success');
          };
        };
        container.appendChild(btn);
      }
    };
  })();



  let resetBtnElement = null;
  let originalResetBtnHTML = null;
  let originalResetBtnParent = null;
  let originalResetBtnStyle = null;
  let originalResetBtnClasses = null;

  function styleResetButton() {
    if (sakaiCompatible()) return;
    const container = document.querySelector('.filter-buttons');
    if (!container) return;

    if (resetBtnElement && !document.body.contains(resetBtnElement)) {
      resetBtnElement = null;
    }

    let resetBtn = resetBtnElement;
    if (!resetBtn) {
      const candidates = Array.from(document.querySelectorAll('.filter-buttons a, .filter-buttons button, form a, form button'));
      resetBtn = candidates.find(el => {
        if (el.id && el.id.startsWith('arz-')) return false;
        if (el.getAttribute('type') === 'submit') return false;

        const text = el.textContent.trim().toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();

        return text.includes('сбросить') ||
          text.includes('очистить') ||
          el.getAttribute('type') === 'reset' ||
          href === 'http://arizonarp.logsparser.info' ||
          href === 'https://arizonarp.logsparser.info' ||
          href === 'http://arizonarp.logsparser.info/' ||
          href === 'https://arizonarp.logsparser.info/';
      });
      if (resetBtn) {
        resetBtnElement = resetBtn;
      }
    }

    if (!resetBtn) return;

    const isEnabled = currentSettings['extension-toggle'] !== false && arizonaSettings.tools?.styleResetButtonEnabled !== false;

    if (originalResetBtnHTML === null) {
      originalResetBtnHTML = resetBtn.innerHTML;
      originalResetBtnParent = resetBtn.parentElement;
      originalResetBtnStyle = resetBtn.getAttribute('style') || '';
      originalResetBtnClasses = Array.from(resetBtn.classList);
    }

    if (!isEnabled) {
      resetBtn.innerHTML = originalResetBtnHTML;
      resetBtn.style.cssText = originalResetBtnStyle;
      resetBtn.className = '';
      originalResetBtnClasses.forEach(c => resetBtn.classList.add(c));
      if (resetBtn.parentElement !== originalResetBtnParent && originalResetBtnParent) {
        originalResetBtnParent.appendChild(resetBtn);
      }
      return;
    }

    resetBtn.classList.remove('btn-danger', 'btn-outline-danger', 'btn-default');
    resetBtn.classList.add('btn', 'btn-success');
    resetBtn.style.color = 'white !important';

    if (!resetBtn.querySelector('i')) {
      const text = resetBtn.textContent.replace(/\s+/g, ' ').trim();
      resetBtn.innerHTML = `<i class="alh-layout-62 fa-solid fa-rotate-left"></i> ${text}`;
    }

    if (resetBtn.parentElement !== container) {
      container.insertBefore(resetBtn, container.children[1] || null);
    }
  }

  function isRealSubmitButton(el) {
    if (!el) return false;
    if (el.id && el.id.startsWith('arz-')) return false;
    if (el.tagName === 'A') return false;
    if (el.getAttribute('type') === 'submit') return true;
    if (el.tagName === 'BUTTON' && el.classList.contains('btn-success') && !el.id && (el.closest('form.filter') || el.closest('.filter-buttons'))) {
      return true;
    }
    return false;
  }

  function handleFilterSubmit(form, submitBtn) {
    const invalid = (form || document.querySelector('form.filter'))?.querySelector('.alh-field-display[aria-invalid="true"]');
    if (invalid) { invalid.focus(); return; }
    if (!submitBtn) {
      submitBtn = form ? form.querySelector('button[type="submit"]:not([id^="arz-"]), input[type="submit"]:not([id^="arz-"])') : null;
    }
    if (!submitBtn) {
      submitBtn = document.querySelector('.filter-buttons button[type="submit"]:not([id^="arz-"]), .filter-buttons button.btn-success:not([id^="arz-"])');
    }

    if (submitBtn && isRealSubmitButton(submitBtn)) {
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Загрузка...';
      submitBtn.style.pointerEvents = 'none';
    }

    const currentUrl = new URL(window.location.href);
    const targetUrl = new URL(window.location.origin + window.location.pathname);

    currentUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.append(key, value);
    });

    const actualForm = form || document.querySelector('form.filter');
    const multiPlayers = window.ArizonaMultiPlayersManager.prepareSubmit(actualForm);
    if (actualForm) {
      const formData = new FormData(actualForm);

      const allFormNames = new Set(formData.keys());
      actualForm.querySelectorAll('[name]').forEach(el => {
        const name = el.getAttribute('name');
        if (name) allFormNames.add(name);
      });

      allFormNames.forEach(key => {
        targetUrl.searchParams.delete(key);
        if (key.endsWith('[]')) {
          targetUrl.searchParams.delete(key.slice(0, -2));
        } else {
          targetUrl.searchParams.delete(`${key}[]`);
        }
      });

      for (const [key, value] of formData.entries()) {
        if (value !== '') {
          targetUrl.searchParams.append(key, value);
        }
      }

      if (multiPlayers.length > 0) {
        targetUrl.searchParams.set('player', multiPlayers[0]);
      }
    }

    const limitSelect = document.querySelector('select[name="limit"]');
    if (limitSelect && limitSelect.value) {
      targetUrl.searchParams.set('limit', limitSelect.value);
    }

    setTimeout(() => {
      window.location.href = targetUrl.toString();
    }, 20);
  }

  document.addEventListener('submit', (e) => {
    if (!isInitialized || currentSettings['extension-toggle'] === false) return;
    const form = e.target;
    if (form && form.matches('form.filter')) {
      if (sakaiCompatible()) {
        window.ArizonaMultiPlayersManager.prepareSubmit(form);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const btn = form.querySelector('button[type="submit"]:not([id^="arz-"]), input[type="submit"]:not([id^="arz-"])');
      handleFilterSubmit(form, btn);
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!isInitialized || sakaiCompatible() || currentSettings['extension-toggle'] === false) return;
    const btn = e.target.closest('button, input[type="submit"]');
    if (btn && isRealSubmitButton(btn) && (btn.closest('form.filter') || btn.closest('.filter-buttons'))) {
      e.preventDefault();
      e.stopPropagation();
      const form = btn.closest('form.filter') || document.querySelector('form.filter');
      handleFilterSubmit(form, btn);
    }
  }, true);

  let isInitialized = false;
  let isInitializing = false;
  let startupReady = false;
  let challengeObserver = null;

  window.ArizonaMultiSelectManager = (function () {
    let isEnabled = true;
    let barElement = null;
    let rangeAnchor = null;
    let keyboardRange = false;
    document.addEventListener('click', event => {
      const checkbox = event.target.closest?.('.arz-row-checkbox');
      if (!checkbox || checkbox.disabled || currentSettings['extension-toggle'] === false) return;
      const row = checkbox.closest('tr');
      const body = row?.parentElement;
      if (!body) return;
      if (!(event.shiftKey || keyboardRange) || !rangeAnchor?.isConnected || rangeAnchor.parentElement !== body) {
        rangeAnchor = row; return;
      }
      // Read visibility before writing any row classes, avoiding layout work per row.
      const rows = [...body.rows].filter(r => !r.hidden && !r.classList.contains('arz-row-hidden') && r.getClientRects().length);
      const first = rows.indexOf(rangeAnchor), last = rows.indexOf(row);
      if (first < 0 || last < 0) { rangeAnchor = row; return; }
      for (const target of rows.slice(Math.min(first,last), Math.max(first,last) + 1)) {
        injectCheckbox(target);
        const cb = target.querySelector('.arz-row-checkbox');
        if (cb.disabled) continue;
        cb.checked = checkbox.checked;
        target.classList.toggle('arz-row-selected', cb.checked);
      }
      // The native change event updates the counter once for the complete range.
    });
    document.addEventListener('keydown', event => {
      if (event.code !== 'Space' || !event.shiftKey || !event.target.matches?.('.arz-row-checkbox')) return;
      event.preventDefault();
      if (event.repeat) return;
      keyboardRange = true;
      try { event.target.click(); } finally { keyboardRange = false; }
    });

    function createBar() {
      if (document.getElementById('arz-bulk-actions-bar')) return;
      barElement = document.createElement('div');
      barElement.id = 'arz-bulk-actions-bar';
      barElement.innerHTML = `
        <div class="arz-bulk-bar-count">
          <i class="fa-solid fa-check-double" style="color: var(--az-accent-hover);"></i>
          Выделено логов: <strong id="arz-bulk-count-num">0</strong>
        </div>
        <div class="arz-bulk-bar-actions">
          <button type="button" class="arz-btn-secondary" id="arz-bulk-copy-logs" title="Копировать в формате Время + Лог">
            <i class="fa-regular fa-copy"></i> Время + Лог
          </button>
          <button type="button" class="arz-btn-secondary" id="arz-bulk-copy-nicks" title="Скопировать никнеймы">
            <i class="fa-solid fa-user"></i> Никнеймы
          </button>
          <button type="button" class="arz-btn-secondary" id="arz-bulk-copy-full" title="Скопировать всю информацию">
            <i class="fa-solid fa-align-left"></i> Вся инфо
          </button>
          <button type="button" class="arz-btn-secondary" id="arz-bulk-download-txt" title="Скачать выделенные логи в файл .txt">
            <i class="fa-solid fa-file-arrow-down"></i> В .txt
          </button>
          <button type="button" class="arz-btn-secondary" id="arz-bulk-mark" title="Отметить выделенные логи">
            <i class="fa-solid fa-bookmark" style="color: #f59e0b;"></i> Отметить
          </button>
          <button type="button" class="arz-btn-secondary" id="arz-bulk-unmark" title="Снять метки с выделенных логов">
            <i class="fa-regular fa-bookmark"></i> Снять метку
          </button>
          <button type="button" class="arz-btn-secondary" id="arz-bulk-show" title="Показать скрытые логи">
            <i class="fa-solid fa-eye"></i> Показать
          </button>
          <button type="button" class="arz-btn-secondary" id="arz-bulk-hide" title="Скрыть выделенные логи">
            <i class="fa-solid fa-eye-slash"></i> Скрыть
          </button>
          <button type="button" class="arz-btn-danger" id="arz-bulk-deselect" title="Снять выделение со всех">
            <i class="fa-solid fa-xmark"></i> Отмена
          </button>
        </div>
      `;
      const actions = barElement.querySelector('.arz-bulk-bar-actions');
      for (const [label, ids] of [
        ['Копирование', ['copy-logs', 'copy-nicks', 'copy-full']],
        ['Экспорт', ['download-txt']], ['Метки', ['mark', 'unmark']],
        ['Видимость', ['show', 'hide']], ['Выделение', ['deselect']]
      ]) {
        const group = document.createElement('div');
        group.className = 'alh-bulk-group'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
        ids.forEach(id => group.append(barElement.querySelector('#arz-bulk-' + id)));
        actions.append(group);
      }
      document.body.appendChild(barElement);

      barElement.querySelector('#arz-bulk-copy-logs').onclick = copyLogsTimeText;
      barElement.querySelector('#arz-bulk-copy-nicks').onclick = copyNicks;
      barElement.querySelector('#arz-bulk-copy-full').onclick = copyFullInfo;
      barElement.querySelector('#arz-bulk-download-txt').onclick = downloadSelectedAsTxt;
      barElement.querySelector('#arz-bulk-mark').onclick = markSelected;
      barElement.querySelector('#arz-bulk-unmark').onclick = unmarkSelected;
      barElement.querySelector('#arz-bulk-show').onclick = showSelected;
      barElement.querySelector('#arz-bulk-hide').onclick = hideSelected;
      barElement.querySelector('#arz-bulk-deselect').onclick = deselectAll;
    }

    function updateBarVisibility() {
      if (!barElement) createBar();
      const selectedCheckboxes = document.querySelectorAll('table.table tbody tr input.arz-row-checkbox:checked');
      const count = selectedCheckboxes.length;
      const numEl = document.getElementById('arz-bulk-count-num');
      if (numEl) numEl.textContent = count;

      const isMultiEnabled = currentSettings['extension-toggle'] !== false && currentSettings['tweak-multi-select'] !== false;
      if (count > 0 && isMultiEnabled) {
        barElement.classList.add('visible');
      } else {
        if (barElement) barElement.classList.remove('visible');
      }
    }

    function injectCheckbox(tr) {
      const isMultiEnabled = currentSettings['extension-toggle'] !== false && currentSettings['tweak-multi-select'] !== false;
      if (!isMultiEnabled) return;
      if (tr.querySelector('.arz-row-checkbox')) return;
      const firstCell = tr.cells[0];
      if (!firstCell) return;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'arz-row-checkbox';
      cb.title = 'Выделить лог';

      firstCell.insertBefore(cb, firstCell.firstChild);
    }

    function getSelectedRows() {
      const checked = document.querySelectorAll('table.table tbody tr input.arz-row-checkbox:checked');
      return Array.from(checked).map(cb => cb.closest('tr')).filter(Boolean);
    }

    function copyLogsTimeText() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;
      const lines = rows.map(tr => {
        const date = getCleanCellText(tr.cells[0]);
        const action = getCleanCellText(tr.cells[1]);
        return `[${date}] ${action}`;
      });
      writeToClipboard(lines.join('\n')).then(() => {
        window.ArizonaNotifications.show(`Скопировано логов: ${lines.length}`, 'success');
      });
    }

    function copyNicks() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;
      const nicksSet = new Set();
      rows.forEach(tr => {
        const actionCell = tr.cells[1];
        if (actionCell) {
          actionCell.querySelectorAll('a[href*="player="], a strong').forEach(el => {
            const text = el.textContent.trim();
            if (isValidNickname(text)) nicksSet.add(text);
          });
          const textContent = actionCell.textContent || '';
          const matches = textContent.match(/\b[A-Z][a-zA-Z0-9]*_[A-Za-z0-9_]+\b/g);
          if (matches) {
            matches.forEach(m => { if (isValidNickname(m)) nicksSet.add(m); });
          }
        }
      });
      const nicks = Array.from(nicksSet);
      if (nicks.length === 0) {
        window.ArizonaNotifications.show('Никнеймы в выделенных логах не найдены', 'warning');
        return;
      }
      writeToClipboard(nicks.join('\n')).then(() => {
        window.ArizonaNotifications.show(`Скопировано уникальных никнеймов: ${nicks.length}`, 'success');
      });
    }

    function copyFullInfo() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;
      const lines = rows.map(tr => {
        const date = getCleanCellText(tr.cells[0]);
        const action = getCleanCellText(tr.cells[1]);
        const data = getCleanCellText(tr.cells[2]);
        const ipCell = getIpCellFromRow(tr);
        const ip = getCleanCellText(ipCell, true);

        const parts = [date, action, data, ip].map(x => x.trim());
        while (parts.length > 0 && !parts[parts.length - 1]) {
          parts.pop();
        }
        return parts.join(' | ');
      });

      writeToClipboard(lines.join('\n')).then(() => {
        window.ArizonaNotifications.show(`Скопировано полных строк: ${lines.length}`, 'success');
      });
    }

    function downloadTxtFile(filename, text) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function downloadSelectedAsTxt() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;

      const lines = rows.map(tr => {
        const date = getCleanCellText(tr.cells[0]);
        const action = getCleanCellText(tr.cells[1]);
        return `[${date}] ${action}`;
      });

      const textToSave = lines.join('\r\n');

      const serverNum = new URLSearchParams(window.location.search).get('server_number') || '0';
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
      const filename = `logs_server_${serverNum}_${dateStr}_${timeStr}.txt`;

      downloadTxtFile(filename, textToSave);
      window.ArizonaNotifications.show(`Сохранено логов в файл: ${lines.length}`, 'success');
    }

    function markSelected() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;
      rows.forEach(tr => {
        tr.classList.add('arz-row-marked');
      });
      if (window.ArizonaNotifications) {
        window.ArizonaNotifications.show(`Отмечено логов: ${rows.length}`, 'success');
      }
    }

    function unmarkSelected() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;
      rows.forEach(tr => {
        tr.classList.remove('arz-row-marked');
      });
      if (window.ArizonaNotifications) {
        window.ArizonaNotifications.show(`Сняты метки с логов: ${rows.length}`, 'info');
      }
    }

    function showSelected() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;
      let count = 0;
      rows.forEach(tr => {
        if (tr.classList.contains('arz-row-hidden')) {
          tr.classList.remove('arz-row-hidden');
          count++;
        }
      });

      if (count > 0) {
        window.ArizonaNotifications.show(`Раскрыто скрытых логов: ${count}`, 'success');
      } else {
        window.ArizonaNotifications.show('Среди выделенных нет скрытых логов', 'info');
      }
      deselectAll();
    }

    function hideSelected() {
      const rows = getSelectedRows();
      if (rows.length === 0) return;
      rows.forEach(tr => {
        tr.classList.add('arz-row-hidden');
      });
      window.ArizonaNotifications.show(`Скрыто логов: ${rows.length}`, 'info');
      deselectAll();
    }

    function deselectAll() {
      rangeAnchor = null;
      document.querySelectorAll('table.table tbody tr input.arz-row-checkbox').forEach(cb => {
        cb.checked = false;
        const tr = cb.closest('tr');
        if (tr) tr.classList.remove('arz-row-selected');
      });
      updateBarVisibility();
    }

    function selectAllVisible() {
      const rows = document.querySelectorAll('table.table tbody tr');
      let count = 0;
      rows.forEach(tr => {
        if (tr.style.display !== 'none') {
          injectCheckbox(tr);
          const cb = tr.querySelector('.arz-row-checkbox');
          if (cb) {
            cb.checked = true;
            tr.classList.add('arz-row-selected');
            count++;
          }
        }
      });
      updateBarVisibility();
      window.ArizonaNotifications.show(`Выделено логов: ${count}`, 'info');
    }

    function injectSelectAllButton() {
      const isMultiEnabled = currentSettings['extension-toggle'] !== false && currentSettings['tweak-multi-select'] !== false;
      const existingBtn = document.getElementById('arz-select-all-logs-btn');
      if (!isMultiEnabled) {
        if (existingBtn) existingBtn.remove();
        return;
      }
      if (existingBtn) return;

      const container = document.querySelector('.filter-buttons');
      if (!container) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'arz-select-all-logs-btn';
      btn.className = 'btn btn-secondary';
      btn.style.cssText = 'margin-left: 10px;';
      btn.innerHTML = `<i class="fa-solid fa-check-double" style="margin-right: 6px;"></i> Выделить всё на странице`;
      btn.onclick = () => selectAllVisible();

      const copyPageBtn = document.getElementById('arz-copy-page-logs-btn');
      if (copyPageBtn && copyPageBtn.parentNode) {
        copyPageBtn.parentNode.insertBefore(btn, copyPageBtn.nextSibling);
      } else {
        container.appendChild(btn);
      }
    }

    function removeUI() {
      document.querySelectorAll('.arz-row-checkbox').forEach(cb => cb.remove());
      document.querySelectorAll('tr.arz-row-selected').forEach(tr => tr.classList.remove('arz-row-selected'));
      if (barElement) {
        barElement.remove();
        barElement = null;
      }
      const btn = document.getElementById('arz-select-all-logs-btn');
      if (btn) btn.remove();
    }

    return {
      init: function (s) {
        this.update();
      },
      updateSettings: function (s) {
        this.update();
      },
      update: function () {
        const isMultiEnabled = currentSettings['extension-toggle'] !== false && currentSettings['tweak-multi-select'] !== false;
        if (isMultiEnabled) {
          createBar();
          runWhenElementExists('.filter-buttons', () => injectSelectAllButton());
        } else {
          removeUI();
        }
      },
      injectCheckbox: injectCheckbox,
      updateBarVisibility: updateBarVisibility,
      selectAllVisible: selectAllVisible,
      deselectAll: deselectAll
    };
  })();

  async function init() {
    if (isInitialized || isInitializing) return;

    try {
    const host = window.location.hostname;

    if (host.includes('arizonarp.logsparser.info')) {

      const isChallenge = () => !document.querySelector('table.table') && document.body && /Processing your request|please wait/i.test(document.body.textContent);
      if (isChallenge()) {
        if (challengeObserver) return;
        const obs = challengeObserver = new MutationObserver(() => {
          if (!isChallenge()) {
            obs.disconnect();
            challengeObserver = null;
            setTimeout(init, 50);
          }
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        return;
      }

      isInitializing = true;
      if (window.ArizonaBootstrap) {
        const values = await window.ArizonaBootstrap.settings;
        const earlyTools = () => {
          currentSettings = { ...DEFAULT_SETTINGS, ...values.arz_logsparser_helper_settings };
          arizonaSettings = structuredClone(values.arizonaSettings || {});
          if (currentSettings['extension-toggle'] !== false) ensureIconStyles();
          for (const name of ['Lookup', 'Online', 'Punishment', 'IpBatch', 'IdNick', 'Report', 'Analytics']) {
            window['Arizona' + name + 'Manager'].updateSettings(arizonaSettings);
          }
        };
        earlyTools();
        window.addEventListener('alh-bootstrap-settings', earlyTools);
        window.addEventListener('alh-compatibility-status', earlyTools);
        await window.ArizonaBootstrap.compatibility;
        if (window.ArizonaCompatibility?.status().appliedMode !== 'off') await window.ArizonaCompatibility?.documentReady;
        else await window.ArizonaBootstrap.bodyReady;
        window.removeEventListener('alh-bootstrap-settings', earlyTools);
        window.removeEventListener('alh-compatibility-status', earlyTools);
        if (isChallenge()) {
          isInitializing = false;
          init();
          return;
        }
      }
      await loadAndApplySettings();
      window.ArizonaMaskingManager.init(arizonaSettings);
      window.ArizonaMultiSelectManager.init(arizonaSettings);
      window.ArizonaObservers.init();
      await new Promise(resolve => setTimeout(resolve, 0));

      if (currentSettings['extension-toggle'] !== false) { reserveEcosystemSlot(); initEcosystemApi(); }
      const startupManagers = [
        'ArizonaTuningAHKManager',
        'ArizonaTgVkDetector',
        'ArizonaEmailDetector',
        'ArizonaColumnEyeButtons',
        'ArizonaLogFilter',
        'ArizonaFormsManager',
        'ArizonaOnlineManager',
        'ArizonaPunishmentManager',
        'ArizonaIpBatchManager',
        'ArizonaIdNickManager',
        'ArizonaReportManager',
        'ArizonaLookupManager',
        'ArizonaDateShortcut',
        'ArizonaMultiPlayersManager',
        'ArizonaIdenticalIpHighlight',
        'ArizonaAnalyticsManager',
        'ArizonaTemplatesManager',
        'ArizonaCopyLogsManager',
        'ArizonaSidebarManager',
        'ArizonaLoadMoreManager'
      ];
      let deadline = performance.now() + 4;
      for (const name of startupManagers) {
        const args = [arizonaSettings];
        if (name === 'ArizonaTemplatesManager') args.push(arizonaTemplates);
        try {
          window.ArizonaObservers.write(() => window[name].init(...args));
        } catch (error) {
          window.ArizonaBootstrap?.failOpen();
          console.error(`Error in ${name}.init:`, error);
        }
        if (performance.now() >= deadline) {
          await new Promise(resolve => setTimeout(resolve, 0));
          deadline = performance.now() + 4;
        }
      }

      await window.ArizonaPageControls?.init();
      tableStructureReady = true;
      startupReady = true;
      if (queuedRows.size) {
        window.ArizonaRuntime.cancelTask(rowTimer);
        processRowBatch();
      }

      document.addEventListener('copy', (e) => {
        try {
          if (!sakaiCompatible()) window.ArizonaMaskingManager.handleCopy(e, arizonaSettings);
        } catch (err) {
          console.error(err);
        }
      }, true);

      document.addEventListener('click', (e) => {
        const snippet = e.target.closest('.arz-copyable-snippet');
        if (snippet && currentSettings['extension-toggle'] !== false && currentSettings['tweak-copy-cells'] !== false) {
          e.stopPropagation();
          e.preventDefault();
          const text = snippet.textContent.trim();
          copyTextToClipboard(text, snippet);
          return;
        }

        if (sakaiCompatible()) return;
        const anchor = e.target.closest('a');
        if (anchor && anchor.href) {
          try {
            const target = anchor.getAttribute('target');
            if (target && target !== '_self') {
              const url = new URL(anchor.href, window.location.href);
              if (url.hostname === window.location.hostname) {
                anchor.setAttribute('target', '_self');
              }
            }
          } catch (err) {
          }
        }
      }, true);

      document.addEventListener('submit', (e) => {
    if (sakaiCompatible() || currentSettings['extension-toggle'] === false) return;
        const form = e.target;
        if (form) {
          try {
            if (typeof isModalOpen === 'function' && isModalOpen() && form.matches('form.filter')) {
              if (typeof closeFilterModal === 'function') {
                closeFilterModal();
              }
            }

            const target = form.getAttribute('target');
            if (target && target !== '_self') {
              const action = form.getAttribute('action') || '';
              const url = new URL(action, window.location.href);
              if (url.hostname === window.location.hostname) {
                form.setAttribute('target', '_self');
              }
            }
          } catch (err) {
            const target = form.getAttribute('target');
            if (target && target !== '_self') {
              form.setAttribute('target', '_self');
            }
          }
        }
      }, true);

      isInitialized = true;
      isInitializing = false;
      window.ArizonaBootstrap?.release();
      if (!queuedRows.size && currentSettings['extension-toggle'] !== false) finishTableProcessing();
      if (Object.keys(pendingSettingsChanges).length) {
        const changes = pendingSettingsChanges;
        pendingSettingsChanges = {};
        handleStorageChanges?.(changes, 'local');
      }
    }
    } catch (error) {
      isInitializing = false;
      window.ArizonaBootstrap?.failOpen();
      console.error('Arizona Helper startup failed:', error);
    }
  }

  function loadAndApplySettings() {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const acceptSettings = (result) => {
            try {
              if (result && result.arz_logsparser_helper_settings) {
                currentSettings = { ...DEFAULT_SETTINGS, ...result.arz_logsparser_helper_settings };
              }
              currentSettings = effectiveSettings(currentSettings, {}).general;
              const limitVal = currentSettings['tweak-always-limit'];
              if (limitVal && limitVal !== 'none') {
                try {
                  const url = new URL(window.location.href);
                  if (url.searchParams.get('limit') !== limitVal) {
                    url.searchParams.set('limit', limitVal);
                    window.location.replace(url.toString());
                    return;
                  }
                } catch (e) {
                  console.error('Redirection failed:', e);
                }
              }
              arizonaSettings = structuredClone(result?.arizonaSettings || {});
              arizonaTemplates = structuredClone(result?.arizonaTemplates || []);

              if (!arizonaSettings.masking) {
                arizonaSettings.masking = { enabled: true, maskIp: true, maskEmail: true, maskTG: true, maskVK: true };
              }
              if (!arizonaSettings.tools) {
                arizonaSettings.tools = {
                  identicalIPs: true, identicalIPsColor: '#ff4444', columnEyeButtons: true,
                  filterWindow: true, formsEnabled: true, online: true, punishment: true,
                  ipBatch: true, idNick: true, report: true, lookup: true, analytics: true,
                  dateShortcutEnabled: true, styleResetButtonEnabled: true,
                  copyAllLogsEnabled: true, tgVkDetectorEnabled: true, markLogsEnabled: true
                };
              } else {
                if (arizonaSettings.tools.punishment === undefined) arizonaSettings.tools.punishment = true;
                if (arizonaSettings.tools.ipBatch === undefined) arizonaSettings.tools.ipBatch = true;
                if (arizonaSettings.tools.idNick === undefined) arizonaSettings.tools.idNick = true;
                if (arizonaSettings.tools.report === undefined) arizonaSettings.tools.report = true;
                if (arizonaSettings.tools.lookup === undefined) arizonaSettings.tools.lookup = true;
                if (arizonaSettings.tools.analytics === undefined) arizonaSettings.tools.analytics = true;
                if (arizonaSettings.tools.styleResetButtonEnabled === undefined) arizonaSettings.tools.styleResetButtonEnabled = true;
                if (arizonaSettings.tools.copyAllLogsEnabled === undefined) arizonaSettings.tools.copyAllLogsEnabled = true;
                if (arizonaSettings.tools.tgVkDetectorEnabled === undefined) arizonaSettings.tools.tgVkDetectorEnabled = true;
                if (arizonaSettings.tools.markLogsEnabled === undefined) arizonaSettings.tools.markLogsEnabled = true;
                if (arizonaSettings.tools.multiPlayersEnabled === undefined) arizonaSettings.tools.multiPlayersEnabled = true;
                if (arizonaSettings.tools.duplicatePaginationTop === undefined) arizonaSettings.tools.duplicatePaginationTop = true;
              }
              if (!arizonaSettings.tuningParts) {
                arizonaSettings.tuningParts = { enabled: false, scanDelay: 500, highlightColor: '#f02849', outlineWidth: 2, timePattern: '30:01,30:02,00:03,00:01,00:02,00:03', highlightOnlyMatching: true, autoScrollToMatch: false, playSoundOnMatch: false };
              }
              if (!arizonaSettings.emailCheck) {
                arizonaSettings.emailCheck = { enabled: true, duplicateDetection: true, threshold: 3, lowColor: '#10b981', mediumColor: '#f59e0b', highColor: '#ef4444' };
              }
              if (!arizonaSettings.ipFields) {
                arizonaSettings.ipFields = { country: true, city: true, regionName: true, isp: true, org: true, as: true, mobile: false, proxy: false, hosting: true };
              } else {
                if (arizonaSettings.ipFields.hosting === undefined) arizonaSettings.ipFields.hosting = true;
              }

              arizonaSettings = effectiveSettings(currentSettings, arizonaSettings).appearance;
              document.documentElement.classList.toggle('arz-mask-pending', currentSettings['extension-toggle'] !== false && arizonaSettings.masking?.enabled !== false);
              applySettings(currentSettings);
              styleResetButton();
              resolve();
            } catch (err) {
              resolve();
            }
          };
          if (window.ArizonaBootstrap) window.ArizonaBootstrap.compatibility.then(acceptSettings);
          else chrome.storage.local.get(['arz_logsparser_helper_settings', 'arizonaSettings', 'arizonaTemplates'], acceptSettings);
        } else {
          resolve();
        }
      } catch (e) {
        resolve();
      }
    });
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      handleStorageChanges = (changes, area) => {
        if (area && area !== 'local') return;
        if (!isInitialized) { Object.assign(pendingSettingsChanges, changes); return; }
        window.ArizonaObservers.write(() => {
          if (changes.arz_logsparser_helper_settings?.newValue) {
            currentSettings = effectiveSettings({ ...DEFAULT_SETTINGS, ...changes.arz_logsparser_helper_settings.newValue }, {}).general;
            applySettings(currentSettings);
          }
          if (changes.arizonaSettings?.newValue) {
            const previous = arizonaSettings;
            arizonaSettings = effectiveSettings(currentSettings, { ...arizonaSettings, ...changes.arizonaSettings.newValue }).appearance;
            const value = (object, path) => path.split('.').reduce((result, key) => result?.[key], object);
            const changed = (...paths) => paths.some(path => JSON.stringify(value(previous, path)) !== JSON.stringify(value(arizonaSettings, path)));
            const update = (name, ...paths) => {
              if (changed(...paths)) window[name]?.updateSettings(arizonaSettings);
            };
            update('ArizonaIpLookupManager', 'ipLookupEnabled', 'geoIPEnabled', 'ipFields', 'geoTemplate');
            if (changed('guaranteeDetector', 'bindingDetector')) scanAccountSignals();
            if (changed('masking')) {
              document.documentElement.classList.toggle('arz-mask-pending', currentSettings['extension-toggle'] !== false && arizonaSettings.masking?.enabled !== false);
              window.ArizonaMaskingManager.updateSettings(arizonaSettings);
              window.ArizonaEmailDetector.reset();
              window.ArizonaTgVkDetector.reset();
            }
            update('ArizonaTuningAHKManager', 'tuningParts');
            const themePrevious = { ...previous };
            const themeNext = { ...arizonaSettings };
            for (const key of ['tools', 'masking', 'ipLookupEnabled', 'geoIPEnabled', 'ipFields', 'emailCheck', 'tuningParts', 'hiddenColumns']) {
              delete themePrevious[key];
              delete themeNext[key];
            }
            if (JSON.stringify(themePrevious) !== JSON.stringify(themeNext)) {
              window.ArizonaThemeManager.updateSettings({ ...arizonaSettings, themeEnabled: currentSettings['extension-toggle'] !== false && currentSettings['visual-theme-enabled'] !== false });
            }
            update('ArizonaCopyLogsManager', 'tools.copyAllLogsEnabled');
            update('ArizonaIdenticalIpHighlight', 'tools.identicalIPs', 'tools.identicalIPsColor');
            update('ArizonaTgVkDetector', 'tools.tgVkDetectorEnabled');
            update('ArizonaEmailDetector', 'emailCheck');
            update('ArizonaColumnEyeButtons', 'tools.columnEyeButtons', 'hiddenColumns');
            update('ArizonaLookupManager', 'tools');
            update('ArizonaTemplatesManager', 'templatesEnabled');
            update('ArizonaFormsManager', 'tools.formsEnabled');
            update('ArizonaAnalyticsManager', 'tools.analytics', 'tools.similarIPsFinder', 'tools.actionRepeatsFinder');
            update('ArizonaLogFilter', 'tools.filterWindow');
            update('ArizonaSidebarManager', 'tools');
            update('ArizonaMultiSelectManager', 'tools');
            update('ArizonaLoadMoreManager', 'tools.duplicatePaginationTop');
            update('ArizonaMultiPlayersManager', 'tools.multiPlayersEnabled');
            for (const [name, feature] of [['Online', 'online'], ['Punishment', 'punishment'], ['Report', 'report'], ['IpBatch', 'ipBatch'], ['IdNick', 'idNick']]) {
              update('Arizona' + name + 'Manager', 'tools.' + feature, 'tools.online');
            }
            if (changed('tools.markLogsEnabled')) {
              for (const row of document.querySelectorAll('table.table tbody tr')) {
                if (arizonaSettings.tools?.markLogsEnabled === false) removeMarkHandle(row);
                else observeRowControls(row);
              }
            }
            if (changed('tools.styleResetButtonEnabled')) styleResetButton();
          }
          if (changes.arizonaTemplates) {
            arizonaTemplates = changes.arizonaTemplates.newValue || [];
            window.ArizonaTemplatesManager.init(arizonaSettings, arizonaTemplates);
          }
        });
      };
      chrome.storage.onChanged.addListener(handleStorageChanges);
    }
  } catch (e) {
  }



  function normalizeName(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function buildLookupMap() {
    ecosystemLookupMap.clear();
    if (!ecosystemApiData || !Array.isArray(ecosystemApiData)) return;

    ecosystemApiData.forEach(user => {
      if (user && user.alternative_nicknames && Array.isArray(user.alternative_nicknames)) {
        user.alternative_nicknames.forEach(nick => {
          const norm = normalizeName(nick);
          if (norm) {
            ecosystemLookupMap.set(norm, user);
          }
        });
      }
    });
  }

  function openNicknameGuideCard() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'OPEN_ECOSYSTEM_GUIDE' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          const domain = ecosystemWorkingDomain || 'https://arizona-ai.ru';
          window.open(`${domain}/faq#faq-nickname-guide`, '_blank');
        }
      });
    } else {
      const domain = ecosystemWorkingDomain || 'https://arizona-ai.ru';
      window.open(`${domain}/faq#faq-nickname-guide`, '_blank');
    }
  }

  async function initEcosystemApi() {
    const request = (target, method, ...args) => new Promise((resolve, reject) => {
      target[method](...args, (result) => {
        try {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });

    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.runtime) {
        ecosystemApiData = [];
        buildLookupMap();
        return;
      }

      const result = await request(chrome.storage.local, 'get', ['arizona_ecosystem_api_data']);
      const cached = result?.arizona_ecosystem_api_data;
      const now = Date.now();
      const oneHour = 3600000;

      if (cached && cached.timestamp && (now - cached.timestamp < oneHour) && Array.isArray(cached.users)) {
        ecosystemApiData = cached.users;
        if (cached.workingDomain) {
          ecosystemWorkingDomain = cached.workingDomain;
        }
        buildLookupMap();
        renderEcosystemBadges();
        return;
      }

      const response = await request(chrome.runtime, 'sendMessage', { type: 'FETCH_ECOSYSTEM_API' });
      if (!response?.success || !Array.isArray(response.data?.users)) {
        ecosystemApiData = [];
        buildLookupMap();
        return;
      }

      if (response.data.workingDomain) {
        ecosystemWorkingDomain = response.data.workingDomain;
      }
      const dataToSave = {
        timestamp: Date.now(),
        users: response.data.users,
        workingDomain: ecosystemWorkingDomain
      };
      await request(chrome.storage.local, 'set', { arizona_ecosystem_api_data: dataToSave });
      ecosystemApiData = response.data.users;
      buildLookupMap();
      resetBadges();
      renderEcosystemBadges();
    } catch (error) {
      ecosystemApiData = [];
      buildLookupMap();
    }
  }

  function resetBadges() {
    const activeBadges = document.querySelectorAll('.arizona-styler-dev-badge');
    activeBadges.forEach(b => b.remove());

    document.querySelectorAll('[data-arizona-ecosystem-badge-checked]').forEach(el => {
      let hasBadgesLeft = false;
      let sibling = el.nextSibling;
      while (sibling) {
        if (sibling.nodeType === 1 && sibling.classList.contains('arizona-ecosystem-badge')) {
          hasBadgesLeft = true;
          break;
        }
        sibling = sibling.nextSibling;
      }
      if (!hasBadgesLeft && el.querySelector('.arizona-ecosystem-badge')) {
        hasBadgesLeft = true;
      }
      if (!hasBadgesLeft) {
        el.removeAttribute('data-arizona-ecosystem-badge-checked');
        el.removeAttribute('data-arizona-ecosystem-badged');
      }
    });
  }

  function reserveEcosystemSlot() {
    const navbar = document.querySelector('a#navbarDropdown');
    if (!navbar) return null;
    let slot = navbar.querySelector('.alh-ecosystem-slot');
    if (!slot) {
      slot = document.createElement('span');
      slot.className = 'alh-ecosystem-slot';
      slot.setAttribute('aria-label', 'Значки профиля');
      slot.tabIndex = 0;
      navbar.appendChild(slot);
    }
    return slot;
  }

  function renderEcosystemBadges() {
    if (currentSettings['extension-toggle'] === false) {
      resetBadges();
      document.querySelector('.alh-ecosystem-slot')?.remove();
      return;
    }
    if (!ecosystemApiData || ecosystemApiData.length === 0) return;

    const el = document.querySelector('a#navbarDropdown');
    if (!el) return;

    if (el.getAttribute('data-arizona-ecosystem-badge-checked') === 'true') {
      return;
    }

    el.setAttribute('data-arizona-ecosystem-badge-checked', 'true');

    const rawName = el.textContent.trim();
    if (!rawName) return;
    const normName = normalizeName(rawName);

    const user = ecosystemLookupMap.get(normName);

    if (user) {
      el.setAttribute('data-arizona-ecosystem-badged', 'true');

      const badge = document.createElement('span');
      badge.className = 'arizona-styler-dev-badge arizona-ecosystem-badge';

      const icon = document.createElement('i');
      icon.className = 'dev-badge-icon';

      const iconName = user.icon ? user.icon.replace(/^fa-/, '') : '';
      if (iconName) {
        const maskUrl = `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.3/svgs/solid/${iconName}.svg`;
        icon.style.setProperty('mask-image', `url(${maskUrl})`, 'important');
        icon.style.setProperty('-webkit-mask-image', `url(${maskUrl})`, 'important');
      }

      badge.appendChild(icon);
      badge.title = `${user.icon_description}\n(ArizonaAI Ecosystem, добавлено расширением Arizona LogsParser Helper)`;

      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openNicknameGuideCard();
      });

      reserveEcosystemSlot()?.appendChild(badge);

      if (user.achievements) {
        const achievementsList = Array.isArray(user.achievements) ? user.achievements : Object.values(user.achievements);
        achievementsList.forEach(ach => {
          if (!ach) return;
          const achBadge = document.createElement('span');
          achBadge.className = 'arizona-styler-dev-badge arizona-styler-achievement-badge arizona-ecosystem-badge';

          const achIcon = document.createElement('i');
          achIcon.className = 'dev-badge-icon';
          const achIconName = ach.icon ? ach.icon.replace(/^fa-/, '') : '';
          if (achIconName) {
            const achMaskUrl = `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.15.3/svgs/solid/${achIconName}.svg`;
            achIcon.style.setProperty('mask-image', `url(${achMaskUrl})`, 'important');
            achIcon.style.setProperty('-webkit-mask-image', `url(${achMaskUrl})`, 'important');
          }
          achBadge.appendChild(achIcon);

          if (ach.description) {
            achBadge.title = `${ach.name}\n${ach.description}\n(ArizonaAI Ecosystem, добавлено расширением Arizona LogsParser Helper)`;
          } else {
            achBadge.title = `${ach.name}\n(ArizonaAI Ecosystem, добавлено расширением Arizona LogsParser Helper)`;
          }

          achBadge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openNicknameGuideCard();
          });

          reserveEcosystemSlot()?.appendChild(achBadge);
        });
      }
    }
  }

  function checkAndInit() {
    if (location.pathname === '/authenticator') document.documentElement.classList.add('alh-authenticator-page');
    runWhenElementExists('body', init);
  }

  checkAndInit();
})();
