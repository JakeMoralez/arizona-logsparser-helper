export function create(context) {
  const { openOverlay, closeOverlay, setupDateShortcuts, fetchWithRetry, logOptions } = context;

    let settings = {};
    let calculated = false;
    let autoTimer = null;

    const modalHTML = `
      <div id="alh-online-overlay" class="alh-modal-overlay">
        <div class="arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-clock"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Расчет онлайна</div>
              <div class="arz-modal-subtitle">Анализ игровых сессий</div>
            </div>
            <button data-action="cancel" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-modal-body">
            <div class="arz-modal-form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="arz-modal-label" style="margin: 0;"><i class="fa-solid fa-users"></i> Ник(и) игрока(ов)</label>
                <span style="font-size: 11px; color: var(--az-text-secondary); background: var(--az-input-bg); border: 1px solid var(--az-border); padding: 2px 8px; border-radius: 12px;">Введено: <strong id="arz-online-count-num" style="color: var(--az-accent-hover);">0</strong></span>
              </div>
              <textarea id="arz-online-nicks" class="arz-textarea" rows="3" placeholder="Введите один или несколько ников (каждый с новой строки или через запятую)"></textarea>
            </div>
            <div style="display: flex; gap: 12px; width: 100%; box-sizing: border-box;">
              <div class="arz-modal-form-group" style="flex: 1;">
                <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата от</label>
                <input type="date" id="alh-online-date-from" class="arz-input">
              </div>
              <div class="arz-modal-form-group" style="flex: 1;">
                <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата до</label>
                <input type="date" id="alh-online-date-to" class="arz-input">
              </div>
            </div>
            <div class="arz-date-shortcuts" style="display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 6px !important; width: 100% !important; box-sizing: border-box !important; margin-top: -4px !important;">
              <button type="button" class="arz-btn-shortcut" data-range="day">За день</button>
              <button type="button" class="arz-btn-shortcut" data-range="week">За неделю</button>
              <button type="button" class="arz-btn-shortcut" data-range="month">За месяц</button>
              <button type="button" class="arz-btn-shortcut" data-range="start-week">С начала недели</button>
              <button type="button" class="arz-btn-shortcut" data-range="start-month">С начала месяца</button>
              <button type="button" class="arz-btn-shortcut" data-range="start-year">С начала года</button>
            </div>
            <div class="arz-modal-form-group" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="arz-online-stealth" style="cursor: pointer; width: 16px; height: 16px; accent-color: var(--az-accent);">
              <label for="arz-online-stealth" class="arz-modal-label" style="margin: 0; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none;">
                <i class="fa-solid fa-user-secret"></i> Скрытный режим (анализ общих логов)
              </label>
            </div>
            <div class="arz-accordion">
              <div class="arz-accordion-header">
                <div class="arz-accordion-header-left"><i class="fa-solid fa-filter"></i> <span>Чистый онлайн</span></div>
                <i class="fa-solid fa-chevron-down arz-accordion-chevron"></i>
              </div>
              <div class="arz-accordion-content">
                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--az-text-secondary);"><i class="fa-solid fa-circle-info"></i> Учитывать только указанный промежуток суток</div>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                  <span style="font-size: 12px; color: var(--az-text); min-width: 70px;">Будние дни</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="time" id="alh-online-wd-from" class="arz-input" style="padding: 6px 10px !important; width: auto !important;">
                    <span style="color: var(--az-text-secondary);">—</span>
                    <input type="time" id="alh-online-wd-to" class="arz-input" style="padding: 6px 10px !important; width: auto !important;">
                  </div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                  <span style="font-size: 12px; color: var(--az-text); min-width: 70px;">Выходные</span>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <input type="time" id="alh-online-we-from" class="arz-input" style="padding: 6px 10px !important; width: auto !important;">
                    <span style="color: var(--az-text-secondary);">—</span>
                    <input type="time" id="alh-online-we-to" class="arz-input" style="padding: 6px 10px !important; width: auto !important;">
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button data-action="cancel" class="arz-btn-danger" style="flex: 1;">Закрыть</button>
            <button data-action="start" class="arz-btn-primary" style="flex: 1;">Пробить онлайн</button>
          </div>
        </div>
      </div>
    `;

    function parseHHMM(str) {
      if (!str) return null;
      const p = str.split(':');
      if (p.length < 2) return null;
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }

    function parseDate(str) {
      str = (str || '').trim();
      let d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]);
      return null;
    }

    function calculateOnlineFromSessions(sessions, player, dateFrom, dateTo) {
      const wdFrom = parseHHMM(localStorage.getItem('arz-clean-weekday-from'));
      const wdTo = parseHHMM(localStorage.getItem('arz-clean-weekday-to'));
      const weFrom = parseHHMM(localStorage.getItem('arz-clean-weekend-from'));
      const weTo = parseHHMM(localStorage.getItem('arz-clean-weekend-to'));
      const wdWin = (wdFrom !== null && wdTo !== null) ? { fromMin: wdFrom, toMin: wdTo } : null;
      const weWin = (weFrom !== null && weTo !== null) ? { fromMin: weFrom, toMin: weTo } : null;

      const onlineByDay = {};
      let earliest = null, latest = null;

      sessions.forEach(session => {
        const { sessionEnd, rawSecs } = session;
        const isWE = sessionEnd.getDay() === 0 || sessionEnd.getDay() === 6;
        const secs = clampSession(sessionEnd, rawSecs, isWE ? weWin : wdWin);

        const day = new Date(sessionEnd.getFullYear(), sessionEnd.getMonth(), sessionEnd.getDate());
        const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        if (!earliest || day < earliest) earliest = day;
        if (!latest || day > latest) latest = day;
        if (secs > 0) onlineByDay[key] = (onlineByDay[key] || 0) + secs;
      });

      const currentParams = new URLSearchParams(window.location.search);
      const startP = dateFrom ? parsePeriodDate(dateFrom) : (currentParams.get('min_period') ? parsePeriodDate(currentParams.get('min_period')) : earliest);
      const endP = dateTo ? parsePeriodDate(dateTo) : (currentParams.get('max_period') ? parsePeriodDate(currentParams.get('max_period')) : latest);

      if (!startP || !endP) {
        return {
          player,
          total: 0,
          avg: '0.0',
          allDays: [],
          entries: [],
          error: 'Сессии не найдены'
        };
      }

      const allDays = [];
      const iter = new Date(startP);
      const maxIterDays = 366;
      let safetyCount = 0;
      while (iter <= endP && safetyCount < maxIterDays) {
        allDays.push(`${iter.getFullYear()}-${String(iter.getMonth() + 1).padStart(2, '0')}-${String(iter.getDate()).padStart(2, '0')}`);
        iter.setDate(iter.getDate() + 1);
        safetyCount++;
      }

      const entries = allDays.map(k => [k, onlineByDay[k] || 0]);
      const total = entries.reduce((s, [, v]) => s + v, 0);
      const totalDaysCount = allDays.length;
      const avg = totalDaysCount > 0 ? (total / totalDaysCount / 3600).toFixed(1) : '0.0';

      return {
        player,
        total,
        avg,
        allDays,
        entries
      };
    }

    function calculatePlayerOnline(doc, player, dateFrom, dateTo) {
      const rows = doc.querySelectorAll('table.table tbody tr');
      const sessions = [];
      const RE = /(.*).*Игрок.*сессии:\s*([\d:]+),.*авторизация/i;

      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;
        const text = (cells[0].textContent || '').trim() + ' ' + (cells[1].textContent || '').replace(/\s+/g, ' ').trim();
        const m = RE.exec(text);
        if (!m) return;
        const sessionEnd = parseDate(m[1].trim());
        if (!sessionEnd || isNaN(sessionEnd.getTime())) return;
        const rawSecs = timeToSecs(m[2]);
        sessions.push({ sessionEnd, rawSecs });
      });

      return calculateOnlineFromSessions(sessions, player, dateFrom, dateTo);
    }

    function matchPlayerFromRow(row, nicks) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return null;
      const cell = cells[1];

      const anchors = cell.querySelectorAll('a[href*="player="]');
      for (const a of anchors) {
        const nick = a.textContent.trim();
        if (nicks.includes(nick)) return nick;
      }

      const text = cell.textContent;
      for (const nick of nicks) {
        if (text.includes(nick)) return nick;
      }
      return null;
    }

    function parsePeriodDate(str) {
      if (!str) return null;
      str = str.split(' ')[0].trim();
      let d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      const m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
      return null;
    }

    function timeToSecs(str) {
      const [h, m, s] = (str || '0:0:0').split(':').map(Number);
      return h * 3600 + m * 60 + s;
    }

    function secsToHMS(total) {
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    }

    function clampSession(sessionEnd, rawSecs, win) {
      if (!win) return rawSecs;
      const sessionEndMin = sessionEnd.getHours() * 60 + sessionEnd.getMinutes();
      const sessionStartMin = sessionEndMin - Math.floor(rawSecs / 60);
      const overlapStart = Math.max(sessionStartMin, win.fromMin);
      const overlapEnd = Math.min(sessionEndMin, win.toMin);
      if (overlapEnd <= overlapStart) return 0;
      return (overlapEnd - overlapStart) * 60;
    }

    function renderSingleOnlineResult(res) {
      const { player, total, avg, allDays, entries } = res;
      const copyLines = [`Онлайн игрока ${player} за ${allDays.length} дней: ${secsToHMS(total)} (~${avg} час/день)`];
      entries.forEach(([k, v]) => {
        const [y, mo, d] = k.split('-');
        copyLines.push(`${d}.${mo}.${y} → ${secsToHMS(v)}`);
      });

      let rowsHtml = '';
      entries.forEach(([k, v]) => {
        const [y, mo, d] = k.split('-');
        rowsHtml += `<tr><td style="padding: 8px 20px; font-family: monospace; font-size: 13px; color: ${v > 0 ? 'var(--az-text)' : 'var(--az-text-secondary)'}; border-bottom: 1px solid var(--az-border);">${d}.${mo}.${y}</td><td style="padding: 8px 20px; font-family: monospace; font-size: 13px; font-weight: 600; color: ${v > 0 ? 'var(--az-accent-hover)' : 'var(--az-text-secondary)'}; border-bottom: 1px solid var(--az-border);">${secsToHMS(v)}</td></tr>`;
      });

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="arz-modal-container" style="max-width: 480px; width: 90%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-clock"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результат расчета</div>
              <div class="arz-modal-subtitle" style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                <span class="player-nick" style="color: #ffffff; font-weight: 600; background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); padding: 2px 8px; border-radius: 12px; font-size: 11px;">${player}</span>
                <span>Онлайн по дням</span>
              </div>
            </div>
            <button id="arz-online-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="online-result-stats" style="text-align: center; padding: 20px; background: var(--az-table-row-hover); border-bottom: 1px solid var(--az-border);">
            <div class="online-result-total" style="font-size: 38px; font-weight: 700; color: var(--az-accent-hover); font-family: monospace;">${secsToHMS(total)}</div>
            <div class="online-result-sub" style="color: var(--az-text-secondary); font-size: 13px; margin-top: 6px;">за <strong>${allDays.length}</strong> дн. · <strong>${avg}</strong> ч/день</div>
          </div>
          <div class="online-result-table-wrapper" style="max-height: 550px; overflow-y: auto; background: var(--az-input-bg); border-bottom: 1px solid var(--az-border);"><table class="online-result-table" style="width: 100%; border-collapse: collapse;"><thead><tr style="border-bottom: 1px solid var(--az-border); background: var(--az-bg-sidebar); position: sticky; top: 0;"><th style="text-align: left; padding: 12px 20px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Дата</th><th style="text-align: left; padding: 12px 20px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Онлайн</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
          <div class="alh-modal-footer">
            <button id="alh-online-copy-btn" class="arz-btn-primary" style="flex: 1;"><i class="fa-regular fa-copy"></i> Копировать</button>
            <button id="arz-online-reopen-btn" class="arz-btn-secondary" style="flex: 1;"><i class="fa-solid fa-rotate-left"></i> Новый расчет</button>
            <button id="alh-online-close-btn" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;
      openOverlay(overlay);
      overlay.querySelector('#alh-online-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-online-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);
      overlay.querySelector('#alh-online-copy-btn').onclick = () => {
        navigator.clipboard.writeText(copyLines.join('\n')).then(() => {
          overlay.querySelector('#alh-online-copy-btn').innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => overlay.querySelector('#alh-online-copy-btn').innerHTML = '<i class="fa-regular fa-copy"></i> Копировать', 2000);
        });
      };
      overlay.querySelector('#arz-online-reopen-btn').onclick = () => { closeOverlay(overlay); window.ArizonaLookupManager.openModal('online'); };

    }

    async function calculate() {
      const params = new URLSearchParams(window.location.search);
      const player = params.get('player') || 'Не указан';
      const dateFrom = params.get('min_period');
      const dateTo = params.get('max_period');

      const res = calculatePlayerOnline(document, player, dateFrom, dateTo);
      if (res.error) {
        window.ArizonaNotifications.show(res.error, 'error');
        return;
      }
      renderSingleOnlineResult(res);
    }

    async function processStealthOnline(nicks, dateFrom, dateTo) {
      let cancelBatch = false;

      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `
        <div class="arz-modal-container" style="max-width: 400px; width: 90%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Скрытный расчет</div>
              <div class="arz-modal-subtitle">Анализ общих логов выхода...</div>
            </div>
          </div>
          <div class="alh-modal-body" style="padding: 24px; text-align: center;">
            <div id="arz-progress-player" style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 8px;">Загрузка страниц...</div>
            <div id="arz-progress-status" style="font-size: 13px; color: #9aa0a6; margin-bottom: 20px;">Загружено страниц: 0</div>
            
            <div class="arz-progress-bar-container" style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 3px; overflow: hidden; margin-bottom: 24px;">
              <div id="alh-progress-bar-fill" style="width: 100%; height: 100%; background: linear-gradient(90deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); border-radius: 3px;"></div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-progress-cancel-btn" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-ban"></i> Отмена</button>
          </div>
        </div>
      `;
      openOverlay(progressOverlay);

      const statusTextEl = progressOverlay.querySelector('#arz-progress-status');
      const cancelBtn = progressOverlay.querySelector('#arz-progress-cancel-btn');

      cancelBtn.onclick = () => {
        cancelBatch = true;
        closeOverlay(progressOverlay);
        window.ArizonaNotifications.show('Сбор данных отменен', 'warning');
      };

      const playerSessions = {};
      nicks.forEach(nick => {
        playerSessions[nick] = [];
      });

      const RE = /(.*).*Игрок.*сессии:\s*([\d:]+),.*авторизация/i;

      let page = 1;
      let hasMore = true;
      let totalFound = 0;

      const fetchUrl = new URL(window.location.href);
      fetchUrl.searchParams.delete('player');
      fetchUrl.searchParams.set('type[]', 'disconnect');
      fetchUrl.searchParams.set('limit', '1000');
      fetchUrl.searchParams.set('sort', 'desc');
      fetchUrl.searchParams.delete('arz_online');
      if (dateFrom) fetchUrl.searchParams.set('min_period', dateFrom + ' 00:00:00');
      if (dateTo) fetchUrl.searchParams.set('max_period', dateTo + ' 23:59:59');

      while (hasMore && !cancelBatch) {
        statusTextEl.textContent = `Загружено страниц: ${page - 1} · Найдено сессий: ${totalFound}`;

        try {
          fetchUrl.searchParams.set('page', page);
          const response = await fetchWithRetry(fetchUrl.href, logOptions(progressOverlay));
          if (!response.ok) {
            throw new Error(`Ошибка: ${response.status}`);
          }
          const htmlText = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');

          const rows = doc.querySelectorAll('table.table tbody tr');
          if (rows.length === 0) {
            hasMore = false;
            break;
          }

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;
            const text = (cells[0].textContent || '').trim() + ' ' + (cells[1].textContent || '').replace(/\s+/g, ' ').trim();
            const m = RE.exec(text);
            if (!m) return;

            const matchedNick = matchPlayerFromRow(row, nicks);
            if (matchedNick) {
              const sessionEnd = parseDate(m[1].trim());
              if (sessionEnd && !isNaN(sessionEnd.getTime())) {
                const rawSecs = timeToSecs(m[2]);
                playerSessions[matchedNick].push({ sessionEnd, rawSecs });
                totalFound++;
              }
            }
          });

          let hasNextPage = false;
          const nextAnchor = doc.querySelector('a[rel="next"], a[aria-label*="Next"], a[aria-label*="next"], .pagination a[class*="next"], .page-item a[class*="next"]');
          if (nextAnchor) {
            hasNextPage = true;
          }
          if (!hasNextPage) {
            const nextPageQuery = `page=${page + 1}`;
            hasNextPage = Array.from(doc.querySelectorAll('a[href*="page="]')).some(a => {
              const href = a.getAttribute('href') || '';
              return href.includes(nextPageQuery);
            });
          }
          if (!hasNextPage) {
            const nextPageStr = String(page + 1);
            hasNextPage = Array.from(doc.querySelectorAll('.pagination a, ul.pagination a, li.page-item a')).some(a => {
              return a.textContent.trim() === nextPageStr;
            });
          }

          console.log(`Stealth Mode: processed page ${page}, found ${rows.length} rows, hasNextPage=${hasNextPage}`);

          if (!hasNextPage) {
            hasMore = false;
          }

          page++;


        } catch (err) {
          if (err.name === 'AbortError') { cancelBatch = true; break; }
          console.error(`Stealth fetch error on page ${page}:`, err);
          window.ArizonaNotifications.show(`Ошибка на странице ${page}: ${err.message}`, 'error');
          hasMore = false;
        }
      }

      if (!cancelBatch) {
        closeOverlay(progressOverlay);
        const results = nicks.map(nick => {
          const sessions = playerSessions[nick];
          return calculateOnlineFromSessions(sessions, nick, dateFrom, dateTo);
        });

        if (results.length === 1) {
          if (results[0].error) {
            window.ArizonaNotifications.show(results[0].error, 'error');
          } else {
            renderSingleOnlineResult(results[0]);
          }
        } else {
          showMultiResultsModal(results);
        }
      }
    }

    async function processMultiplePlayers(nicks, dateFrom, dateTo) {
      let cancelBatch = false;

      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `
        <div class="arz-modal-container" style="max-width: 400px; width: 90%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробитие онлайна</div>
              <div class="arz-modal-subtitle">Сбор данных игроков...</div>
            </div>
          </div>
          <div class="alh-modal-body" style="padding: 24px; text-align: center;">
            <div id="arz-progress-player" style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 8px;">Запуск...</div>
            <div id="arz-progress-status" style="font-size: 13px; color: #9aa0a6; margin-bottom: 20px;">Подготовка запросов</div>
            
            <div class="arz-progress-bar-container" style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 3px; overflow: hidden; margin-bottom: 24px;">
              <div id="alh-progress-bar-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); transition: width 0.3s ease; border-radius: 3px;"></div>
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
          fetchUrl.searchParams.set('type[]', 'disconnect');
          fetchUrl.searchParams.set('limit', '1000');
          fetchUrl.searchParams.set('sort', 'asc');
          fetchUrl.searchParams.delete('arz_online');
          if (dateFrom) fetchUrl.searchParams.set('min_period', dateFrom + ' 00:00:00');
          if (dateTo) fetchUrl.searchParams.set('max_period', dateTo + ' 23:59:59');

          const response = await fetchWithRetry(fetchUrl.href, logOptions(progressOverlay));
          if (!response.ok) {
            throw new Error(`Ошибка: ${response.status}`);
          }
          const htmlText = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');

          const res = calculatePlayerOnline(doc, player, dateFrom, dateTo);
          results.push(res);
        } catch (err) {
          if (err.name === 'AbortError') { cancelBatch = true; break; }
          console.error(`Error fetching online for ${player}:`, err);
          results.push({
            player,
            total: 0,
            avg: '0.0',
            allDays: [],
            entries: [],
            error: err.message || 'Ошибка загрузки'
          });
        }

      }

      if (!cancelBatch) {
        closeOverlay(progressOverlay);
        if (results.length === 1) {
          if (results[0].error) {
            window.ArizonaNotifications.show(results[0].error, 'error');
          } else {
            renderSingleOnlineResult(results[0]);
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
        const totalStr = hasError ? `<span style="color: var(--az-danger); font-size: 12px;">${res.error}</span>` : secsToHMS(res.total);
        const avgStr = hasError ? '—' : `${res.avg} ч/день`;

        let detailsHtml = '';
        if (!hasError && res.entries && res.entries.length > 0) {
          let detailRows = '';
          res.entries.forEach(([k, v]) => {
            const [y, mo, d] = k.split('-');
            detailRows += `
              <div style="display: flex; justify-content: space-between; padding: 6px 20px; font-family: monospace; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,0.03);">
                <span style="color: #9aa0a6;">${d}.${mo}.${y}</span>
                <span style="color: ${v > 0 ? 'var(--az-accent-hover)' : '#6f7377'}; font-weight: 500;">${secsToHMS(v)}</span>
              </div>
            `;
          });
          detailsHtml = `
            <tr id="arz-details-row-${index}" class="arz-details-row" style="display: none; background: rgba(0, 0, 0, 0.15);">
              <td colspan="4" style="padding: 0; border-bottom: 1px solid var(--az-border);">
                <div style="max-height: 180px; overflow-y: auto; padding: 4px 0;">
                  ${detailRows}
                </div>
              </td>
            </tr>
          `;
        }

        rowsHtml += `
          <tr style="border-bottom: 1px solid var(--az-border); cursor: pointer;" class="arz-player-row" data-index="${index}">
            <td style="padding: 12px 16px; font-weight: 600; color: var(--az-text); font-size: 13px;">
              <span class="arz-toggle-details-btn" style="margin-right: 8px; color: var(--az-text-secondary);"><i class="fa-solid fa-chevron-right"></i></span>
              ${res.player}
            </td>
            <td style="padding: 12px 16px; font-family: monospace; font-weight: 700; color: ${hasError ? 'var(--az-danger)' : 'var(--az-accent-hover)'}; font-size: 14px;">
              ${totalStr}
            </td>
            <td style="padding: 12px 16px; font-size: 13px; color: var(--az-text-secondary);">
              ${avgStr}
            </td>
            <td style="padding: 12px 16px; text-align: right;">
              <button class="arz-btn-icon arz-copy-single-btn" data-index="${index}" title="Копировать онлайн игрока" style="background: none; border: none; color: var(--az-text-secondary); cursor: pointer; padding: 4px 8px; font-size: 14px; transition: color 0.2s;"><i class="fa-regular fa-copy"></i></button>
            </td>
          </tr>
          ${detailsHtml}
        `;
      });

      const allPlayersSummaryLines = ['Суммарный онлайн игроков:'];
      results.forEach((res, i) => {
        if (res.error) {
          allPlayersSummaryLines.push(`${i + 1}. ${res.player} — ${res.error}`);
        } else {
          allPlayersSummaryLines.push(`${i + 1}. ${res.player} — ${secsToHMS(res.total)} (~${res.avg} ч/день, за ${res.allDays.length} дн.)`);
        }
      });
      const allPlayersSummaryText = allPlayersSummaryLines.join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="arz-modal-container" style="max-width: 600px; width: 95%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper"><i class="fa-solid fa-users"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результаты расчета</div>
              <div class="arz-modal-subtitle">Сводный онлайн игроков</div>
            </div>
            <button id="arz-online-multi-close-header-btn" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="online-result-table-wrapper" style="max-height: 550px; overflow-y: auto; background: var(--az-input-bg); border-bottom: 1px solid var(--az-border);">
            <table class="online-result-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid var(--az-border); background: var(--az-bg-sidebar); position: sticky; top: 0; z-index: 1;">
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Игрок</th>
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Суммарный онлайн</th>
                  <th style="text-align: left; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase;">Средний</th>
                  <th style="text-align: right; padding: 12px 16px; color: var(--az-text-secondary); font-size: 11px; text-transform: uppercase; width: 50px;">Копировать</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-online-multi-copy-btn" class="arz-btn-primary" style="flex: 2;"><i class="fa-regular fa-copy"></i> Скопировать весь онлайн</button>
            <button id="arz-online-multi-reopen-btn" class="arz-btn-secondary" style="flex: 1;"><i class="fa-solid fa-rotate-left"></i> Новый расчет</button>
            <button id="arz-online-multi-close-btn" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);

      overlay.querySelector('#arz-online-multi-close-btn').onclick = () => closeOverlay(overlay);
      const closeHeader = overlay.querySelector('#arz-online-multi-close-header-btn');
      if (closeHeader) closeHeader.onclick = () => closeOverlay(overlay);


      overlay.querySelector('#arz-online-multi-reopen-btn').onclick = () => {
        closeOverlay(overlay);
        window.ArizonaLookupManager.openModal('online');
      };

      overlay.querySelector('#arz-online-multi-copy-btn').onclick = () => {
        navigator.clipboard.writeText(allPlayersSummaryText).then(() => {
          const btn = overlay.querySelector('#arz-online-multi-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Скопировать весь онлайн', 2000);
        });
      };

      overlay.querySelectorAll('.arz-player-row').forEach(row => {
        row.onclick = (e) => {
          if (e.target.closest('.arz-copy-single-btn')) return;

          const index = row.getAttribute('data-index');
          const detailsRow = overlay.querySelector(`#arz-details-row-${index}`);
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

      overlay.querySelectorAll('.arz-copy-single-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const index = parseInt(btn.getAttribute('data-index'), 10);
          const res = results[index];
          if (!res) return;

          let textToCopy = '';
          if (res.error) {
            textToCopy = `${res.player}: ${res.error}`;
          } else {
            const singleLines = [`Онлайн игрока ${res.player} за ${res.allDays.length} дней: ${secsToHMS(res.total)} (~${res.avg} час/день)`];
            res.entries.forEach(([k, v]) => {
              const [y, mo, d] = k.split('-');
              singleLines.push(`${d}.${mo}.${y} → ${secsToHMS(v)}`);
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
        overlay.querySelector('#alh-online-date-from').value = urlMin.split(' ')[0];
      }
      if (urlMax) {
        overlay.querySelector('#alh-online-date-to').value = urlMax.split(' ')[0];
      }
      const urlPlayer = params.get('player');
      if (urlPlayer) {
        overlay.querySelector('#arz-online-nicks').value = urlPlayer;
      }

      overlay.querySelector('#alh-online-wd-from').value = localStorage.getItem('arz-clean-weekday-from') || '';
      overlay.querySelector('#alh-online-wd-to').value = localStorage.getItem('arz-clean-weekday-to') || '';
      overlay.querySelector('#alh-online-we-from').value = localStorage.getItem('arz-clean-weekend-from') || '';
      overlay.querySelector('#alh-online-we-to').value = localStorage.getItem('arz-clean-weekend-to') || '';

      const isStealth = localStorage.getItem('arz-online-stealth-enabled') === 'true';
      overlay.querySelector('#arz-online-stealth').checked = isStealth;

      const contentEl = overlay.querySelector('.arz-accordion-content');
      const chevron = overlay.querySelector('.arz-accordion-chevron');
      overlay.querySelector('.arz-accordion-header').onclick = () => {
        const show = contentEl.style.display === 'none' || contentEl.style.display === '';
        contentEl.style.display = show ? 'flex' : 'none';
        chevron.style.transform = show ? 'rotate(180deg)' : '';
      };

      setupDateShortcuts(overlay, 'alh-online-date-from', 'alh-online-date-to');

      overlay.querySelectorAll('[data-action="cancel"]').forEach(btn => btn.onclick = () => closeOverlay(overlay));
      overlay.querySelector('[data-action="start"]').onclick = () => {
        const nicksVal = overlay.querySelector('#arz-online-nicks').value.trim();
        const nicks = nicksVal.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);

        if (nicks.length === 0) {
          window.ArizonaNotifications.show('Введите хотя бы один ник', 'error');
          return;
        }

        const dateFrom = overlay.querySelector('#alh-online-date-from').value;
        const dateTo = overlay.querySelector('#alh-online-date-to').value;
        const cleanOn = contentEl.style.display === 'flex';
        const stealthOn = overlay.querySelector('#arz-online-stealth').checked;

        localStorage.setItem('arz-clean-weekday-from', cleanOn ? overlay.querySelector('#alh-online-wd-from').value.trim() : '');
        localStorage.setItem('arz-clean-weekday-to', cleanOn ? overlay.querySelector('#alh-online-wd-to').value.trim() : '');
        localStorage.setItem('arz-clean-weekend-from', cleanOn ? overlay.querySelector('#alh-online-we-from').value.trim() : '');
        localStorage.setItem('arz-clean-weekend-to', cleanOn ? overlay.querySelector('#alh-online-we-to').value.trim() : '');
        localStorage.setItem('arz-online-stealth-enabled', stealthOn ? 'true' : 'false');

        closeOverlay(overlay);
        if (stealthOn) {
          processStealthOnline(nicks, dateFrom, dateTo);
        } else {
          processMultiplePlayers(nicks, dateFrom, dateTo);
        }
      };

    }

    return {
      init: function (s) {
        settings = s || {};
        if (context.automaticCalculationEnabled === false || context.currentSettings['extension-toggle'] === false || settings.tools?.online === false) {
          if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; calculated = false; }
          return;
        }
        if (settings.tools?.online !== false) {
          this.checkAutoCalculation();
        }
      },
      updateSettings: function (s) {
        settings = s || {};
        if (context.automaticCalculationEnabled === false || context.currentSettings['extension-toggle'] === false || settings.tools?.online === false) {
          if (autoTimer !== null) { clearTimeout(autoTimer); autoTimer = null; calculated = false; }
          return;
        }
        if (settings.tools?.online !== false) {
          this.checkAutoCalculation();
        }
      },
      injectButton: function () {
        if (document.getElementById('alh-online-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'alh-online-btn';
        btn.className = 'btn btn-success';
        btn.style.cssText = 'margin-left: 10px;';
        btn.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="margin-right:6px;"></i> Онлайн`;
        btn.onclick = openModal;
        container.appendChild(btn);
      },
      checkAutoCalculation: function () {
        if (context.automaticCalculationEnabled === false) return;
        const params = new URLSearchParams(window.location.search);
        if (context.currentSettings['extension-toggle'] !== false && settings.tools?.online !== false && params.get('arz_online') === '1' && !calculated) {
          calculated = true;
          autoTimer = setTimeout(() => {
            autoTimer = null;
            if (context.currentSettings['extension-toggle'] !== false && settings.tools?.online !== false) calculate();
            else calculated = false;
          }, 1000);
        }
      },
      processStealthOnline: processStealthOnline,
      processMultiplePlayers: processMultiplePlayers
    };
}
