export function create(context) {
  const { openOverlay, closeOverlay, setupDateShortcuts, fetchWithRetry, logOptions } = context;

    let settings = {};
    let calculated = false;
    let autoTimer = null;

    const PUNISHMENT_TYPES = [
      'cmd_unadeldesc', 'cmd_adeldesc', 'bail', 'undriveban', 'driveban',
      'ungunban', 'gunban', 'remove_autoads', 'rmute', 'unrmute',
      'apunish', 'skick', 'weap', 'ban', 'banip', 'banipoff',
      'jail', 'kpz', 'mute', 'unban', 'unbanip', 'unjail',
      'unmute', 'unwarn', 'warn'
    ];

    const modalHTML = `
      <div id="arz-punish-overlay" class="alh-modal-overlay">
        <div class="arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-gavel"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробив наказаний</div>
              <div class="arz-modal-subtitle">Анализ истории наказаний</div>
            </div>
            <button data-action="cancel" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-modal-body">
            <div class="arz-modal-form-group">
              <div class="alh-layout-43">
                <label class="alh-layout-4 arz-modal-label"><i class="fa-solid fa-users"></i> Ник(и) игрока(ов)</label>
                <span class="alh-layout-68">Введено: <strong id="arz-punish-count-num" class="alh-layout-7">0</strong></span>
              </div>
              <textarea id="arz-punish-nicks" class="arz-textarea" rows="3" placeholder="Введите один или несколько ников (каждый с новой строки или через запятую)"></textarea>
            </div>
            <div class="alh-layout-10">
              <div class="alh-layout-11 arz-modal-form-group">
                <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата от</label>
                <input type="date" id="arz-punish-date-from" class="arz-input">
              </div>
              <div class="alh-layout-11 arz-modal-form-group">
                <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата до</label>
                <input type="date" id="arz-punish-date-to" class="arz-input">
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
          <div class="alh-modal-footer">
            <button data-action="cancel" class="alh-layout-11 arz-btn-danger">Закрыть</button>
            <button data-action="start" class="alh-layout-11 arz-btn-primary">Пробить</button>
          </div>
        </div>
      </div>
    `;

    function parsePeriodDate(str) {
      if (!str) return null;
      str = str.split(' ')[0].trim();
      let d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
      return null;
    }

    function parsePlayerPunishments(doc, player) {
      const rows = doc.querySelectorAll('table.table tbody tr');
      const punishments = [];

      rows.forEach(row => {
        const cells = row.cells;
        if (cells.length < 2) return;
        const date = (cells[0].textContent || '').trim();
        const action = (cells[1].textContent || '').trim();
        const actionText = action.replace(/\s+/g, ' ').trim();
        const ip = cells[3] ? (cells[3].textContent || '').trim() : '';
        const cleanIp = ip.replace(/\s+/g, ' ').trim();

        punishments.push({
          date,
          action: actionText,
          ip: cleanIp
        });
      });

      return {
        player,
        punishments,
        error: rows.length === 0 ? 'Наказаний не найдено' : null
      };
    }

    async function calculate() {
      const doc = document;
      const params = new URLSearchParams(window.location.search);
      const player = params.get('player') || 'Не указан';
      const res = parsePlayerPunishments(doc, player);

      if (res.punishments.length === 0) {
        window.ArizonaNotifications.show('Наказаний не найдено', 'info');
        return;
      }

      showSingleResultsModal(res);
    }

    function showSingleResultsModal(res) {
      let rowsHtml = '';
      const copyLines = [`Наказания игрока ${res.player}:`];

      res.punishments.forEach(p => {
        rowsHtml += `
          <tr class="alh-layout-75">
            <td class="alh-layout-111">${p.date}</td>
            <td class="alh-layout-112">${p.action}</td>
          </tr>
        `;
        copyLines.push(`${p.date} | ${p.action}`);
      });
      const copyText = copyLines.join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="alh-layout-113 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-gavel"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">История наказаний</div>
              <div class="alh-layout-90 arz-modal-subtitle">
                <span class="alh-layout-91">${res.player}</span>
                <span>Найдено: ${res.punishments.length}</span>
              </div>
            </div>
            <button id="arz-punish-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-layout-95 online-result-table-wrapper">
            <table class="alh-layout-80 online-result-table">
              <thead>
                <tr class="alh-layout-109">
                  <th class="alh-layout-114">Дата</th>
                  <th class="alh-layout-82">Содержимое лога</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-punish-copy-btn" class="alh-layout-37 arz-btn-primary"><i class="fa-regular fa-copy"></i> Копировать наказания</button>
            <button id="arz-punish-reopen-btn" class="alh-layout-11 arz-btn-secondary"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-punish-close-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);
      overlay.querySelector('#arz-punish-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-punish-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);
      overlay.querySelector('#arz-punish-copy-btn').onclick = () => {
        navigator.clipboard.writeText(copyText).then(() => {
          const btn = overlay.querySelector('#arz-punish-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Копировать наказания', 2000);
        });
      };
      overlay.querySelector('#arz-punish-reopen-btn').onclick = () => { closeOverlay(overlay); window.ArizonaLookupManager.openModal('punish'); };

    }

    async function processMultiplePlayers(nicks, dateFrom, dateTo) {
      let cancelBatch = false;

      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `
        <div class="alh-layout-45 arz-modal-container">
          <div class="alh-modal-header">
            <div class="alh-layout-115 arz-modal-icon-wrapper"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробив наказаний</div>
              <div class="arz-modal-subtitle">Сбор наказаний игроков...</div>
            </div>
          </div>
          <div class="alh-layout-47 alh-modal-body">
            <div id="arz-progress-player" class="alh-layout-48">Запуск...</div>
            <div id="arz-progress-status" class="alh-layout-49">Подготовка запросов</div>
            
            <div class="alh-layout-50 arz-progress-bar-container">
              <div id="alh-progress-bar-fill" class="alh-layout-51"></div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-progress-cancel-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-ban"></i> Отмена</button>
          </div>
        </div>
      `;
      openOverlay(progressOverlay);

      const playerTextEl = progressOverlay.querySelector('#arz-progress-player');
      const statusTextEl = progressOverlay.querySelector('#arz-progress-status');
      const barFillEl = progressOverlay.querySelector('#alh-progress-bar-fill');
      const cancelBtn = progressOverlay.querySelector('#arz-progress-cancel-btn');

      cancelBtn.onclick = () => {
        cancelBatch = true;
        closeOverlay(progressOverlay);
        window.ArizonaNotifications.show('Сбор данных отменен', 'warning');
      };

      const results = [];
      for (let i = 0; i < nicks.length; i++) {
        if (cancelBatch) break;
        const player = nicks[i];

        playerTextEl.textContent = player;
        statusTextEl.textContent = `Загрузка данных (${i + 1} из ${nicks.length})`;
        barFillEl.style.width = `${Math.round((i / nicks.length) * 100)}%`;

        try {
          const fetchUrl = new URL(window.location.href);
          fetchUrl.searchParams.set('player', player);

          fetchUrl.searchParams.delete('type[]');
          PUNISHMENT_TYPES.forEach(t => {
            fetchUrl.searchParams.append('type[]', t);
          });

          fetchUrl.searchParams.set('limit', '1000');
          fetchUrl.searchParams.set('sort', 'desc');
          fetchUrl.searchParams.delete('arz_online');
          fetchUrl.searchParams.delete('arz_punish');

          if (dateFrom) fetchUrl.searchParams.set('min_period', dateFrom + ' 00:00:00');
          if (dateTo) fetchUrl.searchParams.set('max_period', dateTo + ' 23:59:59');

          const response = await fetchWithRetry(fetchUrl.href, logOptions(progressOverlay));
          if (!response.ok) {
            throw new Error(`Ошибка: ${response.status}`);
          }
          const htmlText = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');

          const res = parsePlayerPunishments(doc, player);
          results.push(res);
        } catch (err) {
          if (err.name === 'AbortError') { cancelBatch = true; break; }
          console.error(`Error fetching punishments for ${player}:`, err);
          results.push({
            player,
            punishments: [],
            error: err.message || 'Ошибка загрузки'
          });
        }

      }

      if (!cancelBatch) {
        closeOverlay(progressOverlay);
        if (results.length === 1) {
          if (results[0].punishments.length === 0 && !results[0].error) {
            window.ArizonaNotifications.show('Наказаний не найдено', 'info');
          } else if (results[0].error) {
            window.ArizonaNotifications.show(results[0].error, 'error');
          } else {
            showSingleResultsModal(results[0]);
          }
        } else {
          showMultiResultsModal(results);
        }
      }
    }

    function showMultiResultsModal(results) {
      let rowsHtml = '';
      results.forEach((res, index) => {
        const hasError = !!res.error;
        const hasPunishments = res.punishments && res.punishments.length > 0;
        const countStr = hasError ? `<span class="alh-layout-72">${res.error}</span>` : `${res.punishments.length} наказ.`;

        let detailsHtml = '';
        if (hasPunishments) {
          let detailRows = '';
          res.punishments.forEach(p => {
            detailRows += `
              <div class="alh-layout-116">
                <div class="alh-layout-117">
                  <span class="alh-layout-22">${p.date}</span>
                </div>
                <div class="alh-layout-118">${p.action}</div>
              </div>
            `;
          });
          detailsHtml = `
            <tr id="arz-punish-details-row-${index}" class="alh-layout-119 arz-details-row">
              <td colspan="4" class="alh-layout-102">
                <div class="alh-layout-120">
                  ${detailRows}
                </div>
              </td>
            </tr>
          `;
        }

        rowsHtml += `
          <tr class="alh-layout-104 arz-player-row" data-index="${index}">
            <td class="alh-layout-85">
              <span class="alh-layout-105 arz-toggle-details-btn"><i class="fa-solid fa-chevron-right"></i></span>
              ${res.player}
            </td>
            <td style="padding: 12px 16px; font-weight: 700; color: ${hasError ? 'var(--az-text-secondary)' : 'var(--az-accent-hover)'}; font-size: 13px;">
              ${countStr}
            </td>
            <td class="alh-layout-107">
              <button class="alh-layout-108 arz-btn-icon arz-copy-single-punish-btn" data-index="${index}" title="Копировать наказания игрока"><i class="fa-regular fa-copy"></i></button>
            </td>
          </tr>
          ${detailsHtml}
        `;
      });

      const allPlayersSummaryLines = ['Сводка наказаний игроков:'];
      results.forEach((res) => {
        allPlayersSummaryLines.push(`\nИгрок: ${res.player}`);
        if (res.error) {
          allPlayersSummaryLines.push(`- ${res.error}`);
        } else if (res.punishments && res.punishments.length > 0) {
          res.punishments.forEach(p => {
            allPlayersSummaryLines.push(`- [${p.date}] [${p.action}]`);
          });
        } else {
          allPlayersSummaryLines.push(`- Наказаний не найдено`);
        }
      });
      const allPlayersSummaryText = allPlayersSummaryLines.join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="alh-layout-113 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-gavel"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результаты расчета</div>
              <div class="arz-modal-subtitle">Наказания игроков</div>
            </div>
            <button id="arz-punish-multi-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-layout-95 online-result-table-wrapper">
            <table class="alh-layout-80 online-result-table">
              <thead>
                <tr class="alh-layout-109">
                  <th class="alh-layout-82">Игрок</th>
                  <th class="alh-layout-82">Наказания</th>
                  <th class="alh-layout-110">Копировать</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-punish-multi-copy-btn" class="alh-layout-37 arz-btn-primary"><i class="fa-regular fa-copy"></i> Скопировать все наказания</button>
            <button id="arz-punish-multi-reopen-btn" class="alh-layout-11 arz-btn-secondary"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-punish-multi-close-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);

      overlay.querySelector('#arz-punish-multi-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-punish-multi-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);


      overlay.querySelector('#arz-punish-multi-reopen-btn').onclick = () => {
        closeOverlay(overlay);
        window.ArizonaLookupManager.openModal('punish');
      };

      overlay.querySelector('#arz-punish-multi-copy-btn').onclick = () => {
        navigator.clipboard.writeText(allPlayersSummaryText).then(() => {
          const btn = overlay.querySelector('#arz-punish-multi-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Скопировать все наказания', 2000);
        });
      };

      overlay.querySelectorAll('.arz-player-row').forEach(row => {
        row.onclick = (e) => {
          if (e.target.closest('.arz-copy-single-punish-btn')) return;

          const index = row.getAttribute('data-index');
          const detailsRow = overlay.querySelector(`#arz-punish-details-row-${index}`);
          if (detailsRow) {
            const isVisible = detailsRow.style.display !== 'none';
            detailsRow.style.display = isVisible ? 'none' : 'table-row';
            const icon = row.querySelector('.arz-toggle-details-btn i');
            if (icon) {
              icon.className = isVisible ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
            }
          }
        };
      });

      overlay.querySelectorAll('.arz-copy-single-punish-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const index = parseInt(btn.getAttribute('data-index'), 10);
          const res = results[index];
          if (!res) return;

          let textToCopy = '';
          if (res.error) {
            textToCopy = `${res.player}: ${res.error}`;
          } else {
            const singleLines = [`Наказания игрока ${res.player}:`];
            res.punishments.forEach(p => {
              singleLines.push(`- [${p.date}] [${p.action}]`);
            });
            textToCopy = singleLines.join('\n');
          }

          navigator.clipboard.writeText(textToCopy).then(() => {
            const icon = btn.querySelector('i');
            icon.className = 'fa-solid fa-check';
            btn.style.color = '#28c76f';
            setTimeout(() => {
              icon.className = 'fa-regular fa-copy';
              btn.style.color = '#9aa0a6';
            }, 2000);
          });
        };
      });
    }

    function openModal() {
      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = modalHTML;
      openOverlay(overlay);

      const params = new URLSearchParams(window.location.search);
      const urlMin = params.get('min_period');
      const urlMax = params.get('max_period');
      if (urlMin) {
        overlay.querySelector('#arz-punish-date-from').value = urlMin.split(' ')[0];
      }
      if (urlMax) {
        overlay.querySelector('#arz-punish-date-to').value = urlMax.split(' ')[0];
      }
      const urlPlayer = params.get('player');
      if (urlPlayer) {
        overlay.querySelector('#arz-punish-nicks').value = urlPlayer;
      }

      setupDateShortcuts(overlay, 'arz-punish-date-from', 'arz-punish-date-to');

      overlay.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.onclick = () => closeOverlay(overlay));
      overlay.querySelector('[data-action="start"]').onclick = () => {
        const nicksVal = overlay.querySelector('#arz-punish-nicks').value.trim();
        const nicks = nicksVal.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);

        if (nicks.length === 0) {
          window.ArizonaNotifications.show('Введите хотя бы один ник', 'error');
          return;
        }

        const dateFrom = overlay.querySelector('#arz-punish-date-from').value;
        const dateTo = overlay.querySelector('#arz-punish-date-to').value;

        closeOverlay(overlay);
        processMultiplePlayers(nicks, dateFrom, dateTo);
      };

    }

    return {
      init: function (s) {
        settings = s || {};
        if (context.automaticCalculationEnabled === false || context.currentSettings['extension-toggle'] === false || settings.tools?.punishment === false) {
          if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; calculated = false; }
          return;
        }
        if (settings.tools?.online !== false && settings.tools?.punishment !== false) {
          this.checkAutoCalculation();
        }
      },
      updateSettings: function (s) {
        settings = s || {};
        if (context.automaticCalculationEnabled === false || context.currentSettings['extension-toggle'] === false || settings.tools?.punishment === false) {
          if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; calculated = false; }
          return;
        }
        if (settings.tools?.online !== false && settings.tools?.punishment !== false) {
          this.checkAutoCalculation();
        }
      },
      injectButton: function () {
        if (document.getElementById('arz-punish-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-punish-btn';
        btn.className = 'btn btn-warning';
        btn.style.cssText = 'margin-left: 10px; color: white !important;';
        btn.innerHTML = `<i style="margin-right: 6px;" class="fa-solid fa-gavel"></i> Наказания`;
        btn.onclick = openModal;
        container.appendChild(btn);
      },
      checkAutoCalculation: function () {
        if (context.automaticCalculationEnabled === false) return;
        const params = new URLSearchParams(window.location.search);
        if (context.currentSettings['extension-toggle'] !== false && settings.tools?.punishment !== false && params.get('arz_punish') === '1' && !calculated) {
          calculated = true;
          autoTimer = setTimeout(() => {
            autoTimer = null;
            if (context.currentSettings['extension-toggle'] !== false && settings.tools?.punishment !== false) calculate();
            else calculated = false;
          }, 1000);
        }
      },
      processMultiplePlayers: processMultiplePlayers
    };
}
