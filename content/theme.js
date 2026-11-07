(function () {
  window.ArizonaThemeManager = (function () {
    let settings = {};
    let lastSignature;

    const defaultCustomTheme = {
      dark: {
        accent: '#d40d0d',
        accentHover: '#ff4d4d',
        bg: '#0c0e12',
        bgSidebar: '#13171e',
        bgNav: '#13171e',
        cardBg: '#1c212a',
        tableBg: '#181c24',
        text: '#e2e8f0',
        textSecondary: '#94a3b8',
        border: '#334155'
      },
      light: {
        accent: '#d40d0d',
        accentHover: '#b91c1c',
        bg: '#f8fafc',
        bgSidebar: '#ffffff',
        bgNav: '#ffffff',
        cardBg: '#ffffff',
        tableBg: '#ffffff',
        text: '#0f172a',
        textSecondary: '#64748b',
        border: '#e2e8f0'
      }
    };

    function isHexColor(value) {
      return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    }

    function hexToRgb(value, fallback) {
      if (!isHexColor(value)) return fallback;
      return value.slice(1).match(/.{2}/g).map(part => parseInt(part, 16)).join(', ');
    }

    function getCustomPalette(theme) {
      const fallback = defaultCustomTheme[theme] || defaultCustomTheme.dark;
      const saved = settings.customTheme && settings.customTheme[theme];
      const palette = { ...fallback, ...(saved || {}) };
      Object.keys(fallback).forEach((key) => {
        if (!isHexColor(palette[key])) palette[key] = fallback[key];
      });
      return palette;
    }

    const colorSchemes = {
      red: {
        accent: '#d40d0d',
        accentRgb: '212, 13, 13',
        accentHover: '#ff4d4d',
        dark: {
          bg: '#0c0e12',
          bgSidebar: '#13171e',
          bgNav: '#13171e',
          cardBg: '#1c212a',
          tableBg: '#181c24',
          tableRowHover: 'rgba(255, 255, 255, 0.02)'
        },
        light: {
          bg: '#f8fafc',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#f1f5f9'
        }
      },
      ocean: {
        accent: '#0284c7',
        accentRgb: '2, 132, 199',
        accentHover: '#38bdf8',
        dark: {
          bg: '#0b0f19',
          bgSidebar: '#111827',
          bgNav: '#111827',
          cardBg: '#1f2937',
          tableBg: '#1f2937',
          tableRowHover: 'rgba(255, 255, 255, 0.03)'
        },
        light: {
          bg: '#f0f9ff',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#e0f2fe'
        }
      },
      emerald: {
        accent: '#059669',
        accentRgb: '5, 150, 105',
        accentHover: '#34d399',
        dark: {
          bg: '#06120e',
          bgSidebar: '#0d221b',
          bgNav: '#0d221b',
          cardBg: '#112e24',
          tableBg: '#112e24',
          tableRowHover: 'rgba(255, 255, 255, 0.03)'
        },
        light: {
          bg: '#f0fdf4',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#dcfce7'
        }
      },
      gold: {
        accent: '#d97706',
        accentRgb: '217, 119, 6',
        accentHover: '#fbbf24',
        dark: {
          bg: '#120d06',
          bgSidebar: '#22180d',
          bgNav: '#22180d',
          cardBg: '#2e2012',
          tableBg: '#2e2012',
          tableRowHover: 'rgba(255, 255, 255, 0.03)'
        },
        light: {
          bg: '#fffbeb',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#fef3c7'
        }
      },
      frost: {
        accent: '#475569',
        accentRgb: '71, 85, 105',
        accentHover: '#94a3b8',
        dark: {
          bg: '#0f172a',
          bgSidebar: '#1e293b',
          bgNav: '#1e293b',
          cardBg: '#334155',
          tableBg: '#1e293b',
          tableRowHover: 'rgba(255, 255, 255, 0.03)'
        },
        light: {
          bg: '#f1f5f9',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#e2e8f0'
        }
      },
      dracula: {
        accent: '#bd93f9',
        accentRgb: '189, 147, 249',
        accentHover: '#ff79c6',
        dark: {
          bg: '#282a36',
          bgSidebar: '#1e1f29',
          bgNav: '#1e1f29',
          cardBg: '#44475a',
          tableBg: '#282a36',
          tableRowHover: 'rgba(255, 255, 255, 0.04)'
        },
        light: {
          bg: '#f3f0f9',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#e8e3f5'
        }
      },
      sunset: {
        accent: '#ea580c',
        accentRgb: '234, 88, 12',
        accentHover: '#f43f5e',
        dark: {
          bg: '#1c0d02',
          bgSidebar: '#2e1403',
          bgNav: '#2e1403',
          cardBg: '#471b05',
          tableBg: '#2e1403',
          tableRowHover: 'rgba(255, 255, 255, 0.03)'
        },
        light: {
          bg: '#fff7ed',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#ffedd5'
        }
      },
      cyberpunk: {
        accent: '#ff007f',
        accentRgb: '255, 0, 127',
        accentHover: '#00f0ff',
        dark: {
          bg: '#0a0a0f',
          bgSidebar: '#11111a',
          bgNav: '#11111a',
          cardBg: '#181826',
          tableBg: '#141420',
          tableRowHover: 'rgba(0, 240, 255, 0.05)'
        },
        light: {
          bg: '#faf9fb',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#fff0f5'
        }
      },
      nord: {
        accent: '#88c0d0',
        accentRgb: '136, 192, 208',
        accentHover: '#8fbcbb',
        dark: {
          bg: '#2e3440',
          bgSidebar: '#242933',
          bgNav: '#242933',
          cardBg: '#3b4252',
          tableBg: '#343b49',
          tableRowHover: 'rgba(255, 255, 255, 0.03)'
        },
        light: {
          bg: '#eceff4',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#e5e9f0'
        }
      },
      matrix: {
        accent: '#00ff41',
        accentRgb: '0, 255, 65',
        accentHover: '#39ff14',
        dark: {
          bg: '#030704',
          bgSidebar: '#09140c',
          bgNav: '#09140c',
          cardBg: '#0e2213',
          tableBg: '#0b1a0f',
          tableRowHover: 'rgba(0, 255, 65, 0.05)'
        },
        light: {
          bg: '#f0fff4',
          bgSidebar: '#ffffff',
          bgNav: '#ffffff',
          cardBg: '#ffffff',
          tableBg: '#ffffff',
          tableRowHover: '#e6ffe9'
        }
      }
    };

    Object.assign(colorSchemes, {
      arizonaBlue: { ...colorSchemes.red, accent: '#2563eb', accentRgb: '37, 99, 235', accentHover: '#60a5fa' },
      arizonaGreen: { ...colorSchemes.red, accent: '#16a34a', accentRgb: '22, 163, 74', accentHover: '#4ade80' },
      arizonaPurple: { ...colorSchemes.red, accent: '#9333ea', accentRgb: '147, 51, 234', accentHover: '#c084fc' },
      arizonaOrange: { ...colorSchemes.red, accent: '#ea580c', accentRgb: '234, 88, 12', accentHover: '#fb923c' },
      arizonaPink: { ...colorSchemes.red, accent: '#db2777', accentRgb: '219, 39, 119', accentHover: '#f472b6' },
      arizonaGold: { ...colorSchemes.red, accent: '#d97706', accentRgb: '217, 119, 6', accentHover: '#fbbf24' },
      arizonaCyan: { ...colorSchemes.red, accent: '#0891b2', accentRgb: '8, 145, 178', accentHover: '#22d3ee' }
    });

    Object.assign(colorSchemes, {
      midnightSapphire: { accent: '#4577b4', accentRgb: '69, 119, 180', accentHover: '#739ac5', dark: { bg: '#090f20', bgSidebar: '#141e36', bgNav: '#141e36', cardBg: '#1c2b49', tableBg: '#141e36', tableRowHover: 'rgba(69, 119, 180, 0.08)' } },
      royalAmethyst: { accent: '#8a5fb5', accentRgb: '138, 95, 181', accentHover: '#ac8ec6', dark: { bg: '#130d20', bgSidebar: '#20162e', bgNav: '#20162e', cardBg: '#30203f', tableBg: '#20162e', tableRowHover: 'rgba(138, 95, 181, 0.08)' } },
      enchantedForest: { accent: '#35a05c', accentRgb: '53, 160, 92', accentHover: '#69ba86', dark: { bg: '#091810', bgSidebar: '#10251a', bgNav: '#10251a', cardBg: '#1b3527', tableBg: '#10251a', tableRowHover: 'rgba(53, 160, 92, 0.08)' } },
      emberForge: { accent: '#b5692b', accentRgb: '181, 105, 43', accentHover: '#c5915a', dark: { bg: '#1b100c', bgSidebar: '#2b1a13', bgNav: '#2b1a13', cardBg: '#3b261c', tableBg: '#2b1a13', tableRowHover: 'rgba(181, 105, 43, 0.08)' } },
      roseVelvet: { accent: '#b55160', accentRgb: '181, 81, 96', accentHover: '#c58088', dark: { bg: '#1e0d15', bgSidebar: '#301620', bgNav: '#301620', cardBg: '#45212e', tableBg: '#301620', tableRowHover: 'rgba(181, 81, 96, 0.08)' } },
      arcticNight: { accent: '#4aa7b3', accentRgb: '74, 167, 179', accentHover: '#81bec5', dark: { bg: '#0b1820', bgSidebar: '#142630', bgNav: '#142630', cardBg: '#1d3742', tableBg: '#142630', tableRowHover: 'rgba(74, 167, 179, 0.08)' } },
      goldenNoir: { accent: '#b58a1a', accentRgb: '181, 138, 26', accentHover: '#c5b36c', dark: { bg: '#19150c', bgSidebar: '#292213', bgNav: '#292213', cardBg: '#3a311c', tableBg: '#292213', tableRowHover: 'rgba(181, 138, 26, 0.08)' } },
      moonstone: { accent: '#7782b5', accentRgb: '119, 130, 181', accentHover: '#9ba4c6', dark: { bg: '#111321', bgSidebar: '#1d2033', bgNav: '#1d2033', cardBg: '#2a2e45', tableBg: '#1d2033', tableRowHover: 'rgba(119, 130, 181, 0.08)' } },
      deepTeal: { accent: '#20998a', accentRgb: '32, 153, 138', accentHover: '#49b7a5', dark: { bg: '#071817', bgSidebar: '#102825', bgNav: '#102825', cardBg: '#193a35', tableBg: '#102825', tableRowHover: 'rgba(32, 153, 138, 0.08)' } },
      cherryBlossom: { accent: '#b05283', accentRgb: '176, 82, 131', accentHover: '#c283a5', dark: { bg: '#1b0e1a', bgSidebar: '#2b1929', bgNav: '#2b1929', cardBg: '#3e253a', tableBg: '#2b1929', tableRowHover: 'rgba(176, 82, 131, 0.08)' } },
      solarFlare: { accent: '#b4930f', accentRgb: '180, 147, 15', accentHover: '#c5af37', dark: { bg: '#1a1708', bgSidebar: '#2a2510', bgNav: '#2a2510', cardBg: '#3c3518', tableBg: '#2a2510', tableRowHover: 'rgba(180, 147, 15, 0.08)' } },
      lavenderHaze: { accent: '#7864b4', accentRgb: '120, 100, 180', accentHover: '#998dc5', dark: { bg: '#171321', bgSidebar: '#252035', bgNav: '#252035', cardBg: '#352d49', tableBg: '#252035', tableRowHover: 'rgba(120, 100, 180, 0.08)' } },
      copperDust: { accent: '#a86c58', accentRgb: '168, 108, 88', accentHover: '#c79783', dark: { bg: '#1b1210', bgSidebar: '#2b1c18', bgNav: '#2b1c18', cardBg: '#3e2a23', tableBg: '#2b1c18', tableRowHover: 'rgba(168, 108, 88, 0.08)' } },
      abyssalBlue: { accent: '#2888b3', accentRgb: '40, 136, 179', accentHover: '#62a5c5', dark: { bg: '#06141e', bgSidebar: '#0c2230', bgNav: '#0c2230', cardBg: '#143344', tableBg: '#0c2230', tableRowHover: 'rgba(40, 136, 179, 0.08)' } },
      mossAndStone: { accent: '#758f4e', accentRgb: '117, 143, 78', accentHover: '#99af76', dark: { bg: '#14190f', bgSidebar: '#21291b', bgNav: '#21291b', cardBg: '#303b28', tableBg: '#21291b', tableRowHover: 'rgba(117, 143, 78, 0.08)' } },
      crimsonNight: { accent: '#b35151', accentRgb: '179, 81, 81', accentHover: '#c58181', dark: { bg: '#1d0c0e', bgSidebar: '#301719', bgNav: '#301719', cardBg: '#452125', tableBg: '#301719', tableRowHover: 'rgba(179, 81, 81, 0.08)' } },
      violetGalaxy: { accent: '#a757b3', accentRgb: '167, 87, 179', accentHover: '#bb85c5', dark: { bg: '#190d20', bgSidebar: '#2a1732', bgNav: '#2a1732', cardBg: '#40214a', tableBg: '#2a1732', tableRowHover: 'rgba(167, 87, 179, 0.08)' } },
      stormCloud: { accent: '#6b7584', accentRgb: '107, 117, 132', accentHover: '#9ea6b0', dark: { bg: '#11151a', bgSidebar: '#1b222a', bgNav: '#1b222a', cardBg: '#29333e', tableBg: '#1b222a', tableRowHover: 'rgba(107, 117, 132, 0.08)' } },
      mintChocolate: { accent: '#4fa684', accentRgb: '79, 166, 132', accentHover: '#82bea2', dark: { bg: '#181510', bgSidebar: '#28231b', bgNav: '#28231b', cardBg: '#3a3227', tableBg: '#28231b', tableRowHover: 'rgba(79, 166, 132, 0.08)' } },
      oceanCoral: { accent: '#b56456', accentRgb: '181, 100, 86', accentHover: '#c78c80', dark: { bg: '#0b1a20', bgSidebar: '#132a32', bgNav: '#132a32', cardBg: '#1d3c45', tableBg: '#132a32', tableRowHover: 'rgba(181, 100, 86, 0.08)' } },
      electricIndigo: { accent: '#5d65b3', accentRgb: '93, 101, 179', accentHover: '#818cc5', dark: { bg: '#0d0e21', bgSidebar: '#191a37', bgNav: '#191a37', cardBg: '#252750', tableBg: '#191a37', tableRowHover: 'rgba(93, 101, 179, 0.08)' } }
    });

    return {
      init: function (settingsData) {
        settings = settingsData || {};
        this.apply();
      },
      updateSettings: function (settingsData) {
        settings = settingsData || {};
        this.apply();
      },
      apply: function () {
        const signature = JSON.stringify(settings);
        if (signature === lastSignature) return;
        lastSignature = signature;
        if (settings.themeEnabled === false) {
          document.body.classList.remove('az-light-theme', 'az-custom-bg-image-active');
          document.body.classList.forEach(cls => {
            if (cls.startsWith('az-theme-')) {
              document.body.classList.remove(cls);
            }
          });
          [
            '--az-font-size', '--az-border-radius', '--az-border-radius-small',
            '--az-accent', '--az-accent-rgb', '--az-accent-hover', '--az-bg',
            '--az-custom-bg-image', '--az-custom-bg-blur', '--az-bg-sidebar',
            '--az-bg-nav', '--az-card-bg', '--az-log-card-bg', '--az-log-table-bg',
            '--az-log-card-border', '--az-log-card-body-border', '--az-table-bg',
            '--az-table-row-hover', '--az-text', '--az-text-secondary', '--az-border',
            '--az-input-bg', '--az-input-border', '--az-input-text',
            '--az-btn-close-filter'
          ].forEach(name => document.documentElement.style.removeProperty(name));
          return;
        }

        const theme = settings.theme || 'dark';
        const colorSchemeName = settings.colorScheme || 'red';
        const borderRadiusVal = settings.borderRadius || '8px';
        const fontSizeVal = settings.fontSize || 14;

        if (theme === 'light') {
          document.body.classList.add('az-light-theme');
        } else {
          document.body.classList.remove('az-light-theme');
        }

        document.body.classList.forEach(cls => {
          if (cls.startsWith('az-theme-')) {
            document.body.classList.remove(cls);
          }
        });
        document.body.classList.add(`az-theme-${settings.customThemeEnabled === true ? 'custom' : colorSchemeName}`);

        document.documentElement.style.setProperty('--az-font-size', `${fontSizeVal}px`);
        document.documentElement.style.setProperty('--az-border-radius', borderRadiusVal);
        const radiusPx = parseInt(borderRadiusVal) || 0;
        const smallRadius = radiusPx > 4 ? `${radiusPx - 2}px` : `${radiusPx}px`;
        document.documentElement.style.setProperty('--az-border-radius-small', smallRadius);

        const scheme = colorSchemes[colorSchemeName] || colorSchemes.red;
        const modeColors = scheme[theme] || scheme.dark;
        const customPalette = settings.customThemeEnabled === true ? getCustomPalette(theme) : null;
        const activeColors = customPalette ? { ...modeColors, ...customPalette } : modeColors;
        const customBackground = settings.customThemeEnabled === true
          ? (isHexColor(activeColors.bg) ? activeColors.bg : modeColors.bg)
          : (isHexColor(settings.backgroundColor || '') ? settings.backgroundColor : modeColors.bg);
        const cardOpacity = Math.min(100, Math.max(10, Number(settings.cardOpacity ?? 100))) / 100;
        const backgroundImage = typeof settings.backgroundImage === 'string' && settings.backgroundImage.startsWith('data:image/')
          ? settings.backgroundImage : 'none';
        const backgroundImageUrl = typeof settings.backgroundImageUrl === 'string' && /^https?:\/\//i.test(settings.backgroundImageUrl)
          ? settings.backgroundImageUrl : 'none';
        const backgroundSource = backgroundImageUrl !== 'none' ? backgroundImageUrl : backgroundImage;
        const backgroundImageBlur = Math.min(30, Math.max(0, Number(settings.backgroundImageBlur ?? 0)));
        document.body.classList.toggle('az-custom-bg-image-active', backgroundSource !== 'none');

        const accent = isHexColor(activeColors.accent) ? activeColors.accent : scheme.accent;
        const accentHover = isHexColor(activeColors.accentHover) ? activeColors.accentHover : scheme.accentHover;
        document.documentElement.style.setProperty('--az-accent', accent);
        document.documentElement.style.setProperty('--az-accent-rgb', hexToRgb(accent, scheme.accentRgb));
        document.documentElement.style.setProperty('--az-accent-hover', accentHover);

        document.documentElement.style.setProperty('--az-bg', customBackground);
        const safeBackgroundSource = backgroundSource.replace(/[\\"\r\n]/g, (character) => `\\${character}`);
        document.documentElement.style.setProperty('--az-custom-bg-image', `url("${safeBackgroundSource}")`);
        document.documentElement.style.setProperty('--az-custom-bg-blur', `${backgroundImageBlur}px`);
        document.documentElement.style.setProperty('--az-bg-sidebar', activeColors.bgSidebar);
        document.documentElement.style.setProperty('--az-bg-nav', activeColors.bgNav || activeColors.bgSidebar);
        const cardMatch = activeColors.cardBg.match(/^#([0-9a-f]{6})$/i);
        const cardColor = cardMatch
          ? cardMatch[1].match(/.{2}/g).map(part => parseInt(part, 16)).join(', ')
          : '28, 33, 42';
        const tableMatch = typeof activeColors.tableBg === 'string' && activeColors.tableBg.match(/^#([0-9a-f]{6})$/i);
        const tableColor = tableMatch
          ? tableMatch[1].match(/.{2}/g).map(part => parseInt(part, 16)).join(', ')
          : cardColor;
        document.documentElement.style.setProperty('--az-card-bg', activeColors.cardBg);
        document.documentElement.style.setProperty('--az-log-card-bg', `rgba(${cardColor}, ${cardOpacity})`);
        document.documentElement.style.setProperty('--az-log-table-bg', `rgba(${tableColor}, ${cardOpacity})`);
        document.documentElement.style.setProperty('--az-log-card-border', settings.cardBodyBorder === true ? '1px solid var(--az-border)' : 'none');
        document.documentElement.style.setProperty('--az-log-card-body-border', settings.cardBodyBorder === true ? '1px solid var(--az-border)' : 'none');
        document.documentElement.style.setProperty('--az-table-bg', activeColors.tableBg);
        const hoverRgb = hexToRgb(accent, theme === 'light' ? '212, 13, 13' : '212, 13, 13');
        document.documentElement.style.setProperty('--az-table-row-hover', customPalette
          ? `rgba(${hoverRgb}, ${theme === 'light' ? '0.08' : '0.12'})`
          : modeColors.tableRowHover);

        if (customPalette) {
          document.documentElement.style.setProperty('--az-text', activeColors.text);
          document.documentElement.style.setProperty('--az-text-secondary', activeColors.textSecondary);
          document.documentElement.style.setProperty('--az-border', activeColors.border);
          document.documentElement.style.setProperty('--az-input-bg', activeColors.bgSidebar);
          document.documentElement.style.setProperty('--az-input-border', activeColors.border);
          document.documentElement.style.setProperty('--az-input-text', activeColors.text);
          document.documentElement.style.setProperty('--az-btn-close-filter', theme === 'light' ? 'none' : 'invert(1) grayscale(1) brightness(2)');
        } else if (theme === 'light') {
          document.documentElement.style.setProperty('--az-text', '#0f172a');
          document.documentElement.style.setProperty('--az-text-secondary', '#64748b');
          document.documentElement.style.setProperty('--az-border', '#e2e8f0');
          document.documentElement.style.setProperty('--az-input-bg', '#ffffff');
          document.documentElement.style.setProperty('--az-input-border', '#cbd5e1');
          document.documentElement.style.setProperty('--az-input-text', '#0f172a');
          document.documentElement.style.setProperty('--az-btn-close-filter', 'none');
        } else {
          document.documentElement.style.setProperty('--az-text', '#e2e8f0');
          document.documentElement.style.setProperty('--az-text-secondary', '#94a3b8');
          document.documentElement.style.setProperty('--az-border', 'rgba(255, 255, 255, 0.08)');
          document.documentElement.style.setProperty('--az-input-bg', 'rgba(0, 0, 0, 0.2)');
          document.documentElement.style.setProperty('--az-input-border', 'rgba(255, 255, 255, 0.12)');
          document.documentElement.style.setProperty('--az-input-text', '#ffffff');
          document.documentElement.style.setProperty('--az-btn-close-filter', 'invert(1) grayscale(1) brightness(2)');
        }
      }
    };
  })();

})();
