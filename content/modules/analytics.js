export function create(context) {
  const { openOverlay, closeOverlay, setupDateShortcuts, fetchWithRetry, logOptions, isValidNickname, runWhenElementExists, getIpCellFromRow, parseAllIpsFromCell, calculateHaversineDistance, setupNickCounter, loadIpDetailsCache } = context;

    let settings = {};
    let currentModeIP = 'exact';
    let currentModeRepeats = 'exact';
    let currentThresholdRepeats = 2;
    let activeTab = 'similar-ips';

    const LEADER_ACTION_REGEX = /(снял.*выговор|снял.*спец.\s*выговор|принял во фракцию|принял в фракцию|повысил|изменил ранг|уволил|выдал выговор|выдал скин|выдал ранг|принял в орг)/i;
    const ADMIN_ACTION_REGEX = /(телепортировал|выдал|спавн|заспавнил|снял наказание|разбанил|выдал лицензию|пополнил|вылечил|выдал хп|выдал армор|выдал оружие|назначил|выдал скины|выдал аз)/i;
    const TRANSFER_REGEX = /(перевёл|перевел).*\$|перевёл.*на банк|перевел.*на банк|получил от игрока.*\$|передал игроку.*\$|потерял из инвентаря|причина:\s*(перевод денег|передача денег|передача предметов|трейд|торговля)|на банк|в банке/i;

    const modalHTML = `
      <div id="arz-analytics-overlay" class="alh-modal-overlay">
        <div class="arz-modal-container" style="max-width: 950px; width: 95%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper">
              <i class="fa-solid fa-chart-simple"></i>
            </div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Аналитика логов</div>
              <div class="arz-modal-subtitle">Поиск совпадений, повторов и пробив подозрительных сделок</div>
            </div>
            <button id="arz-analytics-close" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          
          <div class="arz-lookup-tabs" style="gap: 2px !important;">
            <button class="arz-tab-btn" data-tab="similar-ips"><i class="fa-solid fa-network-wired"></i> Похожие IP</button>
            <button class="arz-tab-btn" data-tab="repeats"><i class="fa-solid fa-rotate"></i> Повторы</button>
            <button class="arz-tab-btn" data-tab="leader-sales"><i class="fa-solid fa-user-tie"></i> Продажа лид. действий</button>
            <button class="arz-tab-btn" data-tab="admin-sales"><i class="fa-solid fa-user-ninja"></i> Продажа адм. действий</button>
            <button class="arz-tab-btn" data-tab="business"><i class="fa-solid fa-coins"></i> Финансы бизнеса</button>
          </div>
          
          <div class="alh-modal-body" style="gap: 16px !important; padding-top: 12px !important;">
            <div id="arz-analytics-tab-business" class="arz-tab-content" style="display:none; flex-direction:column; gap:12px">
              <div class="arz-business-intro"><i class="fa-solid fa-chart-line"></i><span>Поступления и расходы бизнеса за выбранный период с разбивкой по датам и дням недели.</span></div>
              <div class="arz-modal-form-group">
                <label for="arz-business-id" class="arz-modal-label"><i class="fa-solid fa-building"></i> ID бизнеса</label>
                <input id="arz-business-id" class="arz-input" type="number" min="1" step="1" placeholder="Например, 123">
              </div>
              <div class="arz-business-date-grid">
                <div class="arz-modal-form-group"><label for="arz-business-from" class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата от</label><input id="arz-business-from" class="arz-input" type="date"></div>
                <div class="arz-modal-form-group"><label for="arz-business-to" class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата до</label><input id="arz-business-to" class="arz-input" type="date"></div>
              </div>
              <div class="arz-date-shortcuts arz-business-shortcuts">
                <button type="button" class="arz-btn-shortcut" data-range="day">За день</button>
                <button type="button" class="arz-btn-shortcut" data-range="week">За неделю</button>
                <button type="button" class="arz-btn-shortcut" data-range="month">За месяц</button>
                <button type="button" class="arz-btn-shortcut" data-range="start-week">С начала недели</button>
                <button type="button" class="arz-btn-shortcut" data-range="start-month">С начала месяца</button>
                <button type="button" class="arz-btn-shortcut" data-range="start-year">С начала года</button>
              </div>
              <button id="arz-business-start" class="arz-btn-primary" type="button"><i class="fa-solid fa-magnifying-glass"></i> Рассчитать финансы</button>
              <div id="arz-business-result" aria-live="polite" aria-atomic="true"></div>
            </div>
            <div id="arz-analytics-tab-similar-ips" class="arz-tab-content" style="display: flex; flex-direction: column; gap: 12px;">
              <div class="arz-modal-form-group">
                <label class="arz-modal-label"><i class="fa-solid fa-sliders"></i> Режим сравнения IP (по текущей странице)</label>
                <div style="display: flex; gap: 8px; background: var(--az-input-bg); padding: 6px; border-radius: 14px; border: 1px solid var(--az-border);">
                  <button type="button" class="similar-mode-btn active" data-mode="exact" style="flex: 1; padding: 8px 12px; border: none; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); color: white;">Точный IP</button>
                  <button type="button" class="similar-mode-btn" data-mode="subnet24" style="flex: 1; padding: 8px 12px; border: none; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: transparent; color: var(--az-text-secondary);">Подсеть /24 (Похожие)</button>
                  <button type="button" class="similar-mode-btn" data-mode="subnet16" style="flex: 1; padding: 8px 12px; border: none; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: transparent; color: var(--az-text-secondary);">Подсеть /16 (Провайдер)</button>
                </div>
              </div>
              
              <div class="arz-modal-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label class="arz-modal-label"><i class="fa-solid fa-list-check"></i> Найденные совпадения</label>
                  <span id="arz-similar-groups-count" style="background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 30px;">0 групп</span>
                </div>
                <div id="arz-similar-groups-list" class="arz-list-container" style="max-height: 450px; overflow-y: auto;"></div>
              </div>
            </div>

            <div id="arz-analytics-tab-repeats" class="arz-tab-content" style="display: none; flex-direction: column; gap: 12px;">
              <div style="display: flex; gap: 12px; align-items: flex-end;">
                <div class="arz-modal-form-group" style="flex: 2;">
                  <label class="arz-modal-label"><i class="fa-solid fa-sliders"></i> Режим сопоставления</label>
                  <div style="display: flex; gap: 6px; background: var(--az-input-bg); padding: 4px; border-radius: 12px; border: 1px solid var(--az-border);">
                    <button type="button" class="repeats-mode-btn active" data-mode="exact" style="flex: 1; padding: 6px 10px; border: none; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); color: white;">Полный лог</button>
                    <button type="button" class="repeats-mode-btn" data-mode="actionOnly" style="flex: 1; padding: 6px 10px; border: none; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: transparent; color: var(--az-text-secondary);">Только действие</button>
                  </div>
                </div>
                <div class="arz-modal-form-group" style="flex: 1;">
                  <label class="arz-modal-label"><i class="fa-solid fa-arrow-up-9-1"></i> Повторов от</label>
                  <input type="number" id="arz-repeats-threshold" class="arz-input" min="2" max="100" value="2" style="padding: 6px 10px !important; text-align: center;">
                </div>
              </div>
              
              <div class="arz-modal-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <label class="arz-modal-label"><i class="fa-solid fa-list-check"></i> Обнаруженные повторы</label>
                  <span id="arz-repeats-groups-count" style="background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 30px;">0 групп</span>
                </div>
                <div id="arz-repeats-groups-list" class="arz-list-container" style="max-height: 450px; overflow-y: auto;"></div>
              </div>
            </div>

            <div id="arz-analytics-tab-leader-sales" class="arz-tab-content" style="display: none; flex-direction: column; gap: 12px;">
              <div style="font-size: 12px; color: var(--az-text-secondary); line-height: 1.4; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i>
                <span>Пробив истории логов лидеров: Поиск пар "Лидерское действие + Передача средств от того же игрока за 15 минут".</span>
              </div>
              <div class="arz-modal-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <label class="arz-modal-label" style="margin: 0;"><i class="fa-solid fa-user-tie"></i> Ник(и) лидеров / заместителей</label>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: var(--az-text-secondary); background: var(--az-input-bg); border: 1px solid var(--az-border); padding: 2px 8px; border-radius: 12px; white-space: nowrap;">Введено: <strong id="arz-leader-sales-count-num" style="color: var(--az-accent-hover);">0</strong></span>
                    <span id="arz-leader-extract-btn" style="font-size: 11px; color: var(--az-accent-hover); cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; border-bottom: 1px dashed currentColor; white-space: nowrap;" title="Извлечь ники Nick_Name из любого текста"><i class="fa-solid fa-wand-magic-sparkles"></i> Извлечь ники</span>
                  </div>
                </div>
                <textarea id="arz-leader-sales-nicks" class="arz-textarea" rows="3" placeholder="Введите никнеймы лидеров (каждый с новой строки или через запятую)"></textarea>
              </div>
              <div style="display: flex; gap: 12px; width: 100%; box-sizing: border-box;">
                <div class="arz-modal-form-group" style="flex: 1;">
                  <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата от</label>
                  <input type="date" id="arz-leader-sales-date-from" class="arz-input">
                </div>
                <div class="arz-modal-form-group" style="flex: 1;">
                  <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата до</label>
                  <input type="date" id="arz-leader-sales-date-to" class="arz-input">
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
              <button type="button" id="arz-start-leader-sales-btn" class="arz-btn-primary" style="margin-top: 4px;"><i class="fa-solid fa-magnifying-glass"></i> Пробить логи лидеров</button>
            </div>

            <div id="arz-analytics-tab-admin-sales" class="arz-tab-content" style="display: none; flex-direction: column; gap: 12px;">
              <div style="font-size: 12px; color: var(--az-text-secondary); line-height: 1.4; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444;"></i>
                <span>Пробив истории логов админов: Поиск пар "Админское действие + Передача средств от того же игрока за 15 минут".</span>
              </div>
              <div class="arz-modal-form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <label class="arz-modal-label" style="margin: 0;"><i class="fa-solid fa-user-ninja"></i> Ник(и) администраторов</label>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 11px; color: var(--az-text-secondary); background: var(--az-input-bg); border: 1px solid var(--az-border); padding: 2px 8px; border-radius: 12px; white-space: nowrap;">Введено: <strong id="arz-admin-sales-count-num" style="color: var(--az-accent-hover);">0</strong></span>
                    <span id="arz-admin-extract-btn" style="font-size: 11px; color: var(--az-accent-hover); cursor: pointer; display: flex; align-items: center; gap: 4px; user-select: none; border-bottom: 1px dashed currentColor; white-space: nowrap;" title="Извлечь ники Nick_Name из любого текста"><i class="fa-solid fa-wand-magic-sparkles"></i> Извлечь ники</span>
                  </div>
                </div>
                <textarea id="arz-admin-sales-nicks" class="arz-textarea" rows="3" placeholder="Введите никнеймы админов (каждый с новой строки или через запятую)"></textarea>
              </div>
              <div style="display: flex; gap: 12px; width: 100%; box-sizing: border-box;">
                <div class="arz-modal-form-group" style="flex: 1;">
                  <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата от</label>
                  <input type="date" id="arz-admin-sales-date-from" class="arz-input">
                </div>
                <div class="arz-modal-form-group" style="flex: 1;">
                  <label class="arz-modal-label"><i class="fa-regular fa-calendar"></i> Дата до</label>
                  <input type="date" id="arz-admin-sales-date-to" class="arz-input">
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
              <button type="button" id="arz-start-admin-sales-btn" class="arz-btn-primary" style="margin-top: 4px;"><i class="fa-solid fa-magnifying-glass"></i> Пробить логи админов</button>
            </div>
          </div>
          
          <div class="alh-modal-footer">
            <button id="arz-analytics-reset" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-rotate-left"></i> Сбросить фильтр</button>
            <button id="arz-analytics-show-all" class="arz-btn-primary" style="flex: 1.5;"><i class="fa-solid fa-eye"></i> Показать все на странице</button>
          </div>
        </div>
      </div>
    `;

    function extractNicksFromRow(row) {
      const nicks = new Set();
      row.querySelectorAll('a[href*="player="], a[href*="player"]').forEach(lnk => {
        let text = '';
        if (lnk.href) {
          try {
            const url = new URL(lnk.href, window.location.origin);
            text = url.searchParams.get('player') || '';
          } catch (e) { }
        }
        if (!text) text = lnk.textContent.trim();
        if (text && isValidNickname(text)) nicks.add(text);
      });
      row.querySelectorAll('a strong').forEach(el => {
        const text = el.textContent.trim();
        if (text && isValidNickname(text)) nicks.add(text);
      });
      const textContent = (row.cells[1]?.textContent || '') + ' ' + (row.cells[2]?.textContent || '');
      const nickRegex = /\b[A-Z][a-zA-Z0-9]*_[A-Za-z0-9_]+\b/g;
      const matches = textContent.match(nickRegex);
      if (matches) {
        matches.forEach(m => {
          if (isValidNickname(m)) nicks.add(m);
        });
      }
      return Array.from(nicks);
    }

    function parseLogRowTime(row) {
      const cell = row.cells[0];
      if (!cell) return null;
      const text = cell.textContent.trim();
      const m = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
      if (m) {
        return new Date(`${m[1]}T${m[2]}`);
      }
      return null;
    }

    function extractIpsFromRow(row) {
      const ips = new Set();
      const ipCell = getIpCellFromRow(row);
      if (!ipCell) return [];

      if (typeof parseAllIpsFromCell === 'function') {
        const pairs = parseAllIpsFromCell(ipCell);
        if (pairs && pairs.length > 0) {
          pairs.forEach(pair => {
            if (pair.lastIp && !pair.lastIp.includes('*')) ips.add(pair.lastIp);
            if (pair.regIp && !pair.regIp.includes('*')) ips.add(pair.regIp);
          });
        }
      }

      const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
      const textMatches = ipCell.textContent.match(ipRegex);
      if (textMatches) {
        textMatches.forEach(ip => ips.add(ip));
      }

      return Array.from(ips);
    }

    function getIpKey(ip, mode) {
      const parts = ip.split('.');
      if (parts.length < 4) return null;
      if (mode === 'subnet24') {
        return parts.slice(0, 3).join('.') + '.X';
      }
      if (mode === 'subnet16') {
        return parts.slice(0, 2).join('.') + '.X.X';
      }
      return ip;
    }

    function extractNickIpPairsFromRow(row) {
      const nicks = extractNicksFromRow(row);
      const ipCell = getIpCellFromRow(row);
      if (!ipCell || nicks.length === 0) return [];

      const pairs = typeof parseAllIpsFromCell === 'function' ? parseAllIpsFromCell(ipCell) : [];
      const result = [];

      if (pairs.length > 0) {
        pairs.forEach((pair, idx) => {
          let targetNick = null;
          const prefix = (pair.prefix || '').toUpperCase();

          if (prefix.includes('II') || prefix.includes('2')) {
            targetNick = nicks[1] || null;
          } else if (prefix.includes('I') || prefix.includes('1') || idx === 0) {
            targetNick = nicks[0] || null;
          }

          if (targetNick) {
            if (pair.lastIp && !pair.lastIp.includes('*')) {
              result.push({ nick: targetNick, ip: pair.lastIp });
            }
            if (pair.regIp && !pair.regIp.includes('*') && pair.regIp !== '255.255.255.255') {
              result.push({ nick: targetNick, ip: pair.regIp });
            }
          }
        });
      } else {
        const rawIps = extractIpsFromRow(row);
        if (nicks[0] && rawIps.length > 0) {
          rawIps.forEach(ip => result.push({ nick: nicks[0], ip: ip }));
        }
      }

      return result;
    }

    function scanAndGroupIPs(mode) {
      const rows = document.querySelectorAll('table.table tbody tr');
      const groups = {};

      rows.forEach(row => {
        const nickIpPairs = extractNickIpPairsFromRow(row);
        if (nickIpPairs.length === 0) return;

        nickIpPairs.forEach(({ nick, ip }) => {
          const key = getIpKey(ip, mode);
          if (!key) return;

          if (!groups[key]) {
            groups[key] = {
              key: key,
              ips: new Set(),
              nicks: new Set(),
              nickDistances: {},
              rows: []
            };
          }
          groups[key].ips.add(ip);
          groups[key].nicks.add(nick);

          let distanceText = '';
          const ipCell = getIpCellFromRow(row);
          if (ipCell && typeof parseAllIpsFromCell === 'function') {
            const pairs = parseAllIpsFromCell(ipCell);
            if (pairs && pairs[0]) {
              const pair = pairs[0];
              const regData = pair.regIp ? context.ipDetailsCache[pair.regIp] : null;
              const lastData = pair.lastIp ? context.ipDetailsCache[pair.lastIp] : null;
              if (regData && lastData && regData.lat && regData.lon && lastData.lat && lastData.lon) {
                const dist = calculateHaversineDistance(regData.lat, regData.lon, lastData.lat, lastData.lon);
                if (dist !== null) {
                  distanceText = `~${Math.round(dist)}km`;
                }
              }
            }
          }
          if (distanceText) {
            if (!groups[key].nickDistances[nick]) {
              groups[key].nickDistances[nick] = new Set();
            }
            groups[key].nickDistances[nick].add(distanceText);
          }

          if (!groups[key].rows.includes(row)) {
            groups[key].rows.push(row);
          }
        });
      });

      return Object.values(groups).filter(g => g.nicks.size > 1);
    }

    function scanAndGroupRepeats(mode, threshold) {
      const rows = document.querySelectorAll('table.table tbody tr');
      const groups = {};

      rows.forEach(row => {
        const nicks = extractNicksFromRow(row);

        const actionCell = row.cells[1];
        const dataCell = row.cells[2];
        if (!actionCell) return;

        const cleanCell = (cell) => {
          if (!cell) return '';
          const clone = cell.cloneNode(true);
          clone.querySelectorAll('.arz-row-actions-wrapper, .arz-cell-copy-btn, .arz-log-copy-menu-btn, .alh-col-eye-btn, .badge, .bi, svg, i, .az-geo-inserted, .arizona-ecosystem-badge').forEach(el => el.remove());
          const ipGeoRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b(?:\s*\([^)]*\))?(?:\s*~\d+(?:\.\d+)?km)?/g;
          return clone.textContent.replace(ipGeoRegex, '').replace(/\s+/g, ' ').trim();
        };

        let actionText = cleanCell(actionCell);
        if (mode === 'exact' && dataCell) {
          actionText += ' | ' + cleanCell(dataCell);
        }
        if (!actionText) return;

        if (nicks.length > 0) {
          nicks.forEach(nick => {
            const key = nick + '::' + actionText;
            if (!groups[key]) {
              groups[key] = {
                nick: nick,
                actionText: actionText,
                rows: []
              };
            }
            groups[key].rows.push(row);
          });
        } else {
          const key = 'NO_NICK::' + actionText;
          if (!groups[key]) {
            groups[key] = {
              nick: 'Без ника',
              actionText: actionText,
              rows: []
            };
          }
          groups[key].rows.push(row);
        }
      });

      return Object.values(groups).filter(g => g.rows.length >= threshold);
    }

    async function processSalesProbing(nicks, dateFrom, dateTo, type) {
      let cancelBatch = false;

      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'alh-modal-overlay';
      progressOverlay.innerHTML = `
        <div class="arz-modal-container" style="max-width: 400px; width: 90%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Пробив продажи услуг</div>
              <div class="arz-modal-subtitle">Анализ истории логов ${type === 'leader' ? 'лидеров' : 'админов'}...</div>
            </div>
          </div>
          <div class="alh-modal-body" style="padding: 24px; text-align: center;">
            <div id="arz-progress-player" style="font-size: 16px; font-weight: 600; color: #ffffff; margin-bottom: 8px;">Запуск...</div>
            <div id="arz-progress-status" style="font-size: 13px; color: #9aa0a6; margin-bottom: 20px;">Загрузка логов с сервера</div>
            
            <div class="arz-progress-bar-container" style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 3px; overflow: hidden; margin-bottom: 24px;">
              <div id="alh-progress-bar-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ef4444 0%, #ff7373 100%); transition: width 0.3s ease; border-radius: 3px;"></div>
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
        window.ArizonaNotifications.show('Пробив отменен', 'warning');
      };

      const allMatches = [];

      for (let i = 0; i < nicks.length; i++) {
        if (cancelBatch) break;
        const mainNick = nicks[i];

        playerTextEl.textContent = mainNick;
        statusTextEl.textContent = `Загрузка логов (${i + 1} из ${nicks.length})`;
        barFillEl.style.width = `${Math.round((i / nicks.length) * 100)}%`;

        try {
          const fetchUrl = new URL(window.location.href);
          fetchUrl.searchParams.set('player', mainNick);
          fetchUrl.searchParams.set('limit', '1000');
          fetchUrl.searchParams.set('sort', 'desc');
          fetchUrl.searchParams.delete('type[]');
          fetchUrl.searchParams.delete('arz_online');
          fetchUrl.searchParams.delete('arz_punish');

          if (dateFrom) fetchUrl.searchParams.set('min_period', dateFrom + ' 00:00:00');
          if (dateTo) fetchUrl.searchParams.set('max_period', dateTo + ' 23:59:59');

          const response = await fetchWithRetry(fetchUrl.href, logOptions(progressOverlay));
          if (!response.ok) {
            throw new Error(`Ошибка запроса: ${response.status}`);
          }
          const htmlText = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, 'text/html');

          const rows = doc.querySelectorAll('table.table tbody tr');
          const parsedLogs = [];

          rows.forEach(row => {
            const cells = row.cells;
            if (cells.length < 2) return;
            const timeStr = cells[0]?.textContent?.trim() || '';
            const actionText = (cells[1]?.textContent || '').replace(/\s+/g, ' ').trim();
            const dateObj = parseLogRowTime(row);
            if (!dateObj) return;

            const nicksInLine = extractNicksFromRow(row);

            parsedLogs.push({
              timeStr,
              timestamp: dateObj.getTime(),
              text: actionText,
              nicks: nicksInLine
            });
          });

          const actionRegex = type === 'leader' ? LEADER_ACTION_REGEX : ADMIN_ACTION_REGEX;
          const actionLogs = parsedLogs.filter(p => actionRegex.test(p.text));
          const transferLogs = parsedLogs.filter(p => TRANSFER_REGEX.test(p.text));

          actionLogs.forEach(actLog => {
            transferLogs.forEach(transLog => {
              if (actLog === transLog) return;
              const diffSec = Math.abs(actLog.timestamp - transLog.timestamp) / 1000;
              if (diffSec <= 900) {
                const commonNicks = actLog.nicks.filter(n => transLog.nicks.includes(n));
                if (commonNicks.length >= 2) {
                  allMatches.push({
                    mainNick,
                    actionLog: actLog,
                    transferLog: transLog,
                    nicks: commonNicks,
                    diffSec: Math.round(diffSec)
                  });
                }
              }
            });
          });

        } catch (err) {
          if (err.name === 'AbortError') { cancelBatch = true; break; }
          console.error(`Error probing sales for ${mainNick}:`, err);
        }

      }

      if (!cancelBatch) {
        closeOverlay(progressOverlay);
        renderSalesResultsModal(allMatches, type);
      }
    }

    function renderSalesResultsModal(matches, type) {
      let cardsHtml = '';
      const copyLines = [`Результаты пробива продажи ${type === 'leader' ? 'лидерских' : 'админских'} услуг:`];

      if (matches.length === 0) {
        cardsHtml = `
          <div class="alh-empty-state">
            <i class="fa-solid fa-circle-check" style="font-size: 28px; color: #10b981;"></i>
            <span>Подозрительных совпадений за указанный период не обнаружено</span>
          </div>
        `;
      } else {
        matches.forEach((m, idx) => {
          const timeDiffStr = m.diffSec < 60 ? `${m.diffSec} сек.` : `${Math.round(m.diffSec / 60)} мин.`;
          const titleIcon = type === 'leader' ? 'fa-user-tie' : 'fa-user-ninja';

          cardsHtml += `
            <div class="arz-sales-card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 13px; font-weight: 700; color: var(--az-text);">
                  <i class="fa-solid ${titleIcon}" style="color: #ef4444; margin-right: 6px;"></i> ${m.nicks.join(' ↔ ')}
                </span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="arz-sales-badge"><i class="fa-solid fa-stopwatch"></i> разница: ${timeDiffStr}</span>
                  <button type="button" class="arz-btn-secondary arz-copy-pair-btn" data-index="${idx}" title="Скопировать эту пару логов" style="padding: 2px 8px !important; font-size: 11px !important; height: auto !important;">
                    <i class="fa-regular fa-copy"></i>
                  </button>
                </div>
              </div>
              <div class="arz-sales-log-item">
                <div style="font-size: 10px; color: var(--az-text-secondary); margin-bottom: 2px;">${m.actionLog.timeStr}</div>
                <div>${window.ArizonaUtils.escapeHtml(m.actionLog.text)}</div>
              </div>
              <div class="arz-sales-log-item transfer">
                <div style="font-size: 10px; color: var(--az-text-secondary); margin-bottom: 2px;">${m.transferLog.timeStr}</div>
                <div>${window.ArizonaUtils.escapeHtml(m.transferLog.text)}</div>
              </div>
            </div>
          `;

          copyLines.push(`${m.actionLog.timeStr} | ${m.actionLog.text}\n${m.transferLog.timeStr} | ${m.transferLog.text}\n`);
        });
      }

      const copyText = copyLines.join('\n');

      const overlay = document.createElement('div');
      overlay.className = 'alh-modal-overlay';
      overlay.innerHTML = `
        <div class="arz-modal-container" style="max-width: 950px; width: 95%;">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Результаты пробива продажи услуг</div>
              <div class="arz-modal-subtitle">Обнаружено совпадений: ${matches.length}</div>
            </div>
            <button id="arz-sales-results-close-header" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="online-result-table-wrapper" style="max-height: 420px; overflow-y: auto; padding: 16px; background: var(--az-input-bg); border-bottom: 1px solid var(--az-border);">
            ${cardsHtml}
          </div>
          <div class="alh-modal-footer">
            <button id="arz-sales-copy-btn" class="arz-btn-primary" style="flex: 2;"><i class="fa-regular fa-copy"></i> Скопировать все найденные логи</button>
            <button id="arz-sales-close-btn" class="arz-btn-danger" style="flex: 1;"><i class="fa-solid fa-xmark"></i> Закрыть</button>
          </div>
        </div>
      `;

      openOverlay(overlay);

      overlay.querySelector('#arz-sales-close-btn').onclick = () => closeOverlay(overlay);
      overlay.querySelector('#arz-sales-results-close-header').onclick = () => closeOverlay(overlay);

      overlay.querySelectorAll('.arz-copy-pair-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index'), 10);
          const item = matches[idx];
          if (!item) return;

          const pairText = `${item.actionLog.timeStr} | ${item.actionLog.text}\n${item.transferLog.timeStr} | ${item.transferLog.text}`;
          navigator.clipboard.writeText(pairText).then(() => {
            const icon = btn.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-check';
            btn.style.color = '#28c76f';
            setTimeout(() => {
              if (icon) icon.className = 'fa-regular fa-copy';
              btn.style.color = '';
            }, 1500);
          });
        };
      });

      overlay.querySelector('#arz-sales-copy-btn').onclick = () => {
        navigator.clipboard.writeText(copyText).then(() => {
          const btn = overlay.querySelector('#arz-sales-copy-btn');
          btn.innerHTML = '<i class="fa-solid fa-check"></i> Скопировано!';
          setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i> Скопировать все найденные логи', 2000);
        });
      };
    }

    function renderIPs(modal, groups) {
      const listContainer = modal.querySelector('#arz-similar-groups-list');
      const countBadge = modal.querySelector('#arz-similar-groups-count');
      if (!listContainer) return;

      listContainer.innerHTML = '';
      countBadge.textContent = `${groups.length} групп`;

      if (groups.length === 0) {
        listContainer.innerHTML = `
          <div class="alh-empty-state">
            <i class="fa-solid fa-face-smile" style="font-size: 24px; color: var(--az-text-secondary);"></i>
            <span>Совпадений не найдено</span>
          </div>
        `;
        return;
      }

      groups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'arz-similar-group-card';
        card.style.cursor = 'pointer';

        const sortedIps = Array.from(group.ips).join(', ');
        const formattedNicks = Array.from(group.nicks).map(nick => {
          const distSet = group.nickDistances && group.nickDistances[nick];
          const distArray = distSet ? Array.from(distSet).filter(Boolean) : [];
          if (distArray.length > 0) {
            return `${nick} (${distArray.join('/')})`;
          }
          return nick;
        }).join(', ');

        const countText = group.nicks.size > 0 ? `${group.nicks.size} акк.` : `${group.rows.length} лог.`;
        const accountListText = formattedNicks.length > 0 ? formattedNicks : `${group.rows.length} записей`;

        card.innerHTML = `
          <div class="arz-similar-group-title">
            <span><i class="fa-solid fa-network-wired" style="color: var(--az-accent-hover); margin-right: 6px;"></i> ${group.key}</span>
            <span class="badge" style="background: rgba(var(--az-accent-rgb), 0.1); color: var(--az-accent-hover); border: 1px solid rgba(var(--az-accent-rgb), 0.2);">${countText}</span>
          </div>
          <div class="arz-similar-group-nicks">
            Аккаунты: <strong>${accountListText}</strong>
          </div>
          <div class="arz-similar-group-ips">
            IP: ${sortedIps}
          </div>
        `;

        card.onclick = () => {
          const tableRows = document.querySelectorAll('table.table tbody tr');
          tableRows.forEach(row => {
            if (group.rows.includes(row)) {
              row.style.display = '';
            } else {
              row.style.display = 'none';
            }
          });
          window.ArizonaNotifications.show(`Показано ${group.rows.length} логов для ${group.key}`, 'success');
          closeOverlay(modal);
        };

        listContainer.appendChild(card);
      });
    }

    function renderRepeats(modal, groups) {
      const listContainer = modal.querySelector('#arz-repeats-groups-list');
      const countBadge = modal.querySelector('#arz-repeats-groups-count');
      if (!listContainer) return;

      listContainer.innerHTML = '';
      countBadge.textContent = `${groups.length} групп`;

      if (groups.length === 0) {
        listContainer.innerHTML = `
          <div class="alh-empty-state">
            <i class="fa-solid fa-face-smile" style="font-size: 24px; color: var(--az-text-secondary);"></i>
            <span>Повторов не найдено</span>
          </div>
        `;
        return;
      }

      groups.forEach(group => {
        const card = document.createElement('div');
        card.className = 'arz-repeat-group-card';
        card.style.cursor = 'pointer';

        card.innerHTML = `
          <div class="arz-repeat-group-title">
            <span><i class="fa-solid fa-user" style="color: var(--az-accent-hover); margin-right: 6px;"></i> ${group.nick}</span>
            <span class="badge" style="background: rgba(var(--az-accent-rgb), 0.1); color: var(--az-accent-hover); border: 1px solid rgba(var(--az-accent-rgb), 0.2);">${group.rows.length} повт.</span>
          </div>
          <div class="arz-repeat-group-desc">
            Действие: <strong>${window.ArizonaUtils.escapeHtml(group.actionText)}</strong>
          </div>
        `;

        card.onclick = () => {
          const tableRows = document.querySelectorAll('table.table tbody tr');
          tableRows.forEach(row => {
            if (group.rows.includes(row)) {
              row.style.display = '';
            } else {
              row.style.display = 'none';
            }
          });
          window.ArizonaNotifications.show(`Показано ${group.rows.length} повторов для ${group.nick}`, 'success');
          closeOverlay(modal);
        };

        listContainer.appendChild(card);
      });
    }

    async function setupModal(modal) {
      modal.querySelector('#arz-analytics-close').onclick = () => closeOverlay(modal);

      const tabs = modal.querySelectorAll('.arz-tab-btn');
      const footer = modal.querySelector('.alh-modal-footer');

      tabs.forEach(tab => {
        tab.onclick = () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeTab = tab.dataset.tab;

          modal.querySelector('#arz-analytics-tab-similar-ips').style.display = activeTab === 'similar-ips' ? 'flex' : 'none';
          modal.querySelector('#arz-analytics-tab-repeats').style.display = activeTab === 'repeats' ? 'flex' : 'none';
          modal.querySelector('#arz-analytics-tab-leader-sales').style.display = activeTab === 'leader-sales' ? 'flex' : 'none';
          modal.querySelector('#arz-analytics-tab-admin-sales').style.display = activeTab === 'admin-sales' ? 'flex' : 'none';
          modal.querySelector('#arz-analytics-tab-business').style.display = activeTab === 'business' ? 'flex' : 'none';

          if (footer) {
            if (activeTab === 'similar-ips' || activeTab === 'repeats') {
              footer.style.display = 'flex';
            } else {
              footer.style.display = 'none';
            }
          }
        };
      });

      const businessPanel = modal.querySelector('#arz-analytics-tab-business');
      setupDateShortcuts(businessPanel, 'arz-business-from', 'arz-business-to');
      const businessParams = new URLSearchParams(location.search);
      for (const [field, param] of [['from', 'min_period'], ['to', 'max_period']]) {
        modal.querySelector(`#arz-business-${field}`).value = businessParams.get(param)?.split(' ')[0] || '';
      }
      const businessMessage = (text, icon, state = '') => {
        const result = modal.querySelector('#arz-business-result');
        result.replaceChildren();
        const box = document.createElement('div');
        box.className = `arz-business-message ${state}`;
        const symbol = document.createElement('i');
        symbol.className = `fa-solid ${icon}`;
        const label = document.createElement('span');
        label.textContent = text;
        box.append(symbol, label);
        result.appendChild(box);
      };
      businessMessage('Укажите бизнес и период, чтобы получить финансовую сводку.', 'fa-chart-pie');
      modal.querySelector('#arz-business-start').onclick = async event => {
        const button = event.currentTarget;
        const result = modal.querySelector('#arz-business-result');
        const id = modal.querySelector('#arz-business-id').value;
        const from = modal.querySelector('#arz-business-from').value;
        const to = modal.querySelector('#arz-business-to').value;
        if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || !from || !to || from > to) { businessMessage('Укажите положительный ID бизнеса и корректный период.', 'fa-circle-exclamation', 'is-error'); return; }
        button.disabled = true;
        const totals = new Map();
        const weekdays = Array.from({ length: 7 }, () => [0, 0]);
        try {
          const url = new URL(location.pathname, location.origin);
          const server = new URL(location.href).searchParams.get('server_number');
          if (server) url.searchParams.set('server_number', server);
          url.searchParams.set('type[]', 'bizbank');
          url.searchParams.set('dynamic[328]', id);
          url.searchParams.set('min_period', `${from} 00:00:00`);
          url.searchParams.set('max_period', `${to} 23:59:59`);
          url.searchParams.set('limit', '1000');
          url.searchParams.set('sort', 'desc');
          let page = 1;
          let last = 1;
          do {
            url.searchParams.set('page', page);
            businessMessage(`Загрузка страницы ${page}${last > 1 ? ` из ${last}` : ''}…`, 'fa-spinner fa-spin');
            const response = await fetchWithRetry(url.href, logOptions(modal));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            for (const link of doc.querySelectorAll('.pagination a[href]')) {
              const value = Number(new URL(link.getAttribute('href'), url).searchParams.get('page'));
              if (value > last) last = value;
            }
            for (const row of doc.querySelectorAll('table.table tbody tr')) {
              const date = row.cells[0]?.textContent.match(/\d{4}-\d{2}-\d{2}/)?.[0];
              const action = row.cells[1]?.textContent.match(/Бизнес\s+ID:\s*(\d+)\s+(получил|потратил)\s+([\d.,]+)\s*\$/i);
              if (!date || !action || action[1] !== id) continue;
              const bucket = totals.get(date) || [0, 0];
              const index = action[2].toLowerCase() === 'получил' ? 0 : 1;
              const amount = Number(action[3].replace(/[,.]/g, ''));
              bucket[index] += amount;
              totals.set(date, bucket);
              weekdays[new Date(`${date}T12:00:00`).getDay()][index] += amount;
            }
            page++;
          } while (page <= last);
          const sum = [...totals.values()].reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
          if (!totals.size) { businessMessage('За выбранный период операций бизнеса не найдено.', 'fa-folder-open'); return; }
          const money = amount => `${amount.toLocaleString('ru-RU')} $`;
          result.replaceChildren();
          const heading = document.createElement('div');
          heading.className = 'arz-business-result-heading';
          heading.textContent = `Бизнес #${id} · ${from.split('-').reverse().join('.')} — ${to.split('-').reverse().join('.')}`;
          const cards = document.createElement('div');
          cards.className = 'arz-business-summary';
          for (const [title, amount, tone, icon] of [['Поступления', sum[0], 'income', 'fa-arrow-trend-up'], ['Расходы', sum[1], 'expense', 'fa-arrow-trend-down'], ['Разница', sum[0] - sum[1], sum[0] >= sum[1] ? 'income' : 'expense', 'fa-scale-balanced']]) {
            const card = document.createElement('div');
            card.className = `arz-business-card ${tone}`;
            const label = document.createElement('span');
            label.innerHTML = `<i class="fa-solid ${icon}"></i> ${title}`;
            const value = document.createElement('strong');
            value.textContent = money(amount);
            card.append(label, value);
            cards.appendChild(card);
          }
          result.append(heading, cards);
          const table = (title, firstColumn, entries) => {
            const section = document.createElement('section');
            section.className = 'arz-business-breakdown';
            const caption = document.createElement('h4');
            caption.textContent = title;
            const wrapper = document.createElement('div');
            wrapper.className = 'arz-business-table-scroll';
            const element = document.createElement('table');
            element.innerHTML = `<thead><tr><th>${firstColumn}</th><th>Поступления</th><th>Расходы</th><th>Разница</th></tr></thead>`;
            const body = document.createElement('tbody');
            for (const [label, pair] of entries) {
              const row = document.createElement('tr');
              [label, money(pair[0]), money(pair[1]), money(pair[0] - pair[1])].forEach((value, index) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                cell.className = index === 1 ? 'income' : index === 2 ? 'expense' : '';
                row.appendChild(cell);
              });
              body.appendChild(row);
            }
            element.appendChild(body);
            wrapper.appendChild(element);
            section.append(caption, wrapper);
            result.appendChild(section);
          };
          table('По датам', 'Дата', [...totals].sort().map(([date, pair]) => [date.split('-').reverse().join('.'), pair]));
          table('По дням недели', 'День недели', [1, 2, 3, 4, 5, 6, 0].map(index => [['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][index], weekdays[index]]));
        } catch (error) { businessMessage(`Не удалось рассчитать финансы: ${error.message}`, 'fa-circle-exclamation', 'is-error'); }
        finally { button.disabled = false; }
      };

      const leaderTabContainer = modal.querySelector('#arz-analytics-tab-leader-sales');
      const adminTabContainer = modal.querySelector('#arz-analytics-tab-admin-sales');

      if (leaderTabContainer) setupDateShortcuts(leaderTabContainer, 'arz-leader-sales-date-from', 'arz-leader-sales-date-to');
      if (adminTabContainer) setupDateShortcuts(adminTabContainer, 'arz-admin-sales-date-from', 'arz-admin-sales-date-to');

      if (typeof setupNickCounter === 'function') {
        setupNickCounter(modal, '#arz-leader-sales-nicks', 'arz-leader-sales-count-num');
        setupNickCounter(modal, '#arz-admin-sales-nicks', 'arz-admin-sales-count-num');
      }

      const setupExtractBtn = (btnId, textareaId) => {
        const btn = modal.querySelector('#' + btnId);
        if (btn) {
          btn.onclick = (e) => {
            e.preventDefault();
            const textarea = modal.querySelector('#' + textareaId);
            if (!textarea) return;
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
        }
      };

      setupExtractBtn('arz-leader-extract-btn', 'arz-leader-sales-nicks');
      setupExtractBtn('arz-admin-extract-btn', 'arz-admin-sales-nicks');

      const params = new URLSearchParams(window.location.search);
      const urlMin = params.get('min_period');
      const urlMax = params.get('max_period');
      if (urlMin) {
        modal.querySelector('#arz-leader-sales-date-from').value = urlMin.split(' ')[0];
        modal.querySelector('#arz-admin-sales-date-from').value = urlMin.split(' ')[0];
      }
      if (urlMax) {
        modal.querySelector('#arz-leader-sales-date-to').value = urlMax.split(' ')[0];
        modal.querySelector('#arz-admin-sales-date-to').value = urlMax.split(' ')[0];
      }

      modal.querySelector('#arz-start-leader-sales-btn').onclick = () => {
        const val = modal.querySelector('#arz-leader-sales-nicks').value.trim();
        const nicks = val.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
        if (nicks.length === 0) {
          window.ArizonaNotifications.show('Введите хотя бы один ник лидера', 'error');
          return;
        }
        const df = modal.querySelector('#arz-leader-sales-date-from').value;
        const dt = modal.querySelector('#arz-leader-sales-date-to').value;
        closeOverlay(modal);
        processSalesProbing(nicks, df, dt, 'leader');
      };

      modal.querySelector('#arz-start-admin-sales-btn').onclick = () => {
        const val = modal.querySelector('#arz-admin-sales-nicks').value.trim();
        const nicks = val.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
        if (nicks.length === 0) {
          window.ArizonaNotifications.show('Введите хотя бы один ник админа', 'error');
          return;
        }
        const df = modal.querySelector('#arz-admin-sales-date-from').value;
        const dt = modal.querySelector('#arz-admin-sales-date-to').value;
        closeOverlay(modal);
        processSalesProbing(nicks, df, dt, 'admin');
      };

      modal.querySelector('[data-tab="similar-ips"]').classList.add('active');
      modal.querySelector('#arz-analytics-tab-similar-ips').style.display = 'flex';
      if (footer) footer.style.display = 'flex';

      if (typeof loadIpDetailsCache === 'function') {
        await loadIpDetailsCache();
      }

      const similarModeButtons = modal.querySelectorAll('.similar-mode-btn');
      similarModeButtons.forEach(btn => {
        btn.onclick = async () => {
          similarModeButtons.forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = 'var(--az-text-secondary)';
          });
          btn.classList.add('active');
          btn.style.background = 'linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%)';
          btn.style.color = 'white';

          currentModeIP = btn.dataset.mode;
          if (typeof loadIpDetailsCache === 'function') {
            await loadIpDetailsCache();
          }
          const groups = scanAndGroupIPs(currentModeIP);
          renderIPs(modal, groups);
        };
      });

      const thresholdInput = modal.querySelector('#arz-repeats-threshold');
      if (thresholdInput) {
        thresholdInput.oninput = () => {
          let val = parseInt(thresholdInput.value);
          if (isNaN(val) || val < 2) val = 2;
          currentThresholdRepeats = val;
          const groups = scanAndGroupRepeats(currentModeRepeats, currentThresholdRepeats);
          renderRepeats(modal, groups);
        };
      }

      const repeatsModeButtons = modal.querySelectorAll('.repeats-mode-btn');
      repeatsModeButtons.forEach(btn => {
        btn.onclick = () => {
          repeatsModeButtons.forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = 'var(--az-text-secondary)';
          });
          btn.classList.add('active');
          btn.style.background = 'linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%)';
          btn.style.color = 'white';

          currentModeRepeats = btn.dataset.mode;
          const groups = scanAndGroupRepeats(currentModeRepeats, currentThresholdRepeats);
          renderRepeats(modal, groups);
        };
      });

      modal.querySelector('#arz-analytics-reset').onclick = () => {
        document.querySelectorAll('table.table tbody tr').forEach(row => {
          row.style.display = '';
        });
        window.ArizonaNotifications.show('Фильтр сброшен', 'info');
        closeOverlay(modal);
      };

      modal.querySelector('#arz-analytics-show-all').onclick = () => {
        const tableRows = document.querySelectorAll('table.table tbody tr');
        const allMatchingRows = new Set();
        let shown = 0;

        if (activeTab === 'similar-ips') {
          const groups = scanAndGroupIPs(currentModeIP);
          groups.forEach(g => g.rows.forEach(r => allMatchingRows.add(r)));
        } else if (activeTab === 'repeats') {
          const groups = scanAndGroupRepeats(currentModeRepeats, currentThresholdRepeats);
          groups.forEach(g => g.rows.forEach(r => allMatchingRows.add(r)));
        }

        tableRows.forEach(row => {
          if (allMatchingRows.has(row)) {
            row.style.display = '';
            shown++;
          } else {
            row.style.display = 'none';
          }
        });
        window.ArizonaNotifications.show(`Показано ${shown} совпадающих логов`, 'success');
        closeOverlay(modal);
      };

      const ipGroups = scanAndGroupIPs(currentModeIP);
      renderIPs(modal, ipGroups);

      const repeatsGroups = scanAndGroupRepeats(currentModeRepeats, currentThresholdRepeats);
      renderRepeats(modal, repeatsGroups);
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
        const hasSimilar = settings.tools?.similarIPsFinder !== false;
        const hasRepeats = settings.tools?.actionRepeatsFinder !== false;
        const isEnabled = context.currentSettings['extension-toggle'] !== false &&
          settings.tools?.analytics !== false;

        const existingBtn = document.getElementById('arz-analytics-btn');
        if (isEnabled) {
          runWhenElementExists('.filter-buttons', () => this.injectButton());
        } else {
          if (existingBtn) existingBtn.remove();
        }
      },
      injectButton: function () {
        if (document.getElementById('arz-analytics-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-analytics-btn';
        btn.className = 'btn btn-success';
        btn.style.cssText = 'margin-left: 10px;';
        btn.innerHTML = `<i class="fa-solid fa-chart-simple" style="margin-right: 6px;"></i> Аналитика`;

        btn.onclick = () => this.openModal();

        container.appendChild(btn);
      },
      openModal: async () => {
          const overlay = document.createElement('div');
          overlay.className = 'alh-modal-overlay';
          overlay.innerHTML = modalHTML;
          const el = overlay;
          openOverlay(el);
          await setupModal(el);
        }
    };

}
