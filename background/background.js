importScripts('log-requests.js');

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

  enqueue(fn, skip) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, skip, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue[0];
      if (task.skip?.()) {
        this.queue.shift();
        task.reject(new Error('Сервис временно недоступен'));
        continue;
      }
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

const geoProviders = [
  { name: 'ip-api.com', queue: new RateLimitedQueue(2000), retryAt: 0 },
  { name: 'ipwho.is', queue: new RateLimitedQueue(1100), retryAt: 0 },
  { name: 'ipapi.co', queue: new RateLimitedQueue(1100), retryAt: 0 },
  { name: 'FreeIPAPI', queue: new RateLimitedQueue(1100), retryAt: 0 }
];

function normalizeGeoResponse(provider, ip, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Некорректный ответ сервиса геолокации');
  const message = data.message || data.reason || 'Сервис не вернул данные IP';
  if (data.status === 'fail' || data.success === false || data.error) {
    return { query: ip, status: 'fail', message,
      retryable: !/^(invalid (query|ip address)|(?:reserved|private) (range|ip address))$/i.test(message) };
  }
  let entry;
  if (provider.name === 'ip-api.com') {
    if (data.status !== 'success' || data.query !== ip) throw new Error('Некорректный ответ ip-api.com');
    entry = { ...data };
  } else if (provider.name === 'ipwho.is') {
    if (data.success !== true || data.ip !== ip) throw new Error('Некорректный ответ ipwho.is');
    entry = {
      country: data.country, countryCode: data.country_code, city: data.city,
      region: data.region_code, regionName: data.region,
      lat: data.latitude, lon: data.longitude, timezone: data.timezone?.id,
      isp: data.connection?.isp, org: data.connection?.org,
      as: data.connection?.asn != null ? `AS${data.connection.asn}` : undefined
    };
  } else if (provider.name === 'ipapi.co') {
    if (data.ip !== ip) throw new Error('Некорректный ответ ipapi.co');
    entry = {
      country: data.country_name, countryCode: data.country_code || data.country, city: data.city,
      region: data.region_code, regionName: data.region,
      lat: data.latitude, lon: data.longitude, timezone: data.timezone,
      org: data.org, as: data.asn
    };
  } else {
    if (data.ipAddress !== ip) throw new Error('Некорректный ответ FreeIPAPI');
    entry = {
      country: data.countryName, countryCode: data.countryCode, city: data.cityName,
      region: data.regionCode, regionName: data.regionName,
      lat: data.latitude, lon: data.longitude,
      org: data.asnOrganization, as: data.asn != null ? `AS${data.asn}` : undefined
    };
    if (typeof data.isProxy === 'boolean') entry.proxy = data.isProxy;
  }
  if (!entry.country && !entry.countryCode && !entry.city) throw new Error('Пустой ответ сервиса геолокации');
  for (const [field, limit] of [['lat', 90], ['lon', 180]]) {
    const value = entry[field];
    if (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit) entry[field] = Number(value);
    else delete entry[field];
  }
  return { ...entry, query: ip, status: 'success', _provider: provider.name };
}

function requestGeoProvider(provider, ips) {
  if (Date.now() < provider.retryAt) return Promise.reject(new Error(`${provider.name}: временно недоступен`));
  return provider.queue.enqueue(async () => {
    if (Date.now() < provider.retryAt) throw new Error(`${provider.name}: временно недоступен`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    let retryDelay = 60000;
    try {
      const direct = provider === geoProviders[0];
      const url = direct
        ? 'http://ip-api.com/batch?fields=query,status,message,country,countryCode,city,region,regionName,lat,lon,timezone,isp,org,as,mobile,proxy,hosting&lang=ru'
        : 'https://arizona-ai.ru/ecosystem_api/geoip';
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(direct ? ips.map(query => ({ query })) : { provider: provider.name, ips })
      });
      if (!response.ok) {
        if (response.status === 429) {
          const header = response.headers.get('Retry-After');
          const wait = Number(header) > 0 ? Number(header) * 1000 : Date.parse(header) - Date.now();
          retryDelay = Math.max(60000, Number.isFinite(wait) ? wait : 60000);
        }
        throw new Error(`${provider.name}: HTTP ${response.status}`);
      }
      const data = await response.json();
      let results;
      if (provider === geoProviders[0]) {
        if (!Array.isArray(data)) throw new Error('Некорректный ответ ip-api.com');
        results = ips.map(query => {
          const item = data.find(item => item?.query === query);
          try { return normalizeGeoResponse(provider, query, item); }
          catch (error) { return { query, status: 'fail', retryable: true, message: error.message }; }
        });
      } else results = [normalizeGeoResponse(provider, ips[0], data)];
      if (results.every(item => item.status !== 'success' && item.retryable)) provider.retryAt = Date.now() + retryDelay;
      return results;
    } catch (error) {
      provider.retryAt = Date.now() + retryDelay;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }, () => Date.now() < provider.retryAt);
}

