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
          <tr style="border-bottom: 1px solid var(--az-border);">
            <td style="padding: 10px 16px; font-family: monospace; font-size: 12px; color: var(--az-text-secondary); white-space: nowrap;">${r.date}</td>
            <td class="arz-col-player" style="padding: 10px 16px; font-weight: 600; color: var(--az-text); font-size: 13px;">${r.player}</td>
            <td class="arz-col-question" style="padding: 10px 16px; color: var(--az-text-secondary); font-size: 13px; line-height: 1.4;">${r.question}</td>
            <td class="arz-col-answer" style="padding: 10px 16px; color: var(--az-accent-hover); font-weight: 600; font-size: 13px; line-height: 1.4;">${r.answer}</td>
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
        <div class="arz-modal-container" style="max-width: 800px; width: 95%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-comments"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Статистика репортов</div>
              <div class="arz-modal-subtitle" style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                <span style="color: #ffffff; font-weight: 600; background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); padding: 2px 8px; border-radius: 12px; font-size: 11px;">${res.player}</span>
                <span>Всего ответов: ${totalReports} | Дней: ${daysCount} | Ср. в день: ${avgReports}</span>
              </div>
            </div>
            <button id="arz-report-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--az-border); display: flex; gap: 12px; background: var(--az-bg-sidebar);">
            <input type="text" id="arz-reports-search" class="arz-input" placeholder="Поиск по игроку, вопросу или ответу..." style="width: 100%; box-sizing: border-box; font-size: 13px; padding: 8px 12px;">
          </div>
          <div class="online-result-table-wrapper" style="max-height: 550px; overflow-y: auto; background: var(--az-input-bg); border-bottom: 1px solid var(--az-border);">
            <table class="online-result-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid var(--az-border); background: var(--az-bg-sidebar); position: sticky; top: 0; z-index: 1;">
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase; width: 140px;">Дата</th>
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase; width: 120px;">Игрок</th>
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Вопрос</th>
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Ответ</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-report-copy-btn" class="arz-btn-primary" style="flex: 2;"><i class="fa-regular fa-copy"></i> Скопировать репорты</button>
            <button id="arz-report-reopen-btn" class="arz-btn-secondary" style="flex: 1;"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-report-close-btn" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-xmark"></i> Закрыть</button>
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
        <div class="arz-modal-container" style="max-width: 400px; width: 90%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper" style="background: rgba(0, 184, 217, 0.15); color: #00b8d9;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробив репортов</div>
              <div class="arz-modal-subtitle">Сбор репортов...</div>
            </div>
          </div>
          <div class="alh-modal-body" style="padding: 24px; text-align: center;">
            <div id="arz-progress-player" style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 8px;">Запуск...</div>
            <div id="arz-progress-status" style="font-size: 13px; color: #9aa0a6; margin-bottom: 20px;">Подготовка запросов</div>
            
            <div class="arz-progress-bar-container" style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 3px; overflow: hidden; margin-bottom: 24px;">
              <div id="alh-progress-bar-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #00b8d9 0%, #00e5ff 100%); transition: width 0.3s ease; border-radius: 3px;"></div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-progress-cancel-btn" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-ban"></i> Отмена</button>
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
        const countStr = hasError ? `<span style="color: var(--az-danger); font-size: 12px;">${res.error}</span>` : `${res.reports.length} реп.`;

        let detailsHtml = '';
        if (hasReports) {
          let detailRows = '';
          res.reports.forEach(r => {
            detailRows += `
              <div style="display: flex; flex-direction: column; padding: 10px 20px; border-bottom: 1px solid var(--az-border); gap: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; align-items: center;">
                  <span style="color: var(--az-text-secondary); font-family: monospace;">${r.date}</span>
                  <span style="color: var(--az-text); font-weight: 500;">Игрок: ${r.player}</span>
                </div>
                <div style="color: var(--az-text-secondary); font-size: 13px; line-height: 1.4;"><span style="color: var(--az-text-secondary);">Вопрос:</span> ${r.question}</div>
                <div style="color: var(--az-accent-hover); font-weight: 600; font-size: 13px; line-height: 1.4;"><span style="color: var(--az-text-secondary);">Ответ:</span> ${r.answer}</div>
              </div>
            `;
          });
          detailsHtml = `
            <tr id="arz-report-details-row-${index}" class="arz-details-row" style="display: none; background: var(--az-table-row-hover);">
              <td colspan="3" style="padding: 0; border-bottom: 1px solid var(--az-border);">
                <div style="max-height: 280px; overflow-y: auto; padding: 4px 0;">
                  ${detailRows}
                </div>
              </td>
            </tr>
          `;
        }

        rowsHtml += `
          <tr style="border-bottom: 1px solid var(--az-border); cursor: pointer;" class="arz-player-row" data-index="${index}" data-player="${res.player}">
            <td style="padding: 12px 16px; font-weight: 600; color: var(--az-text); font-size: 13px;">
              <span class="arz-toggle-details-btn" style="margin-right: 8px; color: var(--az-text-secondary);"><i class="fa-solid fa-chevron-right"></i></span>
              ${res.player}
            </td>
            <td style="padding: 12px 16px; font-weight: 700; color: ${hasError ? 'var(--az-text-secondary)' : 'var(--az-accent-hover)'}; font-size: 13px;">
              ${countStr}
            </td>
            <td style="padding: 12px 16px; text-align: right;">
              <button class="arz-btn-icon arz-copy-single-report-btn" data-index="${index}" title="Копировать репорты игрока" style="background: none; border: none; color: var(--az-text-secondary); cursor: pointer; padding: 4px 8px; font-size: 14px; transition: color 0.2s;"><i class="fa-regular fa-copy"></i></button>
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
        <div class="arz-modal-container" style="max-width: 700px; width: 95%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-comments"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результаты пробива репортов</div>
              <div class="arz-modal-subtitle">Статистика ответов администраторов</div>
            </div>
            <button id="arz-report-multi-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div style="padding: 12px 16px; border-bottom: 1px solid var(--az-border); display: flex; gap: 12px; background: var(--az-bg-sidebar);">
            <input type="text" id="arz-reports-multi-search" class="arz-input" placeholder="Поиск по имени администратора..." style="width: 100%; box-sizing: border-box; font-size: 13px; padding: 8px 12px;">
          </div>
          <div class="online-result-table-wrapper" style="max-height: 550px; overflow-y: auto; background: var(--az-input-bg); border-bottom: 1px solid var(--az-border);">
            <table class="online-result-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid var(--az-border); background: var(--az-bg-sidebar); position: sticky; top: 0; z-index: 1;">
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Администратор</th>
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Репорты</th>
                  <th style="text-align: right; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase; width: 50px;">Копировать</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-report-multi-copy-btn" class="arz-btn-primary" style="flex: 2;"><i class="fa-regular fa-copy"></i> Скопировать все репорты</button>
            <button id="arz-report-multi-reopen-btn" class="arz-btn-secondary" style="flex: 1;"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-report-multi-close-btn" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-xmark"></i> Закрыть</button>
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
