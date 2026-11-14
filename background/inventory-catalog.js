(() => {
  const DAY = 86400000;
  const PAGE_SIZE = 1000;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  const normalize = value => String(value ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  let database;
  let statePromise;
  let state = { version: 1, active: null, updatedAt: 0, total: 0, staging: null, error: '', retryAt: 0 };
  let updating = null;
  let indexTask = null;
  let searchIndex = null;

  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('alh-inventory-catalog', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('items', { keyPath: ['generation', 'id'] });
        request.result.createObjectStore('meta');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Хранилище каталога занято другой версией расширения'));
    }).catch(error => { database = null; throw error; });
    return database;
  }

  async function transaction(stores, mode, callback) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value;
      tx.oncomplete = () => resolve(typeof value === 'function' ? value() : value);
      tx.onerror = () => reject(tx.error || new Error('Ошибка хранилища каталога'));
      tx.onabort = () => reject(tx.error || new Error('Запись каталога прервана'));
      try { value = callback(tx); } catch (error) { tx.abort(); reject(error); }
    });
  }

  function loadState() {
    if (!statePromise) statePromise = transaction(['meta'], 'readonly', tx => {
      const request = tx.objectStore('meta').get('state');
      return () => { if (request.result?.version === 1) state = request.result; };
    }).catch(error => { statePromise = null; throw error; });
    return statePromise;
  }

  async function saveState(next) {
    await transaction(['meta'], 'readwrite', tx => tx.objectStore('meta').put(next, 'state'));
    state = next;
  }

  function range(generation, after = -1) {
    return IDBKeyRange.bound([generation, after], [generation, Number.MAX_SAFE_INTEGER], true, false);
  }

  async function readBatch(generation, after = -1, count = 2000) {
    return transaction(['items'], 'readonly', tx => {
      const request = tx.objectStore('items').getAll(range(generation, after), count);
      return () => request.result;
    });
  }

  async function removeGeneration(generation) {
    while (true) {
      const records = await readBatch(generation);
      if (!records.length) return;
      await transaction(['items'], 'readwrite', tx => {
        for (const record of records) tx.objectStore('items').delete([generation, record.id]);
      });
      await pause();
    }
  }

  async function fetchPage(offset) {
    let failure;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`https://items.sethp.org/api/v1/items?limit=${PAGE_SIZE}&offset=${offset}`, {
          credentials: 'omit', signal: controller.signal, cache: 'no-cache'
        });
        if (!response.ok) throw new Error(`Сайт предметов ответил HTTP ${response.status}`);
        const body = await response.json();
        if (!Number.isSafeInteger(body.total) || body.total < 1 || !Array.isArray(body.items) || body.items.length > PAGE_SIZE) {
          throw new Error('Некорректный ответ каталога');
        }
        for (const item of body.items) {
          if (!item || !Number.isSafeInteger(item.id) || item.id < 0 || typeof item.name !== 'string') throw new Error('Некорректная запись предмета');
        }
        return body;
      } catch (error) {
        failure = error;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1000));
      } finally { clearTimeout(timeout); }
    }
    throw failure;
  }

  async function download() {
    try {
      await loadState();
      if (state.retired) {
        await removeGeneration(state.retired);
        await saveState({ ...state, retired: null });
      }
      if (state.staging && Date.now() - state.staging.startedAt > DAY) {
        await removeGeneration(state.staging.generation);
        await saveState({ ...state, staging: null });
      }
      if (!state.staging) await saveState({ ...state, error: '', retryAt: 0, staging: {
        generation: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), offset: 0, total: null
      } });
      while (state.staging.total === null || state.staging.offset < state.staging.total) {
        const staging = state.staging;
        const body = await fetchPage(staging.offset);
        if ((staging.total !== null && body.total !== staging.total) || !body.items.length || staging.offset + body.items.length > body.total) {
          await removeGeneration(staging.generation);
          await saveState({ ...state, staging: null });
          throw new Error('Каталог изменился во время загрузки. Повторите обновление позже');
        }
        const next = { ...state, error: '', retryAt: 0, staging: { ...staging, total: body.total, offset: staging.offset + body.items.length } };
        await transaction(['items', 'meta'], 'readwrite', tx => {
          for (const item of body.items) tx.objectStore('items').put({ generation: staging.generation, id: item.id, data: item });
          tx.objectStore('meta').put(next, 'state');
        });
        state = next;
        if (next.staging.offset === body.total) break;
        await pause();
      }
      const staging = state.staging;
      const count = await transaction(['items'], 'readonly', tx => {
        const request = tx.objectStore('items').count(range(staging.generation));
        return () => request.result;
      });
      if (count !== staging.total) {
        await removeGeneration(staging.generation);
        await saveState({ ...state, staging: null });
        throw new Error('Неполный каталог: обнаружены повторяющиеся ID');
      }
      await saveState({ ...state, retired: state.active, active: staging.generation, updatedAt: Date.now(), total: count, staging: null, error: '', retryAt: 0 });
      searchIndex = null;
      indexTask = null;
    } catch (error) {
      const next = { ...state, error: error.name === 'AbortError' ? 'Превышено время ожидания сайта предметов' : error.message, retryAt: Date.now() + 60000 };
      state = next;
      try { await saveState(next); } catch { }
    }
  }

  function refresh(force = false) {
    if (updating || Date.now() < state.retryAt) return;
    if (!force && state.active && !state.staging && Date.now() - state.updatedAt < DAY) return;
    updating = download().finally(() => { updating = null; });
  }

  function status() {
    return { ready: !!state.active, updatedAt: state.updatedAt, total: state.total, updating: !!updating,
      loaded: state.staging?.offset || 0, downloadTotal: state.staging?.total, error: state.error, retryAt: state.retryAt };
  }

  async function getIndex(generation) {
    if (searchIndex?.generation === generation) return searchIndex;
    if (indexTask?.generation === generation) return indexTask.promise;
    const promise = (async () => {
      const entries = [];
      let after = -1;
      while (true) {
        const records = await readBatch(generation, after);
        if (!records.length) break;
        for (const { data } of records) entries.push([data.id, normalize(data.name)]);
        after = records.at(-1).id;
        await pause();
      }
      const index = { generation, entries };
      if (state.active === generation) searchIndex = index;
      return index;
    })();
    indexTask = { generation, promise };
    try { return await promise; } finally { if (indexTask?.promise === promise) indexTask = null; }
  }

  async function getItems(generation, ids) {
    return transaction(['items'], 'readonly', tx => {
      const requests = ids.map(id => tx.objectStore('items').get([generation, id]));
      return () => requests.map(request => request.result?.data).filter(Boolean);
    });
  }

  async function handle(message) {
    await loadState();
    refresh(message.action === 'inventory_catalog_refresh');
    if (message.action === 'inventory_catalog_get') {
      const id = Number(message.id);
      if (!Number.isSafeInteger(id) || id < 0) throw new Error('Некорректный ID предмета');
      const generation = state.active;
      const items = generation ? await getItems(generation, [id]) : [];
      if (generation !== state.active) return handle(message);
      return { success: true, item: items[0] || null, status: status() };
    }
    if (message.action !== 'inventory_catalog_search' || !state.active) return { success: true, items: [], total: 0, status: status(), requestId: message.requestId };
    const generation = state.active;
    const query = normalize(String(message.query || '').slice(0, 250));
    const page = Math.max(0, Math.floor(Number(message.page) || 0));
    const start = page * 50;
    const index = await getIndex(generation);
    const numeric = /^\d+$/.test(query);
    let total = 0;
    const ids = [];
    const accept = id => { if (total >= start && ids.length < 50) ids.push(id); total++; };
    if (numeric && index.entries.some(entry => String(entry[0]) === query)) accept(Number(query));
    for (let i = 0; i < index.entries.length; i++) {
      const [id, name] = index.entries[i];
      if (numeric ? String(id) !== query && String(id).startsWith(query) : !query || name.includes(query)) accept(id);
      if (i && i % 4000 === 0) await pause();
    }
    if (generation !== state.active) return handle(message);
    const items = await getItems(generation, ids);
    if (generation !== state.active) return handle(message);
    return { success: true, items, total, page, requestId: message.requestId, status: status() };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!['inventory_catalog_status', 'inventory_catalog_search', 'inventory_catalog_get', 'inventory_catalog_refresh'].includes(message?.action)) return;
    handle(message).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  });
})();