async function lookupGeoBatch(ips, onResult = () => {}) {
  let primary = [];
  try { primary = await requestGeoProvider(geoProviders[0], ips); } catch (error) { }
  return Promise.all(ips.map(async ip => {
    const result = primary.find(item => item.query === ip);
    if (result?.status === 'success' || result?.retryable === false) {
      onResult(result);
      return result;
    }
    let message = result?.message || 'Сервисы геолокации недоступны';
    const remaining = geoProviders.slice(1);
    while (remaining.length) {
      remaining.sort((a, b) => Number(Date.now() < a.retryAt) - Number(Date.now() < b.retryAt) || a.queue.queue.length - b.queue.queue.length);
      const provider = remaining.shift();
      try {
        const [item] = await requestGeoProvider(provider, [ip]);
        if (item.status === 'success' || item.retryable === false) {
          onResult(item);
          return item;
        }
        message = item.message;
      } catch (error) {
        message = error.message;
      }
    }
    const failed = { query: ip, status: 'fail', retryable: true, message };
    onResult(failed);
    return failed;
  }));
}

let ipDetailsCache = {};
let cacheLoadPromise;
let cacheSaveTimer;
let geoCacheGeneration = 0;
const pendingGeoIps = new Map();
const IP_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

function loadCache() {
  if (!cacheLoadPromise) {
    cacheLoadPromise = new Promise(resolve => {
      chrome.storage.local.get(['arz_ip_details_cache'], result => {
        ipDetailsCache = result.arz_ip_details_cache || {};
        const now = Date.now();
        for (const [ip, data] of Object.entries(ipDetailsCache)) {
          if (!data || data.status !== 'success' || (data._ts && now - data._ts >= IP_CACHE_TTL)) delete ipDetailsCache[ip];
          else if (!data._ts) data._ts = now;
        }
        resolve();
      });
    });
  }
  return cacheLoadPromise;
}

function saveCache() {
  if (cacheSaveTimer) return;
  cacheSaveTimer = setTimeout(() => {
    cacheSaveTimer = null;
    const keys = Object.keys(ipDetailsCache);
    if (keys.length > 3000) {
      keys.sort((a, b) => (ipDetailsCache[a]._ts || 0) - (ipDetailsCache[b]._ts || 0));
      for (const key of keys.slice(0, keys.length - 2000)) delete ipDetailsCache[key];
    }
    chrome.storage.local.set({ arz_ip_details_cache: ipDetailsCache });
  }, 250);
}

async function getCachedIps(ips) {
  await loadCache();
  const result = {};
  for (const ip of new Set(ips)) {
    const local = ipDetailsCache[ip];
    const remote = memoryCache.get(ip);
    const data = local || remote;
    if (data?.status === 'success' && Date.now() - (data._ts || 0) < IP_CACHE_TTL) result[ip] = data;
    else if (local) delete ipDetailsCache[ip];
  }
  return result;
}

