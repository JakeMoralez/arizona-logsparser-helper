export function create(context) {
  const { openOverlay, closeOverlay, fetchWithRetry, logOptions } = context;

    let settings = {};

    const modalHTML = `
      <div id="arz-idnick-overlay" class="alh-modal-overlay">
        <div class="arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-id-badge"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Узнать ID аккаунта / NickName</div>
              <div class="arz-modal-subtitle">Поиск ID по никнейму или наоборот</div>
            </div>
            <button data-action="cancel" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-modal-body">
            <div class="arz-modal-form-group">
              <div class="alh-layout-43">
                <label class="alh-layout-4 arz-modal-label"><i class="fa-solid fa-users"></i> Никнеймы или ID аккаунтов</label>
                <span class="alh-layout-68">Введено: <strong id="arz-idnick-count-num" class="alh-layout-7">0</strong></span>
              </div>
              <textarea id="arz-idnick-inputs" class="arz-textarea" rows="4" placeholder="Введите никнеймы (Nick_Name) или ID аккаунтов (числа)\nКаждый элемент с новой строки или через запятую"></textarea>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button data-action="cancel" class="alh-layout-11 arz-btn-danger">Закрыть</button>
            <button data-action="start" class="alh-layout-11 arz-btn-primary">Узнать данные</button>
          </div>
        </div>
      </div>
    `;

    function getFormattedDate(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    async function processMultipleInputs(inputs) {
      let cancelBatch = false;

      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `
        <div class="alh-layout-45 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Поиск ID/NickName</div>
              <div class="arz-modal-subtitle">Сбор информации с логов...</div>
            </div>
          </div>
          <div class="alh-layout-47 alh-modal-body">
            <div id="arz-progress-input" class="alh-layout-69">Запуск...</div>
            <div id="arz-progress-status" class="alh-layout-70">Подготовка запросов</div>
            
            <div class="alh-layout-71 arz-progress-bar-container">
              <div id="alh-progress-bar-fill" class="alh-layout-51"></div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-progress-cancel-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-ban"></i> Отмена</button>
          </div>
        </div>
      `;
      openOverlay(progressOverlay);

      const inputTextEl = progressOverlay.querySelector('#arz-progress-input');
      const statusTextEl = progressOverlay.querySelector('#arz-progress-status');
      const barFillEl = progressOverlay.querySelector('#alh-progress-bar-fill');
      const cancelBtn = progressOverlay.querySelector('#arz-progress-cancel-btn');

      cancelBtn.onclick = () => {
        cancelBatch = true;
        closeOverlay(progressOverlay);
        window.ArizonaNotifications.show('Сбор данных отменен', 'warning');
      };

      const results = [];
      for (let i = 0; i < inputs.length; i++) {
        if (cancelBatch) break;
        const currentInput = inputs[i];

        inputTextEl.textContent = currentInput;
        statusTextEl.textContent = `Запрос данных (${i + 1} из ${inputs.length})`;
        barFillEl.style.width = `${Math.round((i / inputs.length) * 100)}%`;

        const isId = /^\d+$/.test(currentInput);

        try {
          const fetchUrl = new URL(window.location.href);
          fetchUrl.searchParams.set('player', currentInput);

          fetchUrl.searchParams.delete('type[]');
          fetchUrl.searchParams.append('type[]', 'disconnect');

          fetchUrl.searchParams.set('limit', '5');
          fetchUrl.searchParams.set('sort', 'desc');
          fetchUrl.searchParams.delete('arz_online');
          fetchUrl.searchParams.delete('arz_punish');

          let rows = [];
          let doc = document;
          let currentDate = new Date();
          let attempts = 0;
          const maxAttempts = 10;

          while (attempts < maxAttempts) {
            let maxDateStr = getFormattedDate(currentDate);
            currentDate.setMonth(currentDate.getMonth() - 6);
            let minDateStr = getFormattedDate(currentDate);

            fetchUrl.searchParams.set('min_period', minDateStr + ' 00:00:00');
            fetchUrl.searchParams.set('max_period', maxDateStr + ' 23:59:59');

            statusTextEl.textContent = `Запрос данных (${i + 1} из ${inputs.length}), период: ${minDateStr} - ${maxDateStr}`;

            const response = await fetchWithRetry(fetchUrl.href, logOptions(progressOverlay));
            if (!response.ok) {
              throw new Error(`Ошибка запроса: ${response.status}`);
            }
            const htmlText = await response.text();
            const parser = new DOMParser();
            doc = parser.parseFromString(htmlText, 'text/html');
            rows = doc.querySelectorAll('table.table tbody tr');

            if (rows.length > 0) {
              break;
            }

            currentDate.setDate(currentDate.getDate() - 1);
            attempts++;

          }

          if (rows.length === 0) {
            results.push({
              query: currentInput,
              nickname: isId ? '—' : currentInput,
              accountId: isId ? currentInput : '—',
              error: 'Логи выхода не найдены'
            });
          } else {
            const firstRow = rows[0];
            const actionText = firstRow.cells[1] ? firstRow.cells[1].textContent.trim() : '';

            let extractedNick = '';
            const nickMatch = actionText.match(/\b([A-Za-z0-9]+_[A-Za-z0-9]+)\b/);
            if (nickMatch) {
              extractedNick = nickMatch[1];
            } else {
              extractedNick = isId ? '—' : currentInput;
            }

            let extractedId = '';
            const idMatch = doc.body.innerHTML.match(/ID аккаунта\s*:\s*(\d+)/i) || doc.body.innerHTML.match(/ID\s*аккаунта\s*:\s*<[^>]+>\s*(\d+)/i);
            if (idMatch) {
              extractedId = idMatch[1];
            } else {
              const btn = firstRow.querySelector('.btn-info, [data-toggle="modal"], button, a');
              if (btn) {
                const targetSelector = btn.getAttribute('data-target');
                if (targetSelector) {
                  const modalEl = doc.querySelector(targetSelector);
                  if (modalEl) {
                    const mMatch = modalEl.innerHTML.match(/ID аккаунта\s*:\s*(\d+)/i) || modalEl.innerHTML.match(/ID\s*аккаунта\s*:\s*<[^>]+>\s*(\d+)/i);
                    if (mMatch) extractedId = mMatch[1];
                  }
                }

                if (!extractedId) {
                  const siblingModal = firstRow.nextElementSibling?.classList.contains('modal') ? firstRow.nextElementSibling : firstRow.querySelector('.modal');
                  if (siblingModal) {
                    const mMatch = siblingModal.innerHTML.match(/ID аккаунта\s*:\s*(\d+)/i) || siblingModal.innerHTML.match(/ID\s*аккаунта\s*:\s*<[^>]+>\s*(\d+)/i);
                    if (mMatch) extractedId = mMatch[1];
                  }
                }

                if (!extractedId) {
                  let url = btn.getAttribute('data-href') || btn.getAttribute('data-url') || btn.getAttribute('href');
                  const onclick = btn.getAttribute('onclick');

                  if (!url && onclick) {
                    const urlMatch = onclick.match(/['"](\/[^'"]+)['"]/);
                    if (urlMatch) {
                      url = urlMatch[1];
                    }
                  }

                  if (url && url !== '#' && !url.startsWith('javascript:')) {
                    try {
                      const fetchUrlInfo = new URL(url, window.location.origin).href;
                      const infoRes = await fetchWithRetry(fetchUrlInfo, logOptions(progressOverlay));
                      if (infoRes.ok) {
                        const infoText = await infoRes.text();
                        const mMatch = infoText.match(/ID аккаунта\s*:\s*(\d+)/i) || infoText.match(/ID\s*аккаунта\s*:\s*<[^>]+>\s*(\d+)/i);
                        if (mMatch) extractedId = mMatch[1];
                      }
                    } catch (err) {
                      if (err.name === 'AbortError') throw err;
                      console.warn('Failed to fetch additional info in loop:', err);
                    }
                  }
                }
              }
            }

            if (!extractedId && isId) {
              extractedId = currentInput;
            }

            results.push({
              query: currentInput,
              nickname: extractedNick || (isId ? '—' : currentInput),
              accountId: extractedId || (isId ? currentInput : '—'),
              error: null
            });
          }
        } catch (err) {
          if (err.name === 'AbortError') { cancelBatch = true; break; }
          console.error(`Error processing query ${currentInput}:`, err);
          results.push({
            query: currentInput,
            nickname: isId ? '—' : currentInput,
            accountId: isId ? currentInput : '—',
            error: err.message || 'Ошибка загрузки'
          });
        }

      }

      if (!cancelBatch) {
        closeOverlay(progressOverlay);
        showResultsModal(results);
      }
    }

    function showResultsModal(results) {
      let rowsHtml = '';
      results.forEach((res) => {
        const hasError = !!res.error;
        const nickStr = hasError ? `<span class="alh-layout-72">${res.error}</span>` : `<span class="alh-layout-73">${res.nickname}</span>`;
        const idStr = hasError ? '—' : `<code class="alh-layout-74">${res.accountId}</code>`;

        rowsHtml += `
          <tr class="alh-layout-75">
            <td class="alh-layout-76">${res.query}</td>
            <td class="alh-layout-77">${nickStr}</td>
            <td class="alh-layout-77">${idStr}</td>
          </tr>
        `;
      });

      const copyLines = ['Результаты поиска ID/NickName:'];
      results.forEach((res, i) => {
        if (res.error) {
          copyLines.push(`${i + 1}. ${res.query} — ${res.error}`);
        } else {
          copyLines.push(`${i + 1}. Ник: ${res.nickname} | ID: ${res.accountId}`);
        }
      });
      const copyText = copyLines.join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="alh-layout-78 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-id-badge"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результаты поиска</div>
              <div class="arz-modal-subtitle">Сопоставление NickName и ID аккаунта</div>
            </div>
            <button id="arz-idnick-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-layout-79 online-result-table-wrapper">
            <table class="alh-layout-80 online-result-table">
              <thead>
                <tr class="alh-layout-81">
                  <th class="alh-layout-82">Запрос</th>
                  <th class="alh-layout-82">NickName</th>
                  <th class="alh-layout-82">ID аккаунта</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-idnick-copy-btn" class="alh-layout-37 arz-btn-primary"><i class="fa-regular fa-copy"></i> Скопировать результаты</button>
            <button id="arz-idnick-reopen-btn" class="alh-layout-11 arz-btn-secondary"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-idnick-close-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);

      overlay.querySelector('#arz-idnick-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-idnick-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);


      overlay.querySelector('#arz-idnick-reopen-btn').onclick = () => {
        closeOverlay(overlay);
        window.ArizonaLookupManager.openModal('idnick');
      };

      overlay.querySelector('#arz-idnick-copy-btn').onclick = () => {
        navigator.clipboard.writeText(copyText).then(() => {
          const btn = overlay.querySelector('#arz-idnick-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Скопировать результаты', 2000);
        });
      };
    }

    function openModal() {
      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = modalHTML;
      openOverlay(overlay);

      const params = new URLSearchParams(window.location.search);
      const urlPlayer = params.get('player');
      if (urlPlayer) {
        overlay.querySelector('#arz-idnick-inputs').value = urlPlayer;
      }

      overlay.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.onclick = () => closeOverlay(overlay));
      overlay.querySelector('[data-action="start"]').onclick = () => {
        const inputsVal = overlay.querySelector('#arz-idnick-inputs').value.trim();
        const inputs = inputsVal.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);

        if (inputs.length === 0) {
          window.ArizonaNotifications.show('Введите хотя бы один ник или ID', 'error');
          return;
        }

        closeOverlay(overlay);
        processMultipleInputs(inputs);
      };

    }

    return {
      init: function (s) {
        settings = s || {};
      },
      updateSettings: function (s) {
        settings = s || {};
      },
      injectButton: function () {
        if (document.getElementById('arz-idnick-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-idnick-btn';
        btn.className = 'btn btn-primary';
        btn.style.cssText = 'margin-left: 10px; color: white !important;';
        btn.innerHTML = `<i style="margin-right: 6px;" class="fa-solid fa-id-badge"></i> ID/Ник`;
        btn.onclick = openModal;
        container.appendChild(btn);
      },
      processMultipleInputs: processMultipleInputs,
      resolveSingle: async function (query) {
        const isId = /^\d+$/.test(query);
        const fetchUrl = new URL(window.location.href);
        fetchUrl.searchParams.set('player', query);
        fetchUrl.searchParams.delete('type[]');
        fetchUrl.searchParams.append('type[]', 'disconnect');
        fetchUrl.searchParams.set('limit', '5');
        fetchUrl.searchParams.set('sort', 'desc');
        fetchUrl.searchParams.delete('arz_online');
        fetchUrl.searchParams.delete('arz_punish');

        let currentDate = new Date();
        let attempts = 0;
        const maxAttempts = 10;
        let doc = document;

        const getFormattedDate = (date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        };

        while (attempts < maxAttempts) {
          let maxDateStr = getFormattedDate(currentDate);
          currentDate.setMonth(currentDate.getMonth() - 6);
          let minDateStr = getFormattedDate(currentDate);

          fetchUrl.searchParams.set('min_period', minDateStr + ' 00:00:00');
          fetchUrl.searchParams.set('max_period', maxDateStr + ' 23:59:59');

          try {
            const response = await fetchWithRetry(fetchUrl.href);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (response.ok) {
              const htmlText = await response.text();
              const parser = new DOMParser();
              doc = parser.parseFromString(htmlText, 'text/html');
              const rows = doc.querySelectorAll('table.table tbody tr');
              if (rows.length > 0) break;
            }
          } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.error(`Error resolving ID/Nick for ${query}:`, err);
            return null;
          }

          currentDate.setDate(currentDate.getDate() - 1);
          attempts++;

        }

        const rows = doc.querySelectorAll('table.table tbody tr');
        if (rows.length === 0) return null;

        const firstRow = rows[0];
        const actionText = firstRow.cells[1] ? firstRow.cells[1].textContent.trim() : '';

        let extractedNick = '';
        const nickMatch = actionText.match(/\b([A-Za-z0-9]+_[A-Za-z0-9]+)\b/);
        if (nickMatch) {
          extractedNick = nickMatch[1];
        }

        let extractedId = '';
        const idMatch = doc.body.innerHTML.match(/ID аккаунта\s*:\s*(\d+)/i) || doc.body.innerHTML.match(/ID\s*аккаунта\s*:\s*<[^>]+>\s*(\d+)/i);
        if (idMatch) {
          extractedId = idMatch[1];
        } else {
          const btn = firstRow.querySelector('.btn-info, [data-toggle="modal"], button, a');
          if (btn) {
            const targetSelector = btn.getAttribute('data-target');
            if (targetSelector) {
              const modalEl = doc.querySelector(targetSelector);
              if (modalEl) {
                const mMatch = modalEl.innerHTML.match(/ID аккаунта\s*:\s*(\d+)/i) || modalEl.innerHTML.match(/ID\s*аккаунта\s*:\s*<[^>]+>\s*(\d+)/i);
                if (mMatch) extractedId = mMatch[1];
              }
            }
          }
        }

        return {
          query,
          nickname: extractedNick || (isId ? null : query),
          accountId: extractedId || (isId ? query : null)
        };
      }
    };
}
