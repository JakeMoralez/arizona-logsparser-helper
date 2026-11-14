(() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const db = new Promise((resolve, reject) => {
    const request = indexedDB.open('arizona-totp', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vault');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  async function transaction(mode, operation) {
    const database = await db;
    return new Promise((resolve, reject) => {
      const tx = database.transaction('vault', mode);
      const request = operation(tx.objectStore('vault'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function readFields(bytes) {
    const fields = [];
    let pos = 0;
    function varint() {
      let value = 0, factor = 1;
      for (let i = 0; i < 8; i++) {
        if (pos >= bytes.length) throw new Error('Повреждённая ссылка экспорта');
        const byte = bytes[pos++];
        value += (byte & 127) * factor;
        if (!Number.isSafeInteger(value)) throw new Error('Повреждённая ссылка экспорта');
        if (!(byte & 128)) return value;
        factor *= 128;
      }
      throw new Error('Повреждённая ссылка экспорта');
    }
    while (pos < bytes.length) {
      const tag = varint(), number = Math.floor(tag / 8), wire = tag % 8;
      if (!number) throw new Error('Повреждённая ссылка экспорта');
      let value;
      if (wire === 0) value = varint();
      else if (wire === 2) {
        const length = varint();
        if (length > bytes.length - pos) throw new Error('Повреждённая ссылка экспорта');
        value = bytes.slice(pos, pos + length);
        pos += length;
      } else if (wire === 1 || wire === 5) {
        const length = wire === 1 ? 8 : 4;
        if (length > bytes.length - pos) throw new Error('Повреждённая ссылка экспорта');
        pos += length;
        continue;
      } else throw new Error('Повреждённая ссылка экспорта');
      fields.push({ number, wire, value });
    }
    return fields;
  }

  function parseMigration(input) {
    let url;
    try { url = new URL(input); } catch { throw new Error('Некорректная ссылка экспорта'); }
    if (url.protocol !== 'otpauth-migration:' || url.hostname !== 'offline' || url.searchParams.getAll('data').length !== 1) throw new Error('Некорректная ссылка экспорта');
    const encoded = url.searchParams.get('data').replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    if (!encoded || encoded.length > 65536 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) throw new Error('Некорректные данные экспорта');
    let bytes;
    try { bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0)); } catch { throw new Error('Некорректные данные экспорта'); }
    const fields = readFields(bytes);
    const accounts = fields.filter(field => field.number === 1 && field.wire === 2);
    const batchSize = fields.find(field => field.number === 3 && field.wire === 0)?.value ?? 1;
    if (batchSize > 1 || accounts.length !== 1) throw new Error('Экспортируйте ровно один аккаунт в одном QR-коде');
    const account = readFields(accounts[0].value);
    const get = (number, wire) => {
      const matches = account.filter(field => field.number === number);
      if (matches.length > 1 || (matches.length && matches[0].wire !== wire)) throw new Error('Повреждённая ссылка экспорта');
      return matches[0]?.value;
    };
    const secretBytes = get(1, 2);
    const algorithm = { 0: 'SHA-1', 1: 'SHA-1', 2: 'SHA-256', 3: 'SHA-512' }[get(4, 0) ?? 0];
    const digits = { 0: 6, 1: 6, 2: 8 }[get(5, 0) ?? 0];
    if (get(6, 0) !== 2) throw new Error('Поддерживаются только аккаунты TOTP');
    if (!algorithm || !digits || !secretBytes?.length) throw new Error('Неподдерживаемые параметры экспорта');
    let bits = 0, value = 0, secret = '';
    for (const byte of secretBytes) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) { bits -= 5; secret += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value >>> bits) & 31]; value &= (1 << bits) - 1; }
    }
    if (bits) secret += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value << (5 - bits)) & 31];
    return { secret, algorithm, digits, period: 30 };
  }

  function parse(input) {
    let secret = input.trim();
    let algorithm = 'SHA-1', digits = 6, period = 30;
    if (/^otpauth-migration:/i.test(secret)) return parseMigration(secret);
    if (/^otpauth:/i.test(secret)) {
      let url;
      try { url = new URL(secret); } catch { throw new Error('Некорректная ссылка 2FA'); }
      if (url.protocol !== 'otpauth:' || url.hostname !== 'totp') throw new Error('Поддерживаются только ссылки TOTP');
      for (const key of ['secret', 'algorithm', 'digits', 'period']) if (url.searchParams.getAll(key).length > 1) throw new Error('Повторяющиеся параметры ссылки');
      secret = url.searchParams.get('secret') || '';
      const name = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase();
      algorithm = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[name];
      const digitText = url.searchParams.get('digits') || '6';
      const periodText = url.searchParams.get('period') || '30';
      if (!/^(6|8)$/.test(digitText) || !/^[1-9]\d*$/.test(periodText)) throw new Error('Некорректные параметры кода');
      digits = Number(digitText);
      period = Number(periodText);
      if (!algorithm || !Number.isSafeInteger(period)) throw new Error('Неподдерживаемые параметры кода');
    }
    secret = secret.replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z2-7]+={0,6}$/.test(secret)) throw new Error('Некорректный секрет Base32');
    const raw = secret.replace(/=+$/, '');
    if (![0, 2, 4, 5, 7].includes(raw.length % 8)) throw new Error('Некорректная длина секрета Base32');
    if (secret.includes('=') && (secret.length % 8 !== 0 || secret.length - raw.length !== (8 - raw.length % 8) % 8)) throw new Error('Некорректный секрет Base32');
    let bits = 0, value = 0;
    const bytes = [];
    for (const char of raw) {
      value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
      bits += 5;
      if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); value &= (1 << bits) - 1; }
    }
    if (!bytes.length || value !== 0) throw new Error('Некорректный секрет Base32');
    return { secret: raw, algorithm, digits, period };
  }

  async function save(input) {
    const params = parse(input);
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(params)));
    await transaction('readwrite', store => store.put({ version: 1, key, iv, ciphertext }, 'account'));
  }

  async function current(now = Date.now()) {
    const record = await transaction('readonly', store => store.get('account'));
    if (!record) return null;
    if (record.version !== 1 || !record.key || !record.iv || !record.ciphertext) throw new Error('Данные 2FA повреждены');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, record.key, record.ciphertext);
    const params = parseParams(JSON.parse(decoder.decode(plaintext)));
    const raw = params.secret;
    let bits = 0, value = 0;
    const bytes = [];
    for (const char of raw) { value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char); bits += 5; if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); value &= (1 << bits) - 1; } }
    const key = await crypto.subtle.importKey('raw', new Uint8Array(bytes), { name: 'HMAC', hash: params.algorithm }, false, ['sign']);
    const counter = BigInt(Math.floor(now / 1000 / params.period));
    const message = new Uint8Array(8);
    new DataView(message.buffer).setBigUint64(0, counter);
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
    const offset = digest[digest.length - 1] & 15;
    const number = new DataView(digest.buffer).getUint32(offset) & 0x7fffffff;
    return { code: String(number % 10 ** params.digits).padStart(params.digits, '0'), remaining: params.period - Math.floor(now / 1000) % params.period };
  }

  function parseParams(params) {
    if (!params || !['SHA-1', 'SHA-256', 'SHA-512'].includes(params.algorithm) || ![6, 8].includes(params.digits) || !Number.isSafeInteger(params.period) || params.period < 1) throw new Error('Данные 2FA повреждены');
    const validated = parse(params.secret);
    return { ...validated, algorithm: params.algorithm, digits: params.digits, period: params.period };
  }

  document.addEventListener('DOMContentLoaded', () => {
    const el = id => document.getElementById('totp-' + id);
    const status = message => { el('status').textContent = message; };
    let editing = false, codeVisible = false, generation = 0;
    async function refresh() {
      const serial = ++generation;
      try {
        const result = await current();
        if (serial !== generation) return;
        el('current').hidden = !result;
        el('replace').hidden = !result;
        el('delete').hidden = !result;
        el('form').hidden = !!result && !editing;
        el('timer').textContent = result ? `Обновление через ${result.remaining} с` : '';
        el('code').textContent = result && codeVisible ? result.code : '••••••';
      } catch {
        if (serial !== generation) return;
        el('current').hidden = true;
        el('form').hidden = true;
        el('replace').hidden = true;
        el('delete').hidden = false;
        el('timer').textContent = '';
        status('Не удалось прочитать данные 2FA. Удалите их и настройте заново.');
      }
    }
    el('form').addEventListener('submit', async event => {
      event.preventDefault();
      try { await save(el('secret').value); el('secret').value = ''; editing = false; status('Секрет сохранён'); await refresh(); }
      catch (error) { status(error.message || 'Не удалось сохранить секрет'); }
    });
    el('replace').addEventListener('click', () => { editing = true; el('form').hidden = false; el('secret').focus(); });
    el('delete').addEventListener('click', async () => {
      if (!confirm('Удалить сохранённый секрет 2FA?')) return;
      try { await transaction('readwrite', store => store.delete('account')); el('secret').value = ''; editing = false; status('Секрет удалён'); await refresh(); }
      catch { status('Не удалось удалить данные 2FA'); }
    });
    el('toggle').addEventListener('click', () => {
      codeVisible = !codeVisible;
      el('toggle').textContent = codeVisible ? 'Скрыть' : 'Показать';
      el('toggle').setAttribute('aria-pressed', String(codeVisible));
      if (!codeVisible) el('code').textContent = '••••••';
      refresh();
    });
    el('copy').addEventListener('click', async () => {
      try {
        if (!await chrome.permissions.request({ permissions: ['clipboardWrite'] })) {
          status('Для копирования кода разрешите доступ к буферу обмена');
          return;
        }
      } catch {
        status('Не удалось запросить разрешение на копирование');
        return;
      }
      try { const result = await current(); if (!result) throw new Error(); await navigator.clipboard.writeText(result.code); status('Код скопирован'); await refresh(); }
      catch { status('Не удалось скопировать код'); }
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    window.addEventListener('focus', refresh);
    setInterval(() => { if (!document.hidden) refresh(); }, 1000);
    refresh();
  });
})();