async function fetchGeoIps(ips, onResult = () => {}) {
  const unique = [...new Set(ips)].filter(ip => typeof ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(part => Number(part) <= 255));
  await loadCache();
  let cached = await getCachedIps(unique);
  if (unique.some(ip => !cached[ip])) loadIpCache();
  const missing = unique.filter(ip => !cached[ip] && !pendingGeoIps.has(ip));
  for (let i = 0; i < missing.length; i += 15) {
    const chunk = missing.slice(i, i + 15);
    const generation = geoCacheGeneration;
    const resolvers = new Map();
    for (const ip of chunk) {
      const pending = new Promise(resolve => resolvers.set(ip, resolve))
        .finally(() => { if (pendingGeoIps.get(ip) === pending) pendingGeoIps.delete(ip); });
      pendingGeoIps.set(ip, pending);
    }
    const publish = item => {
      if (resolvers.has(item.query)) {
        if (item.status === 'success' && generation === geoCacheGeneration) {
          const entry = { ...item, _ts: Date.now() };
          ipDetailsCache[item.query] = entry;
          memoryCache.set(item.query, entry);
          saveCache();
          scheduleSave();
        }
        resolvers.get(item.query)(item);
        resolvers.delete(item.query);
      }
    };
    lookupGeoBatch(chunk, publish).catch(error => {
      for (const ip of resolvers.keys()) publish({ query: ip, status: 'fail', retryable: true, message: error.message });
    });
  }
  return Promise.all(unique.map(async ip => {
    const item = cached[ip] || await pendingGeoIps.get(ip);
    onResult(item);
    return item;
  }));
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

let remoteCachePromise;
let remoteCacheRetryAt = 0;

function loadIpCache() {
  if (cacheLoaded) return Promise.resolve({ success: true, data: Object.fromEntries(memoryCache) });
  if (remoteCachePromise) return remoteCachePromise;
  if (Date.now() < remoteCacheRetryAt) return Promise.resolve({ success: true, data: Object.fromEntries(memoryCache) });
  remoteCachePromise = readRemoteIpCache().finally(() => {
    remoteCachePromise = null;
    if (!cacheLoaded) remoteCacheRetryAt = Date.now() + 60000;
  });
  return remoteCachePromise;
}

async function readRemoteIpCache() {
  if (cacheLoaded) {
    return { success: true, data: Object.fromEntries(memoryCache) };
  }

  try {
    console.log('[BG] Загрузка IP кэша с локального API...');
    const url = `${API_CONFIG.url}?type=${IP_CACHE_TYPE}&action=get_all&api_key=${encodeURIComponent(API_CONFIG.apiKey)}&t=${Date.now()}`;
    const response = await fetchWithTimeout(url);
    const result = await response.json();

    if (result.success && result.data) {
      const now = Date.now();
      for (const [ip, data] of Object.entries(result.data)) {
        if (data._ts && (now - data._ts) < 30 * 24 * 60 * 60 * 1000) {
          if (!memoryCache.has(ip)) memoryCache.set(ip, data);
        }
      }
      while (memoryCache.size > 3000) memoryCache.delete(memoryCache.keys().next().value);
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
  if (saveTimeout) return;
  while (memoryCache.size > 3000) memoryCache.delete(memoryCache.keys().next().value);
  saveTimeout = setTimeout(() => {
    forceSaveIpsToCache();
    saveTimeout = null;
  }, 3000);
}

async function addIpsToCache(ipsData) {
  await loadCache();

  let updated = false;
  const now = Date.now();

  for (const [ip, ipData] of Object.entries(ipsData)) {
    const existing = memoryCache.get(ip);
    if (!existing || existing._ts !== ipData._ts) {
      const data = { ...ipData, _ts: now };
      memoryCache.set(ip, data);
      if (data.status === 'success') ipDetailsCache[ip] = data;
      updated = true;
    }
  }

  if (updated) {
    saveCache();
    console.log(`[BG] Добавлено ${Object.keys(ipsData).length} IP в кэш (всего: ${memoryCache.size})`);
    scheduleSave();
  }
}

let itemsRequest;

function fetchItemsFromAPI() {
  if (!itemsRequest) itemsRequest = requestItemsFromAPI().finally(() => { itemsRequest = null; });
  return itemsRequest;
}

async function requestItemsFromAPI() {
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

let cachedWorkingDomain = null;

async function getWorkingEcosystemDomain() {
  if (cachedWorkingDomain) return cachedWorkingDomain;
  const domains = [
    'https://arizona-ai.ru',
    'https://arizona-ai.tech'
  ];
  for (const domain of domains) {
    try {
      const response = await fetchWithTimeout(`${domain}/ecosystem_api/info`, { timeout: 5000 });
      if (response.ok) {
        cachedWorkingDomain = domain;
        return domain;
      }
    } catch (e) {
      console.warn(`[Background] Failed domain check for ${domain}:`, e);
    }
  }
  return 'https://arizona-ai.ru';
}

let ecosystemRequest;
let ecosystemExpires = 0;

function fetchEcosystemApi() {
  if (!ecosystemRequest || Date.now() >= ecosystemExpires) {
    ecosystemExpires = Date.now() + 3600000;
    ecosystemRequest = requestEcosystemApi().catch(error => {
      ecosystemRequest = null;
      throw error;
    });
  }
  return ecosystemRequest;
}

async function requestEcosystemApi() {
  const domains = [
    'https://arizona-ai.ru',
    'https://arizona-ai.tech'
  ];
  for (const domain of domains) {
    try {
      const url = `${domain}/ecosystem_api/info`;
      const response = await fetchWithTimeout(url, { timeout: 5000 });
      if (!response.ok) throw new Error(`HTTP status: ${response.status}`);
      const json = await response.json();
      if (json && json.status === 'success' && Array.isArray(json.users)) {
        cachedWorkingDomain = domain;
        return { ...json, workingDomain: domain };
      }
    } catch (e) {
      console.warn(`[Background] Failed to fetch from ${url}:`, e);
    }
  }
  throw new Error('All ArizonaAI Ecosystem API fallback routes failed.');
}

let settingsWriteQueue = Promise.resolve();

let pendingSettingsBatch;

function patchSettings(patches) {
  if (!pendingSettingsBatch) {
    const batch = { patches: [], promise: null };
    batch.promise = new Promise((resolve, reject) => {
      setTimeout(() => {
        pendingSettingsBatch = null;
        writeSettingsPatches(batch.patches).then(resolve, reject);
      }, 40);
    });
    pendingSettingsBatch = batch;
  }
  pendingSettingsBatch.patches.push(...patches);
  return pendingSettingsBatch.promise;
}

function writeSettingsPatches(patches) {
  const allowed = patches.filter(patch => ['arz_logsparser_helper_settings', 'arizonaSettings'].includes(patch.key) &&
    Array.isArray(patch.path) && patch.path.every(key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key)));
  settingsWriteQueue = settingsWriteQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
    const keys = [...new Set(allowed.map(patch => patch.key))];
    chrome.storage.local.get(keys, values => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      for (const { key, path, value } of allowed) {
        if (!path.length) { values[key] = value; continue; }
        let target = values[key] ||= {};
        for (const segment of path.slice(0, -1)) target = target[segment] ||= {};
        target[path.at(-1)] = value;
      }
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  }));
  return settingsWriteQueue;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'patch_settings') {
    patchSettings(message.patches || [])
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === 'FETCH_ECOSYSTEM_API') {
    fetchEcosystemApi()
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; 
  }

  if (message.type === 'OPEN_ECOSYSTEM_GUIDE') {
    getWorkingEcosystemDomain().then(domain => {
      const targetUrl = `${domain}/faq#faq-nickname-guide`;
      chrome.tabs.create({ url: targetUrl });
      sendResponse({ success: true, url: targetUrl });
    }).catch(() => {
      const fallbackUrl = 'https://arizona-ai.ru/faq#faq-nickname-guide';
      chrome.tabs.create({ url: fallbackUrl });
      sendResponse({ success: true, url: fallbackUrl });
    });
    return true;
  }


  if (message.type === 'arz_fetch_ips' || message.action === 'fetch_ip_geo_batch' || message.action === 'fetch_ip_geo_single') {
    const single = message.action === 'fetch_ip_geo_single';
    const progress = item => {
      if (!message.requestId || !sender.tab?.id) return;
      const target = sender.documentId ? { documentId: sender.documentId } : { frameId: sender.frameId || 0 };
      chrome.tabs.sendMessage(sender.tab.id, { action: 'ip_geo_result', requestId: message.requestId, data: item }, target, () => { void chrome.runtime.lastError; });
    };
    fetchGeoIps(single ? [message.ip] : message.ips || [], progress)
      .then(data => sendResponse({ success: true, data: single ? data[0] : data }))
      .catch(error => sendResponse({ success: false, error: error.message, data: single ? null : [] }));
    return true;
  }

  if (message.action === 'get_cached_ips') {
    loadIpCache();
    getCachedIps(message.ips || [])
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message, data: {} }));
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

  if (message.action === 'check_ban') {
    runQueuedBanCheck(message.nickname, sender.tab?.id ?? -1)
      .then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
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
    loadCache().then(() => {
      geoCacheGeneration++;
      memoryCache.clear();
      ipDetailsCache = {};
      cacheLoaded = true;
      saveCache();
      sendResponse({ success: true });
    }).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  return false;
});

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
          punishment: true,
          ipBatch: true,
          idNick: true,
          report: true,
          lookup: true,
          analytics: true,
          dateShortcutEnabled: true
        },
        theme: 'dark',
        fontSize: 14,
        colorScheme: 'red',
        borderRadius: '8px',
        backgroundColor: null,
        backgroundImage: null,
        backgroundImageUrl: null,
        backgroundImageBlur: 0,
        cardOpacity: 100,
        cardBodyBorder: false,
        customThemeEnabled: false,
        customTheme: {
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
        },
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


