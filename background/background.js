
console.log('[BG] Unified background script loaded v1.0');

function fetchWithTimeout(resource, options = {}) {
  const { timeout = 1500 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  return fetch(resource, {
    ...options,
    signal: controller.signal
  }).then(response => {
    clearTimeout(id);
    return response;
  }).catch(error => {
    clearTimeout(id);
    throw error;
  });
}

class RateLimitedQueue {
  constructor(delayMs = 2000) {
    this.queue = [];
    this.processing = false;
    this.delayMs = delayMs;
    this.lastRequestTime = 0;
  }

  enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue[0];
      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;
      const timeToWait = Math.max(0, this.delayMs - timeSinceLast);

      if (timeToWait > 0) {
        await new Promise(resolve => setTimeout(resolve, timeToWait));
      }

      try {
        this.lastRequestTime = Date.now();
        const result = await task.fn();
        this.queue.shift();
        task.resolve(result);
      } catch (error) {
        this.queue.shift();
        task.reject(error);
      }
    }

    this.processing = false;
  }
}

const ipLookupQueue = new RateLimitedQueue(2000);

function fetchWithRetry(url, options = {}, maxAttempts = 3) {
  return fetch(url, options)
    .then(async res => {
      if (res.status === 429) {
        if (maxAttempts > 1) {
          console.warn(`[BG] IP lookup rate limited (429). Waiting 5s before retry...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          return fetchWithRetry(url, options, maxAttempts - 1);
        }
        throw new Error(`HTTP error! Status: 429 Too Many Requests`);
      }
      if (!res.ok) {
        if (maxAttempts > 1) {
          console.warn(`[BG] IP lookup failed with status ${res.status}. Retrying in 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchWithRetry(url, options, maxAttempts - 1);
        }
        throw new Error(`HTTP error! Status: ${res.status}`);
      }
      return res.json();
    })
    .catch(async err => {
      if (err.message && err.message.includes('429')) {
        throw err;
      }
      if (maxAttempts > 1) {
        console.warn(`[BG] Fetch error: ${err.message}. Retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fetchWithRetry(url, options, maxAttempts - 1);
      }
      throw err;
    });
}

let ipDetailsCache = {};
let isCacheLoaded = false;

function loadCache() {
  if (isCacheLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['arz_ip_details_cache'], (result) => {
        if (result && result['arz_ip_details_cache']) {
          ipDetailsCache = result['arz_ip_details_cache'];
        }
        isCacheLoaded = true;
        resolve();
      });
    } else {
      isCacheLoaded = true;
      resolve();
    }
  });
}

function saveCache() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const keys = Object.keys(ipDetailsCache);
    if (keys.length > 3000) {
      const keysToRemove = keys.slice(0, keys.length - 2000);
      keysToRemove.forEach(k => delete ipDetailsCache[k]);
    }
    chrome.storage.local.set({ 'arz_ip_details_cache': ipDetailsCache });
  }
}

const API_CONFIG = {
  url: 'http://localhost/Arizona-Helper/api.php',
  apiKey: '123'
};

const IP_CACHE_TYPE = 'ip_cache';
let memoryCache = new Map();
let cacheLoaded = false;
let saveTimeout = null;
let isSaving = false;

function logToStorage(context, data) {
  chrome.storage.local.get(['bg_debug_logs'], (result) => {
    const logs = result.bg_debug_logs || [];
    logs.unshift({
      time: new Date().toISOString(),
      context: context,
      data: data
    });
    if (logs.length > 100) logs.pop();
    chrome.storage.local.set({ bg_debug_logs: logs });
  });
}

async function loadIpCache() {
  if (cacheLoaded) {
    return { success: true, data: Object.fromEntries(memoryCache) };
  }

  try {
    console.log('[BG] Загрузка IP кэша с локального API...');
    const url = `${API_CONFIG.url}?type=${IP_CACHE_TYPE}&action=get_all&api_key=${encodeURIComponent(API_CONFIG.apiKey)}&t=${Date.now()}`;
    const response = await fetchWithTimeout(url);
    const result = await response.json();

    if (result.success && result.data) {
      memoryCache.clear();
      const now = Date.now();
      for (const [ip, data] of Object.entries(result.data)) {
        if (data._ts && (now - data._ts) < 30 * 24 * 60 * 60 * 1000) {
          memoryCache.set(ip, data);
        }
      }
      cacheLoaded = true;
      console.log(`[BG] Загружено ${memoryCache.size} IP из кэша API`);
      return { success: true, data: Object.fromEntries(memoryCache) };
    }
    return { success: true, data: {} };
  } catch (error) {
    console.log('[BG] Локальный API кэша IP недоступен:', error.message);
    return { success: true, data: {} };
  }
}

async function forceSaveIpsToCache() {
  if (isSaving) return;
  if (memoryCache.size === 0) return;

  isSaving = true;

  try {
    const dataToSave = Object.fromEntries(memoryCache);
    console.log(`[BG] Сохранение IP кэша в API... (${memoryCache.size} IP)`);

    const url = `${API_CONFIG.url}?api_key=${encodeURIComponent(API_CONFIG.apiKey)}&t=${Date.now()}`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_CONFIG.apiKey
      },
      body: JSON.stringify({
        type: IP_CACHE_TYPE,
        action: 'save',
        data: dataToSave
      })
    });

    const result = await response.json();
    if (result.success) {
      console.log(`[BG] ✅ Сохранено ${result.total} IP в кэш API`);
    } else {
      console.log('[BG] Ошибка сохранения IP в API:', result.error);
    }
  } catch (error) {
    console.log('[BG] Ошибка при сохранении IP в API:', error.message);
  } finally {
    isSaving = false;
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    forceSaveIpsToCache();
    saveTimeout = null;
  }, 3000);
}

async function addIpsToCache(ipsData) {
  await loadIpCache();

  let updated = false;
  const now = Date.now();

  for (const [ip, ipData] of Object.entries(ipsData)) {
    const existing = memoryCache.get(ip);
    if (!existing || existing._ts !== ipData._ts) {
      memoryCache.set(ip, { ...ipData, _ts: now });
      updated = true;
    }
  }

  if (updated) {
    console.log(`[BG] Добавлено ${Object.keys(ipsData).length} IP в кэш (всего: ${memoryCache.size})`);
    scheduleSave();
  }
}

async function fetchItemsFromAPI() {
  try {
    console.log('[BG] Загрузка предметов из API...');
    const url = `${API_CONFIG.url}?type=items&action=get_all&api_key=${encodeURIComponent(API_CONFIG.apiKey)}&t=${Date.now()}`;
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      let itemsArray = result.data;
      if (result.data.items && Array.isArray(result.data.items)) {
        itemsArray = result.data.items;
      } else if (Array.isArray(result.data)) {
        itemsArray = result.data;
      } else if (typeof result.data === 'object') {
        itemsArray = Object.values(result.data);
      }
      return { success: true, data: itemsArray || [] };
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    console.log('[BG] Ошибка fetchItemsFromAPI (сервер offline):', error.message);
    return { success: false, error: error.message, data: [] };
  }
}

async function updateItemsFromAPI() {
  try {
    console.log('[BG] Начинаем обновление базы предметов...');
    const url = `${API_CONFIG.url}?action=update_items&api_key=${encodeURIComponent(API_CONFIG.apiKey)}&t=${Date.now()}`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      console.log(`[BG] ✅ Предметы обновлены: ${result.total || 0} предметов`);
      const syncResult = await syncDataWithServer('items', {});
      return {
        success: true,
        total: result.total || 0,
        synced: syncResult.success
      };
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (error) {
    console.log('[BG] Предупреждение обновления предметов (офлайн):', error.message);
    return { success: false, error: error.message };
  }
}

async function fetchFromServer(type) {
  const url = `${API_CONFIG.url}?type=${type}&action=get_all&api_key=${encodeURIComponent(API_CONFIG.apiKey)}&t=${Date.now()}`;
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.success) {
      return { success: true, data: data.data, total: data.total };
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (error) {
    console.log('[BG] fetchFromServer ошибка:', error.message);
    return { success: false, error: error.message, data: null };
  }
}

async function saveToServer(type, data) {
  const url = `${API_CONFIG.url}?api_key=${encodeURIComponent(API_CONFIG.apiKey)}&t=${Date.now()}`;
  let saveData = data;
  if (type === 'quick_answers' && !Array.isArray(data)) {
    saveData = [];
  }

  const payload = {
    type: type,
    action: 'save',
    data: saveData
  };

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_CONFIG.apiKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (response.ok && result.success) {
      return { success: true, total: result.total };
    } else {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.log('[BG] saveToServer ошибка:', error.message);
    return { success: false, error: error.message };
  }
}

async function syncDataWithServer(type, localData) {
  console.log(`[BG] Синхронизация типа ${type}...`);
  try {
    const serverResult = await fetchFromServer(type);
    if (!serverResult.success) {
      throw new Error(serverResult.error || 'Failed to fetch server data');
    }

    let serverData = serverResult.data || {};
    let mergedData;

    if (type === 'quick_answers') {
      const localArray = Array.isArray(localData) ? localData : [];
      const serverArray = Array.isArray(serverData) ? serverData : [];

      const mergedMap = new Map();
      for (const item of serverArray) {
        if (item && item.id) mergedMap.set(item.id, item);
      }
      for (const item of localArray) {
        if (item && item.id && !mergedMap.has(item.id)) {
          mergedMap.set(item.id, item);
        }
      }
      mergedData = Array.from(mergedMap.values());
    } else {
      const localObj = typeof localData === 'object' ? localData : {};
      const serverObj = typeof serverData === 'object' ? serverData : {};
      mergedData = { ...localObj, ...serverObj };
    }

    const saveResult = await saveToServer(type, mergedData);
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to save merged data');
    }

    return {
      success: true,
      mergedData: mergedData,
      serverData: serverData
    };
  } catch (error) {
    console.log(`[BG] Предупреждение синхронизации ${type}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function fetchEcosystemApi() {
  const urls = [
    'https://arizona-ai.ru/ecosystem_api/info',
    'https://arizona-ai.tech/ecosystem_api/info'
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
      const json = await response.json();
      if (json && json.status === 'success' && Array.isArray(json.users)) {
        return json;
      }
    } catch (e) {
      console.warn(`[Background] Failed to fetch from ${url}:`, e);
    }
  }
  throw new Error('All ArizonaAI Ecosystem API fallback routes failed.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_ECOSYSTEM_API') {
    fetchEcosystemApi()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; 
  }

  if (message.action) {
    console.log('[BG] Unified received action:', message.action);
    logToStorage('message_received', { action: message.action, type: message.type });
  }

  if (message.type === 'arz_fetch_ips') {
    const { ips } = message;
    loadCache().then(() => {
      const results = [];
      const ipsToFetch = [];

      ips.forEach(ip => {
        if (ipDetailsCache[ip]) {
          results.push(ipDetailsCache[ip]);
        } else {
          ipsToFetch.push(ip);
        }
      });

      if (ipsToFetch.length === 0) {
        sendResponse({ success: true, data: results });
        return;
      }

      const maxBatchSize = 15;
      const chunks = [];
      for (let i = 0; i < ipsToFetch.length; i += maxBatchSize) {
        chunks.push(ipsToFetch.slice(i, i + maxBatchSize));
      }

      const chunkPromises = chunks.map(chunk => {
        return ipLookupQueue.enqueue(() => {
          return fetchWithRetry("http://ip-api.com/batch?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,org,as,mobile,proxy,hosting,query&lang=ru", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(chunk)
          });
        });
      });

      Promise.allSettled(chunkPromises).then(settledResults => {
        let hasSuccess = false;
        settledResults.forEach(result => {
          if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            hasSuccess = true;
            result.value.forEach(item => {
              if (item && item.query) {
                ipDetailsCache[item.query] = item;
                results.push(item);
              }
            });
          }
        });

        if (hasSuccess) {
          saveCache();
        }

        sendResponse({ success: results.length > 0, data: results });
      });
    });
    return true;
  }


  if (message.action === 'ping') {
    sendResponse({ success: true, message: 'pong', timestamp: Date.now() });
    return true;
  }

  if (message.action === 'get_items') {
    chrome.storage.local.get(['items_cache'], async (result) => {
      const cache = result.items_cache;
      if (cache && cache.timestamp && (Date.now() - cache.timestamp < 24 * 60 * 60 * 1000)) {
        sendResponse({ success: true, data: cache.items, fromCache: true });
        return;
      }

      try {
        const itemsData = await fetchItemsFromAPI();
        if (itemsData.success) {
          chrome.storage.local.set({
            items_cache: {
              timestamp: Date.now(),
              items: itemsData.data
            }
          });
          sendResponse({ success: true, data: itemsData.data });
        } else {
          throw new Error(itemsData.error);
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    });
    return true;
  }

  if (message.action === 'fetch_ip_geo_batch') {
    const ipsToFetch = message.ips || [];
    if (ipsToFetch.length === 0) {
      sendResponse({ success: true, data: [] });
      return true;
    }

    const maxBatchSize = 15;
    const chunks = [];
    for (let i = 0; i < ipsToFetch.length; i += maxBatchSize) {
      chunks.push(ipsToFetch.slice(i, i + maxBatchSize));
    }

    const chunkPromises = chunks.map(chunk => {
      return ipLookupQueue.enqueue(() => {
        const url = 'http://ip-api.com/batch?fields=query,status,country,city,regionName,lat,lon,isp,org,as,mobile,proxy,hosting&lang=ru';
        return fetchWithRetry(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk.map(ip => ({ query: ip })))
        });
      });
    });

    Promise.allSettled(chunkPromises).then(async settledResults => {
      const mergedData = [];
      const ipsToSave = {};
      const now = Date.now();

      settledResults.forEach((result, chunkIdx) => {
        const chunk = chunks[chunkIdx];
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          for (let i = 0; i < result.value.length; i++) {
            const ipData = result.value[i];
            const ip = chunk[i];
            mergedData.push(ipData);
            if (ipData && ipData.status === 'success' && ip) {
              ipsToSave[ip] = { ...ipData, _ts: now };
            }
          }
        } else {
          console.error(`[BG] fetch_ip_geo_batch chunk failed:`, result.reason);
          chunk.forEach(() => {
            mergedData.push({ status: 'fail' });
          });
        }
      });

      if (Object.keys(ipsToSave).length > 0) {
        await addIpsToCache(ipsToSave);
      }

      sendResponse({ success: mergedData.length > 0, data: mergedData });
    });

    return true;
  }

  if (message.action === 'fetch_ip_geo_single') {
    ipLookupQueue.enqueue(() => {
      const url = `http://ip-api.com/json/${message.ip}?fields=query,status,country,city,regionName,lat,lon,isp,org,as,mobile,proxy,hosting&lang=ru`;
      return fetchWithRetry(url);
    })
    .then(async (data) => {
      if (data && data.status === 'success') {
        await addIpsToCache({ [message.ip]: { ...data, _ts: Date.now() } });
      }
      sendResponse({ success: true, data });
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'check_ban') {
    const nickname = message.nickname;
    const url = `https://arizonarp.logsparser.info/?server_number=5&type%5B%5D=ban&type%5B%5D=login&sort=desc&min_period=2026-01-16+00%3A00%3A00&player=${encodeURIComponent(nickname)}&arz-filter-logs-mode=show`;

    chrome.tabs.create({ url: url, active: false }, (tab) => {
      let isResolved = false;
      const finish = (result) => {
        if (isResolved) return;
        isResolved = true;
        if (tab && tab.id) {
          chrome.tabs.remove(tab.id, () => {});
        }
        sendResponse(result);
      };

      const timeout = setTimeout(() => {
        finish({ success: false, error: 'Timeout' });
      }, 20000);

      const onUpdated = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);

          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (nickname) => {
              const result = {
                bans: [],
                logins: [],
                lastBan: null,
                isBanned: false,
                unbanDate: null
              };

              const rows = document.querySelectorAll('table.table tbody tr');
              for (let row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                  const date = cells[0]?.textContent?.trim() || '';
                  const action = cells[1]?.textContent || '';

                  if (action.includes('забанил') && action.includes(nickname)) {
                    const durationMatch = action.match(/на\s+(\d+)\s+дней/);
                    const reasonMatch = action.match(/причина:\s+(.+?)(?:\s*\||$)/);
                    const adminMatch = action.match(/Администратор\s+(\S+)/);

                    result.bans.push({
                      date: date,
                      duration: durationMatch ? durationMatch[1] : '2000',
                      reason: reasonMatch ? reasonMatch[1].trim() : action,
                      admin: adminMatch ? adminMatch[1] : 'Unknown'
                    });
                  }

                  if (action.includes('авторизовался') && action.includes(nickname)) {
                    result.logins.push({ date: date });
                  }
                }
              }

              if (result.bans.length > 0) {
                result.lastBan = result.bans.reduce((latest, current) => {
                  return current.date > latest.date ? current : latest;
                }, result.bans[0]);

                const loginsAfterBan = result.logins.filter(login => login.date > result.lastBan.date);
                result.isBanned = loginsAfterBan.length === 0;

                if (result.isBanned) {
                  const banDate = new Date(result.lastBan.date);
                  const days = parseInt(result.lastBan.duration);
                  const unbanDate = new Date(banDate);
                  unbanDate.setDate(unbanDate.getDate() + days);
                  result.unbanDate = unbanDate.toLocaleString('ru-RU');
                }
              }
              return result;
            },
            args: [nickname]
          }, (results) => {
            clearTimeout(timeout);
            if (results && results[0] && results[0].result) {
              const data = results[0].result;
              let banInfo = null;
              if (data.isBanned && data.lastBan) {
                banInfo = {
                  nickname: nickname,
                  date: data.lastBan.date,
                  reason: data.lastBan.reason,
                  banDuration: parseInt(data.lastBan.duration),
                  date_unbanned: data.unbanDate,
                  admin: data.lastBan.admin
                };
              }
              finish({ success: true, data: banInfo });
            } else {
              finish({ success: false, error: 'Script execution failed' });
            }
          });
        }
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
    return true;
  }

  if (message.action === 'api_get_data') {
    fetchFromServer(message.type)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'api_save_data') {
    saveToServer(message.type, message.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'api_sync_data') {
    syncDataWithServer(message.type, message.localData)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'update_items_from_api') {
    updateItemsFromAPI()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'showNotification' && message.text) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Arizona Helper',
      message: message.text,
      priority: 1
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getSettings') {
    chrome.storage.local.get(['arizonaSettings'], (result) => {
      sendResponse({ settings: result.arizonaSettings || {} });
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    chrome.storage.local.set({ arizonaSettings: message.settings }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'get_ip_cache') {
    loadIpCache()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message, data: {} }));
    return true;
  }

  if (message.action === 'save_ip_to_cache') {
    addIpsToCache({ [message.ip]: message.data })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'batch_save_ips_to_cache') {
    addIpsToCache(message.ipsData)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'clear_ip_cache') {
    memoryCache.clear();
    cacheLoaded = false;
    forceSaveIpsToCache()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

setInterval(() => {
  console.log('[BG] Периодическое обновление предметов');
  updateItemsFromAPI().catch(() => {});
}, 24 * 60 * 60 * 1000);

chrome.runtime.onInstalled.addListener(() => {
  console.log('Arizona LogsParser Helper установлен!');

  chrome.storage.local.get(['arizonaSettings'], (result) => {
    if (!result.arizonaSettings) {
      const defaultSettings = {
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
          columnEyeButtons: true,
          filterWindow: true,
          formsEnabled: true,
          online: true,
          dateShortcutEnabled: true
        },
        theme: 'dark',
        fontSize: 14,
        customTriggerIcon: null,
        customTriggerEnabled: false
      };
      chrome.storage.local.set({ arizonaSettings: defaultSettings });
    }
  });

  setTimeout(() => {
    console.log('[BG] Первоначальная синхронизация');
    chrome.storage.local.get(['TechFormSettings'], async (result) => {
      const settings = result.TechFormSettings || {};
      if (settings.quickAnswers) {
        await syncDataWithServer('quick_answers', settings.quickAnswers).catch(() => {});
      }
    });
    setTimeout(() => {
      updateItemsFromAPI().catch(() => {});
    }, 10000);
  }, 5000);
});

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-widget') {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {type: 'toggleWidget'});
        }
      });
    }
  });
}