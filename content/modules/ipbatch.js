export function create(context) {
  const { openOverlay, closeOverlay, fetchWithRetry, logOptions } = context;

    let settings = {};

    const modalHTML = `
      <div id="arz-ip-batch-overlay" class="alh-modal-overlay">
        <div class="arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-network-wired"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробив IP-адресов</div>
              <div class="arz-modal-subtitle">Сбор IP по последнему выходу</div>
            </div>
            <button data-action="cancel" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-modal-body">
            <div class="arz-modal-form-group">
              <div class="alh-layout-43">
                <label class="alh-layout-4 arz-modal-label"><i class="fa-solid fa-users"></i> Ник(и) игрока(ов)</label>
                <span class="alh-layout-68">Введено: <strong id="arz-ip-batch-count-num" class="alh-layout-7">0</strong></span>
              </div>
              <textarea id="arz-ip-batch-nicks" class="arz-textarea" rows="3" placeholder="Введите один или несколько ников (каждый с новой строки или через запятую)"></textarea>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button data-action="cancel" class="alh-layout-11 arz-btn-danger">Закрыть</button>
            <button data-action="start" class="alh-layout-11 arz-btn-primary">Пробить IP</button>
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

    function parsePlayerIps(doc, player) {
      const rows = doc.querySelectorAll('table.table tbody tr');
      if (rows.length === 0) {
        return { player, lastIp: '', regIp: '', date: '', error: 'Выходы не найдены' };
      }

      let foundLastIp = '';
      let foundRegIp = '';
      let foundDate = '';
      let fallbackRegIp = '';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.cells;
        if (cells.length < 4) continue;
        const date = (cells[0].textContent || '').trim();
        const ipCell = cells[3];
        if (!ipCell) continue;

        const lastIpEl = ipCell.querySelector('.badge-secondary, [title*="последний"], [title*="Последний IP"]');
        const regIpEl = ipCell.querySelector('.badge-primary, [title*="регистрационный"], [title*="Регистрационный IP"]');

        const lastIp = lastIpEl ? lastIpEl.textContent.trim() : '';
        const regIp = regIpEl ? regIpEl.textContent.trim() : '';

        if (!foundLastIp && lastIp) {
          foundLastIp = lastIp;
          foundDate = date;
        }

        if (regIp) {
          if (regIp !== '255.255.255.255') {
            if (!foundRegIp) {
              foundRegIp = regIp;
            }
          } else {
            if (!fallbackRegIp) {
              fallbackRegIp = regIp;
            }
          }
        }

        if (foundLastIp && foundRegIp) {
          break;
        }
      }

      const finalRegIp = foundRegIp || fallbackRegIp;

      if (foundLastIp || finalRegIp) {
        return {
          player,
          lastIp: foundLastIp,
          regIp: finalRegIp,
          date: foundDate,
          error: null
        };
      }

      return { player, lastIp: '', regIp: '', date: '', error: 'IP-адреса не найдены в логах' };
    }

    async function processMultiplePlayers(nicks) {
      let cancelBatch = false;

      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `
        <div class="alh-layout-45 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробив IP</div>
              <div class="arz-modal-subtitle">Поиск IP-адресов игроков...</div>
            </div>
          </div>
          <div class="alh-layout-47 alh-modal-body">
            <div id="arz-progress-player" class="alh-layout-69">Запуск...</div>
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

            statusTextEl.textContent = `Запрос данных (${i + 1} из ${nicks.length}), период: ${minDateStr} - ${maxDateStr}`;

            const response = await fetchWithRetry(fetchUrl.href, logOptions(progressOverlay));
            if (!response.ok) {
              throw new Error(`Ошибка: ${response.status}`);
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

          const res = parsePlayerIps(doc, player);
          results.push(res);
        } catch (err) {
          if (err.name === 'AbortError') { cancelBatch = true; break; }
          console.error(`Error fetching IP for ${player}:`, err);
          results.push({
            player,
            lastIp: '',
            regIp: '',
            date: '',
            error: err.message || 'Ошибка загрузки'
          });
        }

      }

      if (!cancelBatch) {
        closeOverlay(progressOverlay);
        showMultiResultsModal(results);
      }
    }

    function showMultiResultsModal(results) {
      let rowsHtml = '';
      results.forEach((res) => {
        const hasError = !!res.error;
        const lastIpStr = hasError ? `<span class="alh-layout-72">${res.error}</span>` : `<code class="alh-layout-74">${res.lastIp}</code>`;
        const regIpStr = hasError ? '—' : `<code class="alh-layout-83">${res.regIp}</code>`;
        const dateStr = hasError ? '—' : `<span class="alh-layout-84">${res.date}</span>`;

        rowsHtml += `
          <tr class="alh-layout-75">
            <td class="alh-layout-85">${res.player}</td>
            <td class="alh-layout-77">${lastIpStr}</td>
            <td class="alh-layout-77">${regIpStr}</td>
            <td class="alh-layout-77">${dateStr}</td>
          </tr>
        `;
      });

      const copyLines = ['IP-адреса пробитых игроков:'];
      results.forEach((res, i) => {
        if (res.error) {
          copyLines.push(`${i + 1}. ${res.player} — ${res.error}`);
        } else {
          copyLines.push(`${i + 1}. ${res.player}: Последний IP: ${res.lastIp} (${res.date}) | Рег IP: ${res.regIp}`);
        }
      });
      const copyText = copyLines.join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="alh-layout-86 arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-network-wired"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результаты пробива IP</div>
              <div class="arz-modal-subtitle">Адреса по последнему выходу с сервера</div>
            </div>
            <button id="arz-ip-multi-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-layout-79 online-result-table-wrapper">
            <table class="alh-layout-80 online-result-table">
              <thead>
                <tr class="alh-layout-81">
                  <th class="alh-layout-82">Игрок</th>
                  <th class="alh-layout-82">Последний IP</th>
                  <th class="alh-layout-82">Регистрационный IP</th>
                  <th class="alh-layout-87">Дата выхода</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-ip-multi-copy-btn" class="alh-layout-37 arz-btn-primary"><i class="fa-regular fa-copy"></i> Скопировать все IP</button>
            <button id="arz-ip-multi-reopen-btn" class="alh-layout-11 arz-btn-secondary"><i class="fa-solid fa-rotate-left"></i> Новый пробив</button>
            <button id="arz-ip-multi-close-btn" class="alh-layout-11 arz-btn-danger"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);

      overlay.querySelector('#arz-ip-multi-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-ip-multi-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);


      overlay.querySelector('#arz-ip-multi-reopen-btn').onclick = () => {
        closeOverlay(overlay);
        window.ArizonaLookupManager.openModal('ip');
      };

      overlay.querySelector('#arz-ip-multi-copy-btn').onclick = () => {
        navigator.clipboard.writeText(copyText).then(() => {
          const btn = overlay.querySelector('#arz-ip-multi-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Скопировать все IP', 2000);
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
        overlay.querySelector('#arz-ip-batch-nicks').value = urlPlayer;
      }

      overlay.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.onclick = () => closeOverlay(overlay));
      overlay.querySelector('[data-action="start"]').onclick = () => {
        const nicksVal = overlay.querySelector('#arz-ip-batch-nicks').value.trim();
        const nicks = nicksVal.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);

        if (nicks.length === 0) {
          window.ArizonaNotifications.show('Введите хотя бы один ник', 'error');
          return;
        }

        closeOverlay(overlay);
        processMultiplePlayers(nicks);
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
        if (document.getElementById('arz-ip-batch-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-ip-batch-btn';
        btn.className = 'btn btn-info';
        btn.style.cssText = 'margin-left: 10px; color: white !important;';
        btn.innerHTML = `<i style="margin-right: 6px;" class="fa-solid fa-network-wired"></i> IP`;
        btn.onclick = openModal;
        container.appendChild(btn);
      },
      processMultiplePlayers: processMultiplePlayers
    };
}