async function runQueuedBanCheck(nickname, owner) {
  let epoch;
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = crypto.randomUUID();
    let finished = false;
    try {
      while (true) {
        const permit = await logRequests.acquire(owner, id, epoch);
        if (permit.stopped) throw new Error('Автоматические операции остановлены после 429');
        epoch = permit.epoch;
        if (permit.granted) break;
        if (owner >= 0) await chrome.tabs.get(owner);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      const result = await new Promise(resolve => {
        chrome.tabs.create({ url: 'about:blank', active: false }, tab => {
          if (chrome.runtime.lastError || !tab) { resolve({ success: false, status: 0, error: 'Не удалось открыть вкладку' }); return; }
          let resolved = false;
          let status = 0;
          let retryAfter;
          const finish = result => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onRemoved.removeListener(onRemoved);
            chrome.webRequest.onHeadersReceived.removeListener(onHeaders);
            chrome.tabs.remove(tab.id, () => { void chrome.runtime.lastError; });
            resolve({ ...result, status, retryAfter });
          };
          const timeout = setTimeout(() => finish({ success: false, error: 'Timeout' }), 20000);
          const onRemoved = tabId => {
            if (tabId === tab.id || tabId === owner) finish({ success: false, error: 'Вкладка закрыта' });
          };
          const onHeaders = details => {
            if (details.tabId !== tab.id || details.type !== 'main_frame') return;
            status = details.statusCode;
            retryAfter = details.responseHeaders?.find(header => header.name.toLowerCase() === 'retry-after')?.value;
            if (status >= 400) finish({ success: false, error: status === 429 ? 'Логпарсер ограничил запросы' : `HTTP ${status}` });
          };
          const onUpdated = (tabId, changeInfo, updatedTab) => {
            if (tabId !== tab.id || changeInfo.status !== 'complete' || resolved || !updatedTab?.url?.startsWith('https://arizonarp.logsparser.info/')) return;
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
            }, results => {
              if (chrome.runtime.lastError || !results?.[0]?.result) { finish({ success: false, error: 'Script execution failed' }); return; }
              const data = results[0].result;
              const banInfo = data.isBanned && data.lastBan ? {
                nickname, date: data.lastBan.date, reason: data.lastBan.reason,
                banDuration: parseInt(data.lastBan.duration), date_unbanned: data.unbanDate
              } : null;
              finish({ success: true, data: banInfo });
            });
          };
          chrome.tabs.onUpdated.addListener(onUpdated);
          chrome.tabs.onRemoved.addListener(onRemoved);
          chrome.webRequest.onHeadersReceived.addListener(onHeaders, {
            urls: ['https://arizonarp.logsparser.info/*'], types: ['main_frame']
          }, ['responseHeaders']);
          const url = `https://arizonarp.logsparser.info/?server_number=5&type%5B%5D=ban&type%5B%5D=login&sort=desc&min_period=2026-01-16+00%3A00%3A00&player=${encodeURIComponent(nickname)}&arz-filter-logs-mode=show`;
          chrome.tabs.update(tab.id, { url }, () => {
            if (chrome.runtime.lastError) finish({ success: false, error: 'Не удалось загрузить вкладку' });
          });
        });
      });
      const outcome = await logRequests.finish(owner, id, result.status, result.retryAfter);
      finished = true;
      if (outcome.expired) throw new Error('Истекло разрешение на запрос');
      if (outcome.stopped) {
        const tabs = await chrome.tabs.query({ url: 'https://arizonarp.logsparser.info/*' });
        for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: 'log_stop' }).catch(() => {});
        throw new Error('Автоматические операции остановлены после 429');
      }
      if (result.status === 0 && result.error !== 'Вкладка закрыта' && attempt < 2) continue;
      if (result.status !== 429) return result;
    } finally {
      if (!finished) await logRequests.cancel(owner, id);
    }
  }
  return { success: false, error: 'Логпарсер ограничил запросы. Повторите позже.' };
}
