(function () {
  const active = new Set();
  const message = data => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(data, result => {
      const error = chrome.runtime.lastError;
      if (error || result?.error || !result) reject(new Error(error?.message || result?.error || 'Очередь запросов недоступна'));
      else resolve(result);
    });
  });
  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Операция отменена', 'AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  chrome.runtime.onMessage.addListener(data => {
    if (data.action !== 'log_stop') return;
    for (const controller of active) controller.abort();
    document.querySelectorAll('.alh-modal-overlay [id$="cancel-btn"], #arz-multi-progress-cancel').forEach(button => button.click());
    window.ArizonaNotifications?.show('Автоматические операции остановлены после повторных 429. Повторите позже.', 'error');
  });
  async function request(url, options = {}) {
    if (new URL(url, location.href).origin !== 'https://arizonarp.logsparser.info') return fetch(url, options);
    const { onWait, signal: externalSignal, ...fetchOptions } = options;
    const controller = new AbortController();
    const signal = controller.signal;
    const abort = () => controller.abort();
    externalSignal?.addEventListener('abort', abort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    active.add(controller);
    let id;
    let epoch;
    let rateRetries = 0;
    let networkRetries = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        id = crypto.randomUUID();
        while (true) {
          signal.throwIfAborted();
          const permit = await message({ action: 'log_acquire', id, epoch });
          epoch = permit.epoch;
          signal.throwIfAborted();
          if (permit.stopped) throw new DOMException('Автоматические операции остановлены', 'AbortError');
          if (permit.granted) break;
          const seconds = Math.max(1, Math.ceil((permit.nextAt - Date.now()) / 1000));
          onWait?.(permit.reason === 'queue' ? 'Ожидание очереди · проверка через 1 с' : `${permit.reason === 'pause' ? 'Пауза после 429' : 'Часовой лимит'} · осталось ${seconds} с`);
          await sleep(1000, signal);
        }
        onWait?.('Загрузка данных...');
        const attempt = new AbortController();
        const abortAttempt = () => attempt.abort();
        signal.addEventListener('abort', abortAttempt, { once: true });
        const timer = setTimeout(abortAttempt, 30000);
        let response;
        let body;
        let networkError;
        try {
          signal.throwIfAborted();
          response = await fetch(url, { ...fetchOptions, signal: attempt.signal });
          body = await response.arrayBuffer();
        } catch (error) { networkError = !signal.aborted && error.name === 'AbortError' ? new Error('Превышено время ожидания логпарсера') : error; }
        finally { clearTimeout(timer); signal.removeEventListener('abort', abortAttempt); }
        const result = await message({ action: 'log_finish', id, status: response?.status || 0, retryAfter: response?.headers.get('Retry-After') });
        id = null;
        if (result.stopped || result.expired) throw new DOMException('Автоматические операции остановлены', 'AbortError');
        signal.throwIfAborted();
        if (networkError) {
          if (networkRetries++ >= 2) throw networkError;
          continue;
        }
        if (response.status === 429 && rateRetries++ < 2) continue;
        if (response.status === 429) throw new Error('Логпарсер ограничил запросы. Повторите позже.');
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status, statusText: response.statusText, headers: response.headers
        });
      }
    } finally {
      active.delete(controller);
      externalSignal?.removeEventListener('abort', abort);
      if (id) await message({ action: 'log_cancel', id }).catch(() => {});
    }
  }
  window.ArizonaLogRequests = { request };
})();
