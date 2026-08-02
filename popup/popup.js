
document.addEventListener('DOMContentLoaded', () => {

  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));

      button.classList.add('active');
      const targetPanelEl = document.getElementById(targetTab);
      if (targetPanelEl) {
        targetPanelEl.classList.add('active');
      }
    });
  });

  const extToggle = document.getElementById('extension-toggle');
  const statusText = document.getElementById('toggle-status-text');

  function updateStatusText(enabled) {
    if (!statusText) return;
    statusText.textContent = enabled ? 'Вкл' : 'Выкл';
    if (enabled) {
      statusText.style.color = 'var(--pop-accent)';
    } else {
      statusText.style.color = 'var(--pop-text-secondary)';
    }
  }

  if (extToggle) {
    extToggle.addEventListener('change', () => {
      updateStatusText(extToggle.checked);
    });
  }

  const STORAGE_KEY = 'arz_logsparser_helper_settings';

  const defaultSettings = {
    'extension-toggle': true,
    'visual-sticky-navbar': true,
    'visual-sticky-headers': true,
    'visual-hide-sidebar': false,
    'visual-toggle-sidebar': false,
    'visual-vertical-borders': false,
    'visual-replace-favicon': false,
    'visual-remove-top-padding': false,
    'tweak-floating-filter': true,
    'tweak-load-more': true,
    'tweak-show-filled-filters': true,
    'tweak-ip-info': false,
    'tweak-always-limit': 'none',
    'tweak-copy-btn-visibility': 'hover',
    'visual-logo-customization': 'default',
    'tweak-copy-row': true,
    'tweak-hide-row': true,
    'tweak-copy-cells': true,
    'tweak-multi-select': true
  };

  const settingIds = Object.keys(defaultSettings);

  function loadSettings() {
    const applyLoadedSettings = (settings) => {
      const merged = { ...defaultSettings, ...settings };
      settingIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          if (el.tagName === 'SELECT') {
            el.value = merged[id];
          } else {
            el.checked = merged[id];
          }
          if (id === 'extension-toggle') {
            updateStatusText(merged[id]);
          }
        }
      });
    };

    const fallbackLoad = () => {
      try {
        const localData = localStorage.getItem(STORAGE_KEY);
        if (localData) {
          applyLoadedSettings(JSON.parse(localData));
        } else {
          applyLoadedSettings({});
        }
      } catch (e) {
        console.error('Failed to load settings from localStorage:', e);
        applyLoadedSettings({});
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          fallbackLoad();
        } else if (result[STORAGE_KEY]) {
          applyLoadedSettings(result[STORAGE_KEY]);
        } else {
          applyLoadedSettings({});
        }
      });
    } else {
      fallbackLoad();
    }
  }

  function saveSettings() {
    const settings = {};
    settingIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'SELECT') {
          settings[id] = el.value;
        } else {
          settings[id] = el.checked;
        }
      }
    });

    const fallbackSave = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        console.error('Failed to save settings to localStorage:', e);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: settings }, () => {
        if (chrome.runtime.lastError) {
          fallbackSave();
        }
      });
    } else {
      fallbackSave();
    }
  }

  settingIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', saveSettings);
    }
  });


  const ARIZONA_STORAGE_KEY = 'arizonaSettings';

  const defaultArizonaSettings = {
    templatesEnabled: true,
    ipLookupEnabled: true,
    geoIPEnabled: true,
    ipFields: { country: true, city: true, regionName: true, isp: true, org: true, as: true, mobile: true, proxy: true, hosting: true },
    tuningParts: { enabled: true, scanDelay: 500, highlightColor: '#f02849', outlineWidth: 2, timePattern: '30:01,30:02,00:03,00:01,00:02,00:03', highlightOnlyMatching: true, autoScrollToMatch: false, playSoundOnMatch: false },
    emailCheck: { enabled: true, duplicateDetection: true, threshold: 3, lowColor: '#10b981', mediumColor: '#f59e0b', highColor: '#ef4444' },
    masking: { enabled: false, maskIp: true, maskEmail: true, maskTG: true, maskVK: true },
    tools: {
      identicalIPs: true,
      identicalIPsColor: '#ff4444',
      similarIPsFinder: true,
      actionRepeatsFinder: true,
      columnEyeButtons: true,
      filterWindow: true,
      formsEnabled: true,
      online: true,
      dateShortcutEnabled: true,
      styleResetButtonEnabled: true,
      copyAllLogsEnabled: true,
      tgVkDetectorEnabled: true
    },
    theme: 'dark',
    fontSize: 14,
    colorScheme: 'red',
    borderRadius: '8px',
    customTriggerIcon: null,
    customTriggerEnabled: false
  };

  function getArizonaElementValue(path, settingsObj) {
    const parts = path.split('.');
    let cur = settingsObj;
    for (let part of parts) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[part];
    }
    return cur;
  }

  function setArizonaElementValue(path, val, settingsObj) {
    const parts = path.split('.');
    let cur = settingsObj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!cur[part]) cur[part] = {};
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = val;
  }

  const arizonaMappings = {
    'masking-enabled': 'masking.enabled',
    'masking-maskIp': 'masking.maskIp',
    'masking-maskEmail': 'masking.maskEmail',
    'masking-maskTG': 'masking.maskTG',
    'masking-maskVK': 'masking.maskVK',

    'ipLookupEnabled': 'ipLookupEnabled',
    'geoIPEnabled': 'geoIPEnabled',
    'ipField-country': 'ipFields.country',
    'ipField-city': 'ipFields.city',
    'ipField-regionName': 'ipFields.regionName',
    'ipField-isp': 'ipFields.isp',
    'ipField-org': 'ipFields.org',
    'ipField-as': 'ipFields.as',
    'ipField-mobile': 'ipFields.mobile',
    'ipField-proxy': 'ipFields.proxy',
    'ipField-hosting': 'ipFields.hosting',

    'tuningParts-enabled': 'tuningParts.enabled',
    'tuningParts-scanDelay': 'tuningParts.scanDelay',
    'tuningParts-outlineWidth': 'tuningParts.outlineWidth',
    'tuningParts-highlightColor': 'tuningParts.highlightColor',
    'tuningParts-timePattern': 'tuningParts.timePattern',
    'tuningParts-highlightOnlyMatching': 'tuningParts.highlightOnlyMatching',
    'tuningParts-autoScrollToMatch': 'tuningParts.autoScrollToMatch',
    'tuningParts-playSoundOnMatch': 'tuningParts.playSoundOnMatch',

    'emailCheck-enabled': 'emailCheck.enabled',
    'emailCheck-duplicateDetection': 'emailCheck.duplicateDetection',
    'emailCheck-threshold': 'emailCheck.threshold',
    'emailCheck-lowColor': 'emailCheck.lowColor',
    'emailCheck-mediumColor': 'emailCheck.mediumColor',
    'emailCheck-highColor': 'emailCheck.highColor',

    'templatesEnabled': 'templatesEnabled',
    'tools-identicalIPs': 'tools.identicalIPs',
    'tools-identicalIPsColor': 'tools.identicalIPsColor',
    'tools-similarIPsFinder': 'tools.similarIPsFinder',
    'tools-actionRepeatsFinder': 'tools.actionRepeatsFinder',
    'tools-columnEyeButtons': 'tools.columnEyeButtons',
    'tools-filterWindow': 'tools.filterWindow',
    'tools-formsEnabled': 'tools.formsEnabled',
    'tools-online': 'tools.online',
    'tools-dateShortcutEnabled': 'tools.dateShortcutEnabled',
    'tools-styleResetButtonEnabled': 'tools.styleResetButtonEnabled',
    'tools-copyAllLogsEnabled': 'tools.copyAllLogsEnabled',
    'tools-tgVkDetectorEnabled': 'tools.tgVkDetectorEnabled',

    'visual-theme-mode': 'theme',
    'visual-theme-color': 'colorScheme',
    'visual-theme-radius': 'borderRadius',
    'visual-theme-fontsize': 'fontSize'
  };

  const colorSchemes = {
    red: {
      accent: '#d40d0d',
      accentRgb: '212, 13, 13',
      accentHover: '#ff4d4d',
      dark: { bg: '#0c0e12', cardBg: '#1c212a' },
      light: { bg: '#f8fafc', cardBg: '#ffffff' }
    },
    ocean: {
      accent: '#0284c7',
      accentRgb: '2, 132, 199',
      accentHover: '#38bdf8',
      dark: { bg: '#0b0f19', cardBg: '#1f2937' },
      light: { bg: '#f0f9ff', cardBg: '#ffffff' }
    },
    emerald: {
      accent: '#059669',
      accentRgb: '5, 150, 105',
      accentHover: '#34d399',
      dark: { bg: '#06120e', cardBg: '#112e24' },
      light: { bg: '#f0fdf4', cardBg: '#ffffff' }
    },
    gold: {
      accent: '#d97706',
      accentRgb: '217, 119, 6',
      accentHover: '#fbbf24',
      dark: { bg: '#120d06', cardBg: '#2e2012' },
      light: { bg: '#fffbeb', cardBg: '#ffffff' }
    },
    frost: {
      accent: '#475569',
      accentRgb: '71, 85, 105',
      accentHover: '#94a3b8',
      dark: { bg: '#0f172a', cardBg: '#334155' },
      light: { bg: '#f1f5f9', cardBg: '#ffffff' }
    },
    dracula: {
      accent: '#bd93f9',
      accentRgb: '189, 147, 249',
      accentHover: '#ff79c6',
      dark: { bg: '#282a36', cardBg: '#44475a' },
      light: { bg: '#f3f0f9', cardBg: '#ffffff' }
    },
    sunset: {
      accent: '#ea580c',
      accentRgb: '234, 88, 12',
      accentHover: '#f43f5e',
      dark: { bg: '#1c0d02', cardBg: '#471b05' },
      light: { bg: '#fffbeb', cardBg: '#ffffff' }
    },
    cyberpunk: {
      accent: '#ff007f',
      accentRgb: '255, 0, 127',
      accentHover: '#00f0ff',
      dark: { bg: '#0a0a0f', cardBg: '#181826' },
      light: { bg: '#faf9fb', cardBg: '#ffffff' }
    },
    nord: {
      accent: '#88c0d0',
      accentRgb: '136, 192, 208',
      accentHover: '#8fbcbb',
      dark: { bg: '#2e3440', cardBg: '#3b4252' },
      light: { bg: '#eceff4', cardBg: '#ffffff' }
    },
    matrix: {
      accent: '#00ff41',
      accentRgb: '0, 255, 65',
      accentHover: '#39ff14',
      dark: { bg: '#030704', cardBg: '#0e2213' },
      light: { bg: '#f0fff4', cardBg: '#ffffff' }
    }
  };

  function applyThemeToPopup(settings) {
    const theme = settings.theme || 'dark';
    const colorSchemeName = settings.colorScheme || 'red';
    const borderRadiusVal = settings.borderRadius || '8px';
    const fontSizeVal = settings.fontSize || 14;

    const body = document.body;
    if (theme === 'light') {
      body.classList.add('pop-light-theme');
    } else {
      body.classList.remove('pop-light-theme');
    }

    body.classList.forEach(cls => {
      if (cls.startsWith('pop-theme-')) {
        body.classList.remove(cls);
      }
    });
    body.classList.add('pop-theme-' + colorSchemeName);

    const scheme = colorSchemes[colorSchemeName] || colorSchemes.red;
    const modeColors = scheme[theme] || scheme.dark;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--pop-accent', scheme.accent);
    rootStyle.setProperty('--pop-accent2', scheme.accentHover);
    rootStyle.setProperty('--pop-accent-rgb', scheme.accentRgb);
    rootStyle.setProperty('--pop-accent-gradient', `linear-gradient(135deg, ${scheme.accent} 0%, ${scheme.accentHover} 100%)`);
    rootStyle.setProperty('--pop-bg', modeColors.bg);
    rootStyle.setProperty('--pop-card-bg', theme === 'light' ? '#ffffff' : modeColors.cardBg);
    rootStyle.setProperty('--pop-radius', borderRadiusVal);

    if (theme === 'light') {
      rootStyle.setProperty('--pop-text', '#0f172a');
      rootStyle.setProperty('--pop-text-secondary', '#64748b');
      rootStyle.setProperty('--pop-border', '#e2e8f0');
      rootStyle.setProperty('--pop-input-bg', '#ffffff');
      rootStyle.setProperty('--pop-input-border', '#cbd5e1');
      rootStyle.setProperty('--pop-input-text', '#0f172a');
      rootStyle.setProperty('--pop-table-row-hover', 'rgba(0, 0, 0, 0.02)');
      rootStyle.setProperty('--pop-tab-nav-bg', 'rgba(0, 0, 0, 0.03)');
      rootStyle.setProperty('--pop-tab-btn-hover-bg', 'rgba(0, 0, 0, 0.02)');
      rootStyle.setProperty('--pop-tab-btn-active-bg', '#ffffff');
      rootStyle.setProperty('--pop-tab-btn-active-shadow', '0 2px 6px rgba(0, 0, 0, 0.05)');
      rootStyle.setProperty('--pop-map-real-color', '#b91c1c');
      rootStyle.setProperty('--pop-map-real-bg', 'rgba(185, 28, 28, 0.05)');
      rootStyle.setProperty('--pop-map-fake-color', '#15803d');
      rootStyle.setProperty('--pop-map-fake-bg', 'rgba(21, 128, 61, 0.05)');
      rootStyle.setProperty('--pop-scrollbar-thumb', 'rgba(0, 0, 0, 0.15)');
      rootStyle.setProperty('--pop-card-shadow', '0 4px 12px rgba(0, 0, 0, 0.03)');
      rootStyle.setProperty('--pop-stats-success-bg', 'rgba(40, 199, 111, 0.05)');
      rootStyle.setProperty('--pop-stats-success-border', 'rgba(40, 199, 111, 0.2)');
      rootStyle.setProperty('--pop-stats-error-bg', 'rgba(220, 53, 69, 0.05)');
      rootStyle.setProperty('--pop-stats-error-border', 'rgba(220, 53, 69, 0.2)');
    } else {
      rootStyle.setProperty('--pop-text', '#e2e8f0');
      rootStyle.setProperty('--pop-text-secondary', '#94a3b8');
      rootStyle.setProperty('--pop-border', 'rgba(255, 255, 255, 0.08)');
      rootStyle.setProperty('--pop-input-bg', 'rgba(0, 0, 0, 0.2)');
      rootStyle.setProperty('--pop-input-border', 'rgba(255, 255, 255, 0.12)');
      rootStyle.setProperty('--pop-input-text', '#ffffff');
      rootStyle.setProperty('--pop-table-row-hover', 'rgba(255, 255, 255, 0.03)');
      rootStyle.setProperty('--pop-tab-nav-bg', 'rgba(255, 255, 255, 0.03)');
      rootStyle.setProperty('--pop-tab-btn-hover-bg', 'rgba(255, 255, 255, 0.02)');
      rootStyle.setProperty('--pop-tab-btn-active-bg', 'rgba(255, 255, 255, 0.07)');
      rootStyle.setProperty('--pop-tab-btn-active-shadow', 'inset 0 1px 0 rgba(255, 255, 255, 0.1)');
      rootStyle.setProperty('--pop-map-real-color', '#ff8a8a');
      rootStyle.setProperty('--pop-map-real-bg', 'rgba(255, 138, 138, 0.05)');
      rootStyle.setProperty('--pop-map-fake-color', '#8aff8a');
      rootStyle.setProperty('--pop-map-fake-bg', 'rgba(138, 255, 138, 0.05)');
      rootStyle.setProperty('--pop-scrollbar-thumb', 'rgba(255, 255, 255, 0.1)');
      rootStyle.setProperty('--pop-card-shadow', 'none');
      rootStyle.setProperty('--pop-stats-success-bg', 'rgba(40, 199, 111, 0.08)');
      rootStyle.setProperty('--pop-stats-success-border', 'rgba(40, 199, 111, 0.3)');
      rootStyle.setProperty('--pop-stats-error-bg', 'rgba(212, 13, 13, 0.08)');
      rootStyle.setProperty('--pop-stats-error-border', 'rgba(212, 13, 13, 0.3)');
    }

    const radiusPx = parseInt(borderRadiusVal) || 0;
    const smallRadius = radiusPx > 4 ? `${radiusPx - 2}px` : `${radiusPx}px`;
    rootStyle.setProperty('--pop-radius-small', smallRadius);

    const scale = fontSizeVal / 14;
    rootStyle.setProperty('--pop-font-scale', scale);

    updateStatusText(document.getElementById('extension-toggle').checked);
  }

  function loadArizonaSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([ARIZONA_STORAGE_KEY], (result) => {
        const settings = { ...defaultArizonaSettings, ...result[ARIZONA_STORAGE_KEY] };
        Object.keys(arizonaMappings).forEach(elId => {
          const el = document.getElementById(elId);
          if (el) {
            const val = getArizonaElementValue(arizonaMappings[elId], settings);
            if (val !== undefined) {
              if (el.type === 'checkbox') {
                el.checked = !!val;
              } else {
                el.value = val;
                if (el.type === 'range' || el.type === 'color' || el.type === 'text') {
                  const valEl = document.getElementById(elId + '-val');
                  if (valEl) {
                    valEl.textContent = val + (elId.includes('Delay') ? ' мс' : elId.includes('Width') ? ' px' : '');
                  }
                }
              }
            }
          }
        });
        applyThemeToPopup(settings);
      });
    }
  }

  function saveArizonaSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([ARIZONA_STORAGE_KEY], (result) => {
        const current = { ...defaultArizonaSettings, ...result[ARIZONA_STORAGE_KEY] };
        Object.keys(arizonaMappings).forEach(elId => {
          const el = document.getElementById(elId);
          if (el) {
            let val;
            if (el.type === 'checkbox') {
              val = el.checked;
            } else if (el.type === 'range') {
              val = parseInt(el.value);
              const valEl = document.getElementById(elId + '-val');
              if (valEl) {
                valEl.textContent = val + (elId.includes('Delay') ? ' мс' : elId.includes('Width') ? ' px' : '');
              }
            } else if (elId === 'visual-theme-fontsize') {
              val = parseInt(el.value);
            } else {
              val = el.value;
            }
            setArizonaElementValue(arizonaMappings[elId], val, current);
          }
        });
        chrome.storage.local.set({ [ARIZONA_STORAGE_KEY]: current }, () => {
          applyThemeToPopup(current);
        });
      });
    }
  }

  Object.keys(arizonaMappings).forEach(elId => {
    const el = document.getElementById(elId);
    if (el) {
      el.addEventListener('change', saveArizonaSettings);
      if (el.type === 'range') {
        el.addEventListener('input', () => {
          const val = el.value;
          const valEl = document.getElementById(elId + '-val');
          if (valEl) {
            valEl.textContent = val + (elId.includes('Delay') ? ' мс' : elId.includes('Width') ? ' px' : '');
          }
        });
      }
    }
  });

  const manualIpInput = document.getElementById('manual-ip-input');
  const manualIpBtn = document.getElementById('manual-ip-btn');
  const manualIpResults = document.getElementById('manual-ip-results');

  if (manualIpBtn && manualIpInput && manualIpResults) {
    manualIpBtn.addEventListener('click', () => {
      const ip = manualIpInput.value.trim();
      if (!ip) {
        alert('Введите IP адрес!');
        return;
      }

      manualIpResults.style.display = 'block';
      manualIpResults.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Получение информации...';

      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'fetch_ip_geo_single', ip: ip }, (response) => {
          if (chrome.runtime.lastError) {
            manualIpResults.innerHTML = `<span style="color: var(--pop-accent2)">Ошибка: ${chrome.runtime.lastError.message}</span>`;
            return;
          }
          if (response && response.success && response.data) {
            const data = response.data;
            if (data.status === 'fail') {
              manualIpResults.innerHTML = `<span style="color: var(--pop-accent2)">Ошибка: не удалось получить информацию для этого IP.</span>`;
            } else {
              let html = `<div style="display: flex; flex-direction: column; gap: 4px;">`;
              html += `<div><strong>IP:</strong> ${data.query || ip}</div>`;
              if (data.country) html += `<div><strong>Страна:</strong> ${data.country}</div>`;
              if (data.regionName) html += `<div><strong>Регион:</strong> ${data.regionName}</div>`;
              if (data.city) html += `<div><strong>Город:</strong> ${data.city}</div>`;
              if (data.isp) html += `<div><strong>Провайдер:</strong> ${data.isp}</div>`;
              if (data.org) html += `<div><strong>Организация:</strong> ${data.org}</div>`;
              if (data.as) html += `<div><strong>AS:</strong> ${data.as}</div>`;

              const badges = [];
              if (data.mobile) badges.push('<span style="background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; margin-right: 4px;">MOBILE</span>');
              if (data.proxy) badges.push('<span style="background: #ea580c; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; margin-right: 4px;">PROXY/VPN</span>');
              if (data.hosting) badges.push('<span style="background: #bd93f9; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold; margin-right: 4px;">HOSTING</span>');

              if (badges.length > 0) {
                html += `<div style="margin-top: 6px;">${badges.join('')}</div>`;
              }
              html += `</div>`;
              manualIpResults.innerHTML = html;
            }
          } else {
            manualIpResults.innerHTML = `<span style="color: var(--pop-accent2)">Ошибка: ${response?.error || 'неизвестная ошибка'}</span>`;
          }
        });
      } else {
        manualIpResults.innerHTML = `<span style="color: var(--pop-accent2)">Ошибка: Chrome Extension API недоступно</span>`;
      }
    });
  }

  loadSettings();
  loadArizonaSettings();
});