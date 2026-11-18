export function create(context) {
  const { openOverlay, closeOverlay, fetchWithRetry, logOptions } = context;

    let settings = {};
    let calculated = false;
    let autoTimer = null;

    function parsePlayerReports(doc, player) {
      const rows = doc.querySelectorAll('table.table tbody tr');
      const reports = [];

      rows.forEach(row => {
        const cells = row.cells;
        if (cells.length < 2) return;
        const date = (cells[0].textContent || '').trim();
        const action = (cells[1].textContent || '').trim();
        const actionText = action.replace(/\s+/g, ' ').trim();

        let targetPlayer = '—';
        let question = '';
        let answer = '';

        const playerMatch = actionText.match(/ответил на репорт\s+([A-Za-z0-9_]+)/i);
        if (playerMatch) {
          targetPlayer = playerMatch[1];
        }

        const regex = /репорт [A-Za-z0-9_]+(?:\[\d+\])?:\s*(.*?)\.?\s*Ответ:\s*(.*)$/i;
        const match = actionText.match(regex);
        if (match) {
          question = match[1].trim();
          answer = match[2].trim();
        } else {
          const splitIndex = actionText.toLowerCase().lastIndexOf('ответ:');
          if (splitIndex !== -1) {
            answer = actionText.substring(splitIndex + 6).trim();
            const questionPart = actionText.substring(0, splitIndex);

            let q = questionPart.trim();
            if (q.endsWith('.')) {
              q = q.slice(0, -1).trim();
            }

            const colonIndex = q.indexOf(':');
            if (colonIndex !== -1) {
              question = q.substring(colonIndex + 1).trim();
            } else {
              question = q;
            }
          } else {
            question = actionText;
            answer = '—';
          }
        }

        reports.push({
          date,
          player: targetPlayer,
          question,
          answer,
          actionText
        });
      });

      return {
        player,
        reports,
        error: rows.length === 0 ? 'Репортов не найдено' : null
      };
    }

    async function calculate() {
      const doc = document;
      const params = new URLSearchParams(window.location.search);
      const player = params.get('player') || 'Не указан';
      const res = parsePlayerReports(doc, player);

      if (res.reports.length === 0) {
        window.ArizonaNotifications.show('Репортов не найдено', 'info');
        return;
      }

      showSingleResultsModal(res);
    }

    function showSingleResultsModal(res) {
      let rowsHtml = '';
      const copyLines = [`Репорты администратора ${res.player}:`];

      res.reports.forEach(r => {
        rowsHtml += `
          <tr class="alh-layout-75">
            <td class="alh-layout-121">${r.date}</td>
            <td class="alh-layout-122 arz-col-player">${r.player}</td>
            <td class="alh-layout-123 arz-col-question">${r.question}</td>
            <td class="alh-layout-124 arz-col-answer">${r.answer}</td>
          </tr>
        `;
        copyLines.push(`[${r.date}] Игрок: ${r.player} | Вопрос: ${r.question} | Ответ: ${r.answer}`);
      });
      const copyText = copyLines.join('\n');

      const uniqueDays = new Set();
      res.reports.forEach(r => {
        const dPart = r.date.split(' ')[0];
        if (dPart) uniqueDays.add(dPart);
      });
      const totalReports = res.reports.length;
      const daysCount = uniqueDays.size || 1;
      const avgReports = (totalReports / daysCount).toFixed(1);

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="alh-layout-125 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-comments"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Статистика репортов</div>
              <div class="alh-layout-90 arz-modal-subtitle">
                <span class="alh-layout-91">${res.player}</span>
                <span>Всего ответов: ${totalReports} | Дней: ${daysCount} | Ср. в день: ${avgReports}</span>
              </div>
            </div>
            <button id="arz-report-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-layout-126">
            <input type="text" id="arz-reports-search" class="alh-layout-127 arz-input" placeholder="Поиск по игроку, вопросу или ответу...">
          </div>
          <div class="alh-layout-95 online-result-table-wrapper">
            <table class="alh-layout-80 online-result-table">
              <thead>
                <tr class="alh-layout-109">
                  <th class="alh-layout-87">Дата</th>
                  <th class="alh-layout-128">Игрок</th>
                  <th class="alh-layout-82">Вопрос</th>
                  <th class="alh-layout-82">Ответ</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-report-copy-btn" class="alh-layout-37 arz-btn-primary"><i class="fa-regular fa-copy"></i> Скопировать репорты</button>
            <button id="arz-report-reopen-btn" class="alh-layout-11 arz-btn-secondary"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-report-close-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);
      overlay.querySelector('#arz-report-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-report-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);


      const searchInput = overlay.querySelector('#arz-reports-search');
      const tableBody = overlay.querySelector('tbody');
      searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase().trim();
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach(row => {
          const playerText = row.querySelector('.arz-col-player')?.textContent.toLowerCase() || '';
          const questionText = row.querySelector('.arz-col-question')?.textContent.toLowerCase() || '';
          const answerText = row.querySelector('.arz-col-answer')?.textContent.toLowerCase() || '';
          if (playerText.includes(query) || questionText.includes(query) || answerText.includes(query)) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
          }
        });
      };

      overlay.querySelector('#arz-report-copy-btn').onclick = () => {
        navigator.clipboard.writeText(copyText).then(() => {
          const btn = overlay.querySelector('#arz-report-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Скопировать репорты', 2000);
        });
      };

      overlay.querySelector('#arz-report-reopen-btn').onclick = () => {
        closeOverlay(overlay);
        window.ArizonaLookupManager.openModal('report');
      };
    }

    async function processMultiplePlayers(nicks, dateFrom, dateTo) {
      let cancelBatch = false;

      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `
        <div class="alh-layout-45 arz-modal-container">
          <div class="alh-modal-header">
            <div class="alh-layout-129 arz-modal-icon-wrapper"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробив репортов</div>
              <div class="arz-modal-subtitle">Сбор репортов...</div>
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
          fetchUrl.searchParams.append('type[]', 'report_answer');

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

          const res = parsePlayerReports(doc, player);
          results.push(res);
        } catch (err) {
          if (err.name === 'AbortError') { cancelBatch = true; break; }
          console.error(`Error fetching reports for ${player}:`, err);
          results.push({
            player,
            reports: [],
            error: err.message || 'Ошибка загрузки'
          });
        }

      }

      if (!cancelBatch) {
        closeOverlay(progressOverlay);
        if (results.length === 1) {
          if (results[0].reports.length === 0 && !results[0].error) {
            window.ArizonaNotifications.show('Репортов не найдено', 'info');
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
        const hasReports = res.reports && res.reports.length > 0;
        const countStr = hasError ? `<span class="alh-layout-72">${res.error}</span>` : `${res.reports.length} реп.`;

        let detailsHtml = '';
        if (hasReports) {
          let detailRows = '';
          res.reports.forEach(r => {
            detailRows += `
              <div class="alh-layout-130">
                <div class="alh-layout-117">
                  <span class="alh-layout-22">${r.date}</span>
                  <span class="alh-layout-131">Игрок: ${r.player}</span>
                </div>
                <div class="alh-layout-132"><span class="alh-layout-22">Вопрос:</span> ${r.question}</div>
                <div class="alh-layout-118"><span class="alh-layout-22">Ответ:</span> ${r.answer}</div>
              </div>
            `;
          });
          detailsHtml = `
            <tr id="arz-report-details-row-${index}" class="alh-layout-119 arz-details-row">
              <td colspan="3" class="alh-layout-102">
                <div class="alh-layout-133">
                  ${detailRows}
                </div>
              </td>
            </tr>
          `;
        }

        rowsHtml += `
          <tr class="alh-layout-104 arz-player-row" data-index="${index}" data-player="${res.player}">
            <td class="alh-layout-85">
              <span class="alh-layout-105 arz-toggle-details-btn"><i class="fa-solid fa-chevron-right"></i></span>
              ${res.player}
            </td>
            <td style="padding: 12px 16px; font-weight: 700; color: ${hasError ? 'var(--az-text-secondary)' : 'var(--az-accent-hover)'}; font-size: 13px;">
              ${countStr}
            </td>
            <td class="alh-layout-107">
              <button class="alh-layout-108 arz-btn-icon arz-copy-single-report-btn" data-index="${index}" title="Копировать репорты игрока"><i class="fa-regular fa-copy"></i></button>
            </td>
          </tr>
          ${detailsHtml}
        `;
      });

      const allPlayersSummaryLines = ['Сводка репортов администраторов:'];
      results.forEach((res) => {
        allPlayersSummaryLines.push(`\nАдминистратор: ${res.player}`);
        if (res.error) {
          allPlayersSummaryLines.push(`- ${res.error}`);
        } else if (res.reports && res.reports.length > 0) {
          res.reports.forEach(r => {
            allPlayersSummaryLines.push(`- [${r.date}] Игрок: ${r.player} | Вопрос: ${r.question} | Ответ: ${r.answer}`);
          });
        } else {
          allPlayersSummaryLines.push(`- Репортов не найдено`);
        }
      });
      const allPlayersSummaryText = allPlayersSummaryLines.join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="alh-layout-86 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-comments"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результаты пробива репортов</div>
              <div class="arz-modal-subtitle">Статистика ответов администраторов</div>
            </div>
            <button id="arz-report-multi-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-layout-126">
            <input type="text" id="arz-reports-multi-search" class="alh-layout-127 arz-input" placeholder="Поиск по имени администратора...">
          </div>
          <div class="alh-layout-95 online-result-table-wrapper">
            <table class="alh-layout-80 online-result-table">
              <thead>
                <tr class="alh-layout-109">
                  <th class="alh-layout-82">Администратор</th>
                  <th class="alh-layout-82">Репорты</th>
                  <th class="alh-layout-110">Копировать</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-report-multi-copy-btn" class="alh-layout-37 arz-btn-primary"><i class="fa-regular fa-copy"></i> Скопировать все репорты</button>
            <button id="arz-report-multi-reopen-btn" class="alh-layout-11 arz-btn-secondary"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-report-multi-close-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);

      overlay.querySelector('#arz-report-multi-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-report-multi-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);


      const searchInput = overlay.querySelector('#arz-reports-multi-search');
      searchInput.oninput = () => {
        const query = searchInput.value.toLowerCase().trim();
        const rows = overlay.querySelectorAll('.arz-player-row');
        rows.forEach(row => {
          const adminName = row.getAttribute('data-player').toLowerCase();
          const detailsRow = overlay.querySelector(`#arz-report-details-row-${row.getAttribute('data-index')}`);
          if (adminName.includes(query)) {
            row.style.display = '';
          } else {
            row.style.display = 'none';
            if (detailsRow) detailsRow.style.display = 'none';
          }
        });
      };

      overlay.querySelector('#arz-report-multi-reopen-btn').onclick = () => {
        closeOverlay(overlay);
        window.ArizonaLookupManager.openModal('report');
      };

      overlay.querySelector('#arz-report-multi-copy-btn').onclick = () => {
        navigator.clipboard.writeText(allPlayersSummaryText).then(() => {
          const btn = overlay.querySelector('#arz-report-multi-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Скопировать все репорты', 2000);
        });
      };

      overlay.querySelectorAll('.arz-player-row').forEach(row => {
        row.onclick = (e) => {
          if (e.target.closest('.arz-copy-single-report-btn')) return;

          const index = row.getAttribute('data-index');
          const detailsRow = overlay.querySelector(`#arz-report-details-row-${index}`);
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

      overlay.querySelectorAll('.arz-copy-single-report-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const index = parseInt(btn.getAttribute('data-index'), 10);
          const res = results[index];
          if (!res) return;

          let textToCopy = '';
          if (res.error) {
            textToCopy = `${res.player}: ${res.error}`;
          } else {
            const singleLines = [`Репорты администратора ${res.player}:`];
            res.reports.forEach(r => {
              singleLines.push(`- [${r.date}] Игрок: ${r.player} | Вопрос: ${r.question} | Ответ: ${r.answer}`);
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

    return {
      init: function (s) {
        settings = s || {};
        if (context.automaticCalculationEnabled === false || context.currentSettings['extension-toggle'] === false || settings.tools?.report === false) {
          if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; calculated = false; }
          return;
        }
        if (settings.tools?.report !== false) {
          this.checkAutoCalculation();
        }
      },
      updateSettings: function (s) {
        settings = s || {};
        if (context.automaticCalculationEnabled === false || context.currentSettings['extension-toggle'] === false || settings.tools?.report === false) {
          if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; calculated = false; }
          return;
        }
        if (settings.tools?.report !== false) {
          this.checkAutoCalculation();
        }
      },
      checkAutoCalculation: function () {
        if (context.automaticCalculationEnabled === false) return;
        const params = new URLSearchParams(window.location.search);
        if (context.currentSettings['extension-toggle'] !== false && settings.tools?.report !== false && params.get('arz_report') === '1' && !calculated) {
          calculated = true;
          autoTimer = setTimeout(() => {
            autoTimer = null;
            if (context.currentSettings['extension-toggle'] !== false && settings.tools?.report !== false) calculate();
            else calculated = false;
          }, 1000);
        }
      },
      processMultiplePlayers: processMultiplePlayers
    };
}
