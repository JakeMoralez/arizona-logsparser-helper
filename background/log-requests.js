function createLogRequestCoordinator(storage, clock = Date.now) {
  const key = 'arz_log_request_limits';
  const hour = 3600000;
  let state;
  let chain = Promise.resolve();
  const transact = action => {
    const result = chain.then(async () => {
      if (!state) {
        const saved = await new Promise(resolve => storage.get([key], resolve));
        state = { lastStart: 0, interval: 5000, pauseUntil: 0, history: [], queue: [], active: null, strikes: 0, epoch: 0, ...saved[key] };
      }
      const now = clock();
      state.history = state.history.filter(time => time > now - hour);
      state.queue = state.queue.filter(item => item.seen > now - 15000);
      if (state.active?.expires <= now) state.active = null;
      if (state.pauseUntil && now >= state.pauseUntil + hour) {
        state.interval = 5000;
        state.strikes = 0;
      }
      const value = action(state, now);
      await new Promise(resolve => storage.set({ [key]: state }, resolve));
      return value;
    });
    chain = result.catch(() => {});
    return result;
  };
  return {
    acquire(owner, id, epoch) {
      return transact((s, now) => {
        if (epoch !== undefined && epoch !== s.epoch) return { stopped: true, epoch: s.epoch };
        let item = s.queue.find(item => item.owner === owner && item.id === id);
        if (!item) { item = { owner, id, seen: now }; s.queue.push(item); }
        item.seen = now;
        const nextAt = Math.max(s.lastStart ? s.lastStart + s.interval : 0, s.pauseUntil,
          s.history.length >= 720 ? s.history[0] + hour : 0, s.active?.expires || 0);
        if (!s.active && s.queue[0] === item && nextAt <= now) {
          s.queue.shift();
          s.lastStart = now;
          s.history.push(now);
          s.active = { owner, id, expires: now + 45000 };
          return { granted: true, epoch: s.epoch };
        }
        return { granted: false, epoch: s.epoch, nextAt: Math.max(now + 1000, nextAt),
          reason: s.pauseUntil > now ? 'pause' : s.history.length >= 720 ? 'hour' : 'queue' };
      });
    },
    finish(owner, id, status, retryAfter) {
      return transact((s, now) => {
        if (s.active?.owner !== owner || s.active.id !== id) return { epoch: s.epoch, expired: true };
        s.active = null;
        let stopped = false;
        if (status === 429) {
          const seconds = Number(retryAfter);
          const retryAt = retryAfter && Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(retryAfter);
          s.pauseUntil = Math.max(s.pauseUntil, now + 60000, Number.isFinite(retryAt) ? retryAt : 0);
          s.interval = Math.min(60000, s.interval * 2);
          s.strikes++;
          if (s.strikes >= 3) {
            s.epoch++;
            s.strikes = 0;
            s.queue = [];
            stopped = true;
          }
        } else if (status >= 200 && status < 400) s.strikes = 0;
        return { stopped, epoch: s.epoch };
      });
    },
    cancel(owner, id) {
      return transact(s => {
        s.queue = s.queue.filter(item => item.owner !== owner || (id !== undefined && item.id !== id));
        if (s.active?.owner === owner && (id === undefined || s.active.id === id)) s.active = null;
        return { success: true };
      });
    }
  };
}

const logRequests = createLogRequestCoordinator(chrome.storage.local);

chrome.tabs.onRemoved.addListener(tabId => { logRequests.cancel(tabId).catch(console.error); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!['log_acquire', 'log_finish', 'log_cancel'].includes(message.action)) return;
  if (sender.tab?.id === undefined) { sendResponse({ error: 'Missing tab' }); return; }
  const owner = sender.tab.id;
  const work = message.action === 'log_acquire' ? logRequests.acquire(owner, message.id, message.epoch)
    : message.action === 'log_finish' ? logRequests.finish(owner, message.id, message.status, message.retryAfter)
      : logRequests.cancel(owner, message.id);
  work.then(async result => {
    if (result.stopped && message.action === 'log_finish') {
      const tabs = await chrome.tabs.query({ url: 'https://arizonarp.logsparser.info/*' });
      for (const tab of tabs) chrome.tabs.sendMessage(tab.id, { action: 'log_stop' }).catch(() => {});
    }
    sendResponse(result);
  }).catch(error => sendResponse({ error: error.message }));
  return true;
});
