(function () {
  const tasks = new Map();
  const channel = new MessageChannel();
  let taskId = 0;
  let taskPending = false;
  channel.port1.onmessage = () => {
    taskPending = false;
    const next = tasks.entries().next().value;
    if (!next) return;
    tasks.delete(next[0]);
    try { next[1](); }
    finally {
      if (tasks.size && !taskPending) {
        taskPending = true;
        channel.port2.postMessage(null);
      }
    }
  };
  function schedule(callback) {
    const id = ++taskId;
    tasks.set(id, callback);
    if (!taskPending) {
      taskPending = true;
      channel.port2.postMessage(null);
    }
    return id;
  }
  const frameTasks = new Map();
  let frameHandle = null;
  function armFrame() {
    if (frameHandle !== null) return;
    const run = () => {
      frameHandle = null;
      const next = frameTasks.entries().next().value;
      if (!next) return;
      frameTasks.delete(next[0]);
      try { next[1](); } finally { if (frameTasks.size) armFrame(); }
    };
    // Hidden tabs must still finish masking and release startup state.
    frameHandle = document.hidden ? setTimeout(run, 16) : requestAnimationFrame(run);
  }
  function scheduleFrame(callback) {
    const id = ++taskId; frameTasks.set(id, callback); armFrame(); return id;
  }
  function cancelTask(id) { tasks.delete(id); frameTasks.delete(id); }

  // One native viewport observer shared by row controls, copy buttons and inventory.
  const subscriptions = new Map();
  const lastEntries = new WeakMap();
  let viewport = null;
  function createRowObserver(callback) {
    const rows = new Set();
    const subscriber = {callback, rows};
    const initial = new Set(); let initialTask = null;
    function deliverInitial() {
      initialTask = null;
      const entries = [...initial].filter(row => rows.has(row) && row.isConnected).map(row => lastEntries.get(row)).filter(Boolean);
      initial.clear(); if (entries.length) callback(entries);
    }
    if (!viewport && typeof IntersectionObserver !== 'undefined') viewport = new IntersectionObserver(entries => {
      const deliveries = new Map();
      for (const entry of entries) { lastEntries.set(entry.target, entry); }
      for (const entry of entries) for (const sub of subscriptions.get(entry.target) || []) {
        if (!deliveries.has(sub)) deliveries.set(sub, []);
        deliveries.get(sub).push(entry);
      }
      for (const [sub, batch] of deliveries) sub.callback(batch);
    }, {rootMargin: '480px 0px'});
    return {
      observe(row) {
        if (rows.has(row)) return;
        rows.add(row);
        if (!subscriptions.has(row)) { subscriptions.set(row, new Set()); viewport?.observe(row); }
        subscriptions.get(row).add(subscriber);
        if (lastEntries.has(row)) { initial.add(row); if (initialTask === null) initialTask = schedule(deliverInitial); }
      },
      unobserve(row) {
        rows.delete(row); initial.delete(row); const subs = subscriptions.get(row); subs?.delete(subscriber);
        if (!subs?.size) { subscriptions.delete(row); lastEntries.delete(row); viewport?.unobserve(row); }
      },
      disconnect() { for (const row of [...rows]) this.unobserve(row); cancelTask(initialTask); initialTask = null; initial.clear(); }
    };
  }

  const waiters = new Map();
  let waiterObserver;
  let waiterTimer;

  function checkWaiters() {
    for (const [selector, callbacks] of waiters) {
      const element = document.querySelector(selector);
      if (!element) continue;
      waiters.delete(selector);
      for (const callback of callbacks) callback(element);
    }
    if (!waiters.size) stopWaiting();
  }

  function stopWaiting() {
    waiterObserver?.disconnect();
    waiterObserver = null;
    clearTimeout(waiterTimer);
    waiterTimer = null;
    waiters.clear();
  }

  function waitFor(selector, callback) {
    const element = document.querySelector(selector);
    if (element) {
      callback(element);
      return () => {};
    }
    if (!waiters.has(selector)) waiters.set(selector, new Set());
    waiters.get(selector).add(callback);
    if (!waiterObserver) {
      waiterObserver = new MutationObserver(checkWaiters);
      waiterObserver.observe(document.documentElement, { childList: true, subtree: true });
      waiterTimer = setTimeout(stopWaiting, 10000);
    }
    return () => {
      const callbacks = waiters.get(selector);
      callbacks?.delete(callback);
      if (!callbacks?.size) waiters.delete(selector);
      if (!waiters.size) stopWaiting();
    };
  }

  function createRowIndex() {
    let rows = new WeakMap();
    const emails = new Map();
    const tg = new Map();
    const vk = new Map();
    let revision = 0;
    function adjust(map, key, amount) {
      if (!key) return;
      const count = (map.get(key) || 0) + amount;
      if (count > 0) map.set(key, count);
      else map.delete(key);
    }
    function remove(row) {
      const data = rows.get(row);
      if (!data) return;
      adjust(emails, data.email, -1);
      for (const key of data.tg) adjust(tg, key, -1);
      adjust(vk, data.vk, -1);
      rows.delete(row);
      revision++;
    }
    function update(row) {
      const text = row.cells[1]?.textContent || '';
      const previous = rows.get(row);
      if (previous?.rendered === text) return previous;
      remove(row);
      const data = { text, rendered: text, tg: [] };
      if (/изменил почту|привязал почту/.test(text)) {
        data.email = text.match(/на\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)?.[1];
      }
      if (text.includes('привязывает аккаунт')) {
        const username = text.match(/@([A-Za-z0-9_]+)/)?.[1];
        const id = text.match(/TG ID:\s*(\d+)/)?.[1];
        if (username) data.tg.push(username);
        if (id) data.tg.push(id);
        data.vk = text.match(/([А-Яа-яA-Za-z0-9_]+)\s*\(VK ID:\s*(\d+)\)/)?.[2];
      }
      rows.set(row, data);
      adjust(emails, data.email, 1);
      for (const key of data.tg) adjust(tg, key, 1);
      adjust(vk, data.vk, 1);
      revision++;
      return data;
    }
    return {
      emails, tg, vk, update, remove,
      get revision() { return revision; },
      finish(row) {
        const data = rows.get(row);
        if (data) data.rendered = row.cells[1]?.textContent || '';
      },
      clear() {
        rows = new WeakMap();
        emails.clear();
        tg.clear();
        vk.clear();
        revision++;
      }
    };
  }

  window.ArizonaRuntime = { waitFor, stopWaiting, createRowIndex, schedule, scheduleFrame, createRowObserver, cancelTask };
})();
