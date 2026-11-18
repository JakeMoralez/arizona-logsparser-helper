/* Shared controls for dialogs and explicitly marked page fields. */
(function () {
  'use strict';
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${String(d.getFullYear()).padStart(4, '0')}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function parseDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m || +m[1] < 1) return null;
    const d = new Date(2000, +m[2] - 1, +m[3]);
    d.setFullYear(+m[1]);
    return iso(d) === value ? d : null;
  }
  function parseDisplay(value) {
    if (!value.trim()) return '';
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
    const result = m && `${m[3]}-${m[2]}-${m[1]}`;
    return result && parseDate(result) ? result : null;
  }
  const displayDate = value => parseDate(value) ? value.split('-').reverse().join('.') : '';
  const validTime = value => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const mounted = new WeakMap();
  let uid = 0;
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(text, label, action) {
    const el = element('button', 'alh-control-button', text);
    el.type = 'button';
    el.setAttribute('aria-label', label || text);
    el.addEventListener('click', action);
    return el;
  }
  function mount(root, onClose, options = {}) {
    if (mounted.has(root)) return;
    const controller = new AbortController();
    const { signal } = controller;
    const records = new Map();
    const previousFocus = document.activeElement;
    const page = options.page === true;
    const popupHost = page ? element('div', 'alh-controls-scope alh-page-popovers') : root;
    if (page) document.body.append(popupHost);
    let popup, anchor, returnFocus;
    const listen = (el, type, fn, options = {}) => el.addEventListener(type, fn, { ...options, signal });
    function dismiss(restore = false) {
      popup?.remove(); popup = null;
      anchor?.setAttribute('aria-expanded', 'false');
      anchor?.removeAttribute('aria-controls');
      if (restore && returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
      anchor = null;
    }
    function position() {
      if (!popup || !anchor) return;
      if (!anchor.isConnected || !anchor.getClientRects().length) { dismiss(); return; }
      const r = (anchor.closest('.alh-field-shell') || anchor).getBoundingClientRect();
      const body = anchor.closest('.alh-modal-body')?.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight || body && (r.bottom < body.top || r.top > body.bottom)) { dismiss(); return; }
      popup.style.maxHeight = '';
      const w = Math.min(popup.classList.contains('alh-combo-list') ? r.width : 300, window.innerWidth - 24);
      popup.style.width = `${w}px`;
      popup.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - w - 12))}px`;
      const below = Math.max(0, window.innerHeight - r.bottom - 18);
      const above = Math.max(0, r.top - 18);
      const up = below < popup.scrollHeight && above > below;
      popup.style.maxHeight = `${Math.min(up ? above : below, popup.classList.contains('alh-combo-list') ? 400 : Infinity)}px`;
      popup.style.top = `${up ? Math.max(12, r.top - popup.offsetHeight - 6) : r.bottom + 6}px`;
    }
    function show(target, className, role) {
      dismiss(); anchor = target; returnFocus = target;
      popup = element('div', `alh-control-popover ${className}`);
      popup.id = `alh-popover-${++uid}`;
      popup.setAttribute('role', role);
      target.setAttribute('aria-controls', popup.id);
      target.setAttribute('aria-expanded', 'true');
      popupHost.append(popup);
      return popup;
    }
    function emit(input) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (page) input.dispatchEvent(new CustomEvent('alh-site-change', { bubbles: true }));
    }
    function validate() {
      for (const record of records.values()) {
        if (!record.proxy) continue;
        const { input, proxy, error, kind } = record;
        let message = record.invalid && !record.partial ? (kind === 'date' ? 'Введите дату ДД.ММ.ГГГГ' : kind === 'datetime' ? 'Введите дату и время ДД.ММ.ГГГГ ЧЧ:ММ:СС' : 'Введите время ЧЧ:ММ') : '';
        if (!message && input.value && ((input.min && input.value < input.min) || (input.max && input.value > input.max))) message = 'Значение вне допустимого диапазона';
        if (!message && kind === 'date' && input.id.includes('from')) {
          const otherId = input.id.replace('from', 'to');
          const other = root.querySelector(`#${otherId}`);
          if (input.value && other?.value && input.value > other.value) message = 'Начало периода позже окончания';
        }
        if (!message && input.name === 'min_period') {
          const end = root.querySelector('[name="max_period"]');
          if (input.value && end?.value && input.value > end.value) message = 'Начало периода позже окончания';
        }
        if (error.textContent !== message) error.textContent = message;
        error.hidden = !message;
        proxy.setAttribute('aria-invalid', String(!!message));
      }
    }
    function calendar(record) {
      const { input, proxy } = record;
      const panel = show(proxy, 'alh-calendar', 'dialog');
      panel.setAttribute('aria-label', 'Выбор даты');
      const datetime = record.kind === 'datetime';
      let chosenDate = input.value.slice(0, 10);
      let chosenTime = input.value.slice(11) || '00:00:00';
      let selected = parseDate(chosenDate) || new Date();
      let view = new Date(selected); view.setDate(1);
      let monthMode = false;
      function choose(date) {
        if (datetime && date) { chosenDate = date; render(); return; }
        input.value = date;
        emit(input); dismiss(true);
      }
      function render(focusDate) {
        panel.replaceChildren();
        const header = element('div', 'alh-calendar-header');
        header.append(button('‹', 'Предыдущий месяц', () => { view.setMonth(view.getMonth() - 1); render(); }));
        header.append(button(MONTHS[view.getMonth()], 'Выбрать месяц', () => { monthMode = !monthMode; render(); }));
        const year = element('input', 'alh-calendar-year');
        year.type = 'number'; year.min = '1'; year.max = '9999'; year.value = view.getFullYear();
        year.setAttribute('aria-label', 'Год');
        year.addEventListener('change', () => {
          const n = Number(year.value);
          if (Number.isInteger(n) && n >= 1 && n <= 9999) { view.setFullYear(n); render(); }
          else year.value = view.getFullYear();
        });
        header.append(year, button('›', 'Следующий месяц', () => { view.setMonth(view.getMonth() + 1); render(); }));
        panel.append(header);
        if (monthMode) {
          const months = element('div', 'alh-calendar-months');
          MONTHS.forEach((m, i) => months.append(button(m, m, () => { view.setMonth(i); monthMode = false; render(); })));
          panel.append(months);
        } else {
          const week = element('div', 'alh-calendar-week');
          ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => week.append(element('span', '', d)));
          const grid = element('div', 'alh-calendar-grid');
          const start = new Date(view); start.setDate(1 - (view.getDay() + 6) % 7);
          const dates = [...records.values()].filter(r => r.kind === 'date');
          const from = dates.find(r => r.input.id === input.id.replace('to', 'from'))?.input.value;
          const to = dates.find(r => r.input.id === input.id.replace('from', 'to'))?.input.value;
          for (let i = 0; i < 42; i++) {
            const d = new Date(start); d.setDate(start.getDate() + i);
            const value = iso(d);
            const day = button(String(d.getDate()), displayDate(value), () => choose(value));
            day.dataset.date = value;
            day.classList.toggle('is-outside', d.getMonth() !== view.getMonth());
            day.classList.toggle('is-today', value === iso(new Date()));
            day.classList.toggle('is-selected', value === (datetime ? chosenDate : input.value));
            day.classList.toggle('is-range', !!from && !!to && from <= value && value <= to);
            day.setAttribute('aria-pressed', String(value === (datetime ? chosenDate : input.value)));
            day.disabled = (+value.slice(0, 4) < 1 || +value.slice(0, 4) > 9999 || !!input.min && value < input.min || !!input.max && value > input.max);
            day.tabIndex = value === (focusDate || chosenDate || iso(selected)) ? 0 : -1;
            day.addEventListener('keydown', e => {
              const next = new Date(d);
              const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -(d.getDay() + 6) % 7, End: 6 - (d.getDay() + 6) % 7 };
              if (e.key in moves) next.setDate(next.getDate() + moves[e.key]);
              else if (e.key === 'PageUp' || e.key === 'PageDown') {
                const dayOfMonth = next.getDate();
                next.setDate(1); next.setMonth(next.getMonth() + (e.key === 'PageUp' ? -1 : 1));
                const end = new Date(next); end.setMonth(end.getMonth() + 1, 0);
                next.setDate(Math.min(dayOfMonth, end.getDate()));
              } else return;
              e.preventDefault(); view = new Date(next); view.setDate(1); render(iso(next));
            });
            grid.append(day);
          }
          panel.append(week, grid);
        }
        if (datetime) {
          const time = element('div', 'alh-datetime-time');
          const parts = chosenTime.split(':');
          ['Часы', 'Минуты', 'Секунды'].forEach((name, index) => {
            const label = element('label', '', name);
            const field = element('input'); field.type = 'number'; field.min = '0'; field.max = index ? '59' : '23'; field.value = parts[index];
            field.addEventListener('input', () => { parts[index] = pad(Number(field.value)); chosenTime = parts.join(':'); });
            label.append(field); time.append(label);
          });
          time.append(button('Готово', '', () => {
            if (![...time.querySelectorAll('input')].every(f => f.value && f.reportValidity())) return;
            input.value = `${chosenDate || iso(new Date())} ${chosenTime}`; emit(input); dismiss(true);
          }));
          panel.append(time);
        }
        const footer = element('div', 'alh-calendar-footer');
        const today = iso(new Date());
        const todayButton = button('Сегодня', '', () => choose(today));
        todayButton.disabled = !!input.min && today < input.min || !!input.max && today > input.max;
        footer.append(todayButton, button('Очистить', '', () => choose('')));
        panel.append(footer); position();
        if (focusDate) panel.querySelector(`[data-date="${focusDate}"]`)?.focus();
      }
      render();
      panel.querySelector('.alh-calendar-grid [tabindex="0"]')?.focus();
    }
    function timePicker(record) {
      const panel = show(record.proxy, 'alh-time-picker', 'dialog');
      panel.setAttribute('aria-label', 'Выбор времени');
      const current = record.input.value || '00:00';
      const fields = current.split(':').map((value, i) => {
        const label = element('label', 'alh-time-part', i ? 'Минуты' : 'Часы');
        const field = element('input');
        field.type = 'number'; field.min = '0'; field.max = i ? '59' : '23'; field.value = value;
        label.append(field); panel.append(label); return field;
      });
      panel.append(button('Готово', '', () => {
        if (!fields.every(f => f.reportValidity() && f.value !== '')) return;
        record.input.value = fields.map(f => pad(Number(f.value))).join(':'); emit(record.input); dismiss(true);
      }), button('Очистить', '', () => { record.input.value = ''; emit(record.input); dismiss(true); }));
      position(); fields[0].focus();
    }
    function field(input) {
      const kind = input.dataset.alhKind || input.type;
      const wrap = element('div', 'alh-field-control');
      const proxy = element('input', 'arz-input alh-field-display');
      proxy.type = 'text'; proxy.autocomplete = 'off'; proxy.inputMode = 'numeric';
      proxy.id = `${input.id || 'alh-field-' + ++uid}-display`;
      proxy.placeholder = kind === 'datetime' ? 'ДД.ММ.ГГГГ ЧЧ:ММ:СС' : kind === 'date' ? 'ДД.ММ.ГГГГ' : 'ЧЧ:ММ';
      const label = root.querySelector(`label[for="${input.id}"]`) || input.closest('.arz-modal-form-group, .js_component_filter_item, #alh-date-shortcut-wrap')?.querySelector('label');
      if (label) { label.htmlFor = proxy.id; proxy.setAttribute('aria-label', label.textContent.trim()); }
      else proxy.setAttribute('aria-label', input.getAttribute('aria-label') || (kind !== 'time' ? 'Дата' : 'Время'));
      const error = element('span', 'alh-field-error'); error.hidden = true; error.id = `${proxy.id}-error`; error.setAttribute('aria-live', 'polite');
      proxy.setAttribute('aria-describedby', error.id);
      const record = { input, proxy, error, kind, invalid: false };
      records.set(input, record);
      const sync = () => {
        proxy.value = kind === 'datetime' ? (input.value ? displayDate(input.value.slice(0, 10)) + ' ' + input.value.slice(11) : '') : kind === 'date' ? displayDate(input.value) : input.value;
        proxy.disabled = input.disabled; proxy.required = input.required;
        trigger.disabled = input.disabled;
        record.invalid = false; validate();
      };
      record.sync = sync;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      Object.defineProperty(input, 'value', {
        configurable: true,
        get() { return descriptor.get.call(this); },
        set(value) { descriptor.set.call(this, value); sync(); }
      });
      const shell = element('div', 'alh-field-shell');
      if (page) listen(shell, 'click', e => e.stopPropagation());
      input.before(wrap); wrap.append(input, shell, error); shell.append(proxy);
      input.hidden = true;
      const trigger = button('', kind !== 'time' ? 'Открыть календарь' : 'Открыть выбор времени', () => {
        if (proxy.disabled) return;
        if (anchor === proxy) dismiss(true); else kind !== 'time' ? calendar(record) : timePicker(record);
      });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', kind !== 'time' ? 'M7 3v4m10-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1ZM8 14h2m4 0h2m-8 3h2' : 'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z');
      svg.append(path); trigger.append(svg);
      trigger.classList.add('alh-field-trigger');
      proxy.setAttribute('aria-haspopup', 'dialog'); proxy.setAttribute('aria-expanded', 'false');
      shell.append(trigger);
      listen(proxy, 'input', () => {
        if (kind === 'time' && /^\d{4}$/.test(proxy.value)) {
          proxy.value = proxy.value.slice(0,2) + ':' + proxy.value.slice(2);
          proxy.setSelectionRange(5,5);
        }
        const parts = proxy.value.trim().split(/\s+/);
        const value = kind === 'datetime' ? (!proxy.value.trim() ? '' : parts.length === 2 && parseDisplay(parts[0]) && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(parts[1]) ? `${parseDisplay(parts[0])} ${parts[1]}` : null) : kind === 'date' ? parseDisplay(proxy.value) : validTime(proxy.value) ? proxy.value : null;
        record.invalid = value === null;
        record.partial = kind === 'time' && /^\d{1,2}:?\d?$/.test(proxy.value) && proxy.value.replace(':','').length < 4;
        descriptor.set.call(input, value === null ? '' : value);
        validate(); emit(input);
      });
      listen(proxy, 'blur', () => { record.partial = false; validate(); });
      listen(proxy, 'keydown', e => { if (e.key === 'ArrowDown' && (e.altKey || !popup)) { e.preventDefault(); kind !== 'time' ? calendar(record) : timePicker(record); } });
      listen(input, 'change', () => { if (!record.invalid) sync(); });
      listen(input, 'alh-site-sync', sync);
      sync();
    }
    function combo(input) {
      const isSelect = input.tagName === 'SELECT';
      const multiple = isSelect && input.multiple;
      const searchable = isSelect && (multiple || input.name === 'server_number');
      const listId = input.getAttribute('list');
      const proxy = isSelect ? element('input', 'arz-input alh-combo-display') : input;
      const wrap = isSelect ? element('div', 'alh-combo-control') : null;
      if (listId) input.removeAttribute('list');
      if (isSelect) {
        input.hidden = true; input.after(wrap); wrap.append(proxy);
        proxy.readOnly = true; proxy.placeholder = multiple ? 'Выберите типы логов' : 'Выберите значение';
        proxy.id = `${input.id || 'alh-select-' + ++uid}-display`;
        const clear = button('×', 'Очистить выбор', () => {
          for (const option of input.options) option.selected = false;
          if (!multiple) input.value = '';
          emit(input); sync(); dismiss(true);
        });
        if (multiple) { clear.classList.add('alh-combo-clear'); wrap.append(clear); }
      }
      input.classList.add('alh-combo-source');
      records.set(input, { input, combo: true, proxy: null, sync: () => sync() });
      proxy.setAttribute('role', 'combobox'); proxy.setAttribute('aria-autocomplete', isSelect ? 'none' : 'list');
      proxy.setAttribute('aria-expanded', 'false'); proxy.setAttribute('aria-haspopup', 'listbox');
      proxy.setAttribute('autocomplete', 'off');
      const label = root.querySelector(`label[for="${input.id}"]`) || input.closest('[class*="js_component_filter_item"], label')?.querySelector('label');
      const labelText = label?.textContent.trim() || ({server_number:'Сервер', 'type[]':'Тип логов',sort:'Сортировка',limit:'Количество записей'}[input.name]);
      if (labelText) proxy.setAttribute('aria-label', labelText);
      let active = -1, results = [], query = '', renderedQuery = '';
      function sync() {
        if (!isSelect) return;
        proxy.disabled = input.disabled;
        const selected = [...input.selectedOptions];
        proxy.value = multiple ? selected.length > 1 ? `Выбрано: ${selected.length}` : selected[0]?.label || '' : selected[0]?.textContent || '';
        proxy.title = selected.map(o => o.label).join('\n');
        if (multiple) wrap.querySelector('.alh-combo-clear').hidden = selected.length === 0;
      }
      if (isSelect) {
        const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(input, 'value', { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
        listen(input, 'change', sync); listen(input, 'alh-site-sync', sync); sync();
      }
      function choose(option) {
        if (multiple) option.selected = !option.selected;
        else input.value = option.value;
        emit(input); sync();
        if (multiple) { render(); popup?.querySelector('.alh-combo-search')?.focus(); }
        else dismiss(true);
      }
      function render() {
        const alreadyOpen = anchor === proxy;
        const panel = alreadyOpen ? popup : show(proxy, 'alh-combo-list', 'listbox');
        if (!alreadyOpen) query = '';
        if (multiple) panel.setAttribute('aria-multiselectable', 'true');
        const source = isSelect ? input : root.querySelector(`#${listId}`);
        const term = (isSelect ? query : proxy.value).toLocaleLowerCase('ru');
        const options = Array.from(source?.options || []).filter(o => !o.disabled && !o.hidden && `${o.label} ${o.value}`.toLocaleLowerCase('ru').includes(term));
        const hadSearchFocus = panel.querySelector('.alh-combo-search') === document.activeElement;
        const optionScroll = renderedQuery === query ? panel.querySelector('.alh-combo-options')?.scrollTop || 0 : 0; renderedQuery = query;
        panel.replaceChildren(); active = -1; results = [];
        proxy.removeAttribute('aria-activedescendant');
        if (searchable) {
          const search = element('input', 'arz-input alh-combo-search'); search.type = 'search'; search.placeholder = 'Поиск'; search.value = query;
          search.setAttribute('aria-label', `Поиск: ${labelText || 'варианты'}`);
          search.setAttribute('role', 'combobox'); search.setAttribute('aria-expanded', 'true'); search.setAttribute('aria-controls', panel.id);
          search.addEventListener('input', () => { query = search.value; render(); });
          search.addEventListener('keydown', keyboard);
          panel.append(search);
          if (hadSearchFocus) { search.focus(); }
        }
        if (multiple && input.selectedOptions.length) {
          const selected = element('section', 'alh-combo-selected');
          const header = element('div', 'alh-combo-selected-header', `Выбрано: ${input.selectedOptions.length}`);
          header.append(button('Очистить всё', '', () => { for (const o of input.options) o.selected = false; emit(input); sync(); render(); }));
          selected.append(header);
          const list = element('div', 'alh-combo-selected-list');
          for (const option of input.selectedOptions) {
            const row = element('div', 'alh-combo-selected-row');
            row.append(element('span', '', option.label), button('×', `Убрать ${option.label}`, () => choose(option)));
            list.append(row);
          }
          selected.append(list); panel.append(selected);
        }
        const optionList = element('div','alh-combo-options'); panel.append(optionList);
        for (const option of options) {
          const item = button(option.label || option.textContent || option.value, '', () => choose(option));
          item.id = `alh-option-${++uid}`; item.setAttribute('role', 'option'); item.tabIndex = -1;
          item.setAttribute('aria-selected', String(isSelect ? option.selected : option.value === input.value));
          if (multiple) item.classList.add('alh-multi-option');
          if (!isSelect && option.label && option.label !== option.value) item.append(element('small', '', option.value));
          item.addEventListener('mousedown', e => e.preventDefault());
          optionList.append(item); results.push({ item, option });
        }
        if (isSelect && input.dataset.alhAllowCustom === 'true' && query.trim() && ![...input.options].some(o => o.value === query.trim())) {
          optionList.append(button(`Добавить «${query.trim()}»`, '', () => { const o = new Option(query.trim(),query.trim()); input.add(o); choose(o); }));
        }
        if (!options.length) optionList.append(element('div', 'alh-combo-empty', isSelect ? 'Нет доступных вариантов' : 'Нет совпадений — можно ввести значение вручную'));
        position(); optionList.scrollTop = optionScroll;
      }
      function open() { render(); if (searchable) popup?.querySelector('.alh-combo-search')?.focus(); }
      function keyboard(e) {
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          if (!popup || anchor !== proxy) { if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return; render(); }
          e.preventDefault();
          active = e.key === 'Home' ? 0 : e.key === 'End' ? results.length - 1 : Math.max(0, Math.min(results.length - 1, active + (e.key === 'ArrowUp' ? -1 : 1)));
          results.forEach(({ item }, i) => item.classList.toggle('is-active', i === active));
          if (results[active]) { e.target.setAttribute('aria-activedescendant', results[active].item.id); results[active].item.scrollIntoView({ block: 'nearest' }); }
        } else if (e.key === 'Enter' && popup && anchor === proxy) {
          e.preventDefault(); if (results[active]) choose(results[active].option); else if (input.dataset.alhAllowCustom === 'true' && query.trim()) { const o=new Option(query.trim(),query.trim()); input.add(o); choose(o); } else dismiss();
        } else if (e.key === 'Tab') dismiss();
      }
      listen(proxy, 'click', open);
      listen(proxy, 'input', render);
      listen(proxy, 'keydown', keyboard);
      const observer = new MutationObserver(() => { sync(); if (anchor === proxy) render(); });
      const source = isSelect ? input : root.querySelector(`#${listId}`);
      if (source) observer.observe(source, { childList: true, subtree: true, attributes: true });
      signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    }
    function decorate() {
      if (!page) root.querySelectorAll('i.arz-accordion-chevron').forEach(old => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true'); svg.classList.add('arz-accordion-chevron');
        svg.style.cssText = old.style.cssText; svg.innerHTML = '<path d="m6 9 6 6 6-6"/>'; old.replaceWith(svg);
      });
      root.querySelectorAll('input[type="date"]:not(.alh-field-display), input[type="time"], input[data-alh-kind], input[list], select').forEach(input => {
        if (page && !input.matches('[data-alh-upgraded]')) return;
        if (!records.has(input)) input.matches('select, [list]') ? combo(input) : field(input);
      });
      if (page) return;
      root.querySelectorAll('.arz-modal-container, .arz-modal').forEach(dialog => {
        dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1;
        const title = dialog.querySelector('.arz-modal-title');
        if (title) { title.id ||= `alh-dialog-title-${++uid}`; dialog.setAttribute('aria-labelledby', title.id); }
      });
      root.querySelectorAll('.alh-modal-close-btn').forEach(b => {
        b.setAttribute('aria-label', 'Закрыть окно');
        if (b.querySelector('svg')) return;
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
      });
      root.querySelectorAll('.alh-modal-footer button').forEach(b => {
        if (b.textContent.trim() === 'Закрыть') { b.hidden = true; b.tabIndex = -1; }
      });
      root.querySelectorAll('.alh-modal-footer').forEach(footer => {
        footer.hidden = ![...footer.children].some(child => !child.hidden);
      });
      root.querySelectorAll('.arz-tab-btn, .forms-switch-btn, .similar-mode-btn, .repeats-mode-btn').forEach(b => b.setAttribute('aria-pressed', String(b.classList.contains('active'))));
      root.querySelectorAll('.arz-template-card').forEach(card => {
        if (card.hasAttribute('tabindex')) return;
        card.tabIndex = 0; card.setAttribute('role', 'button');
        card.querySelector('.btn-delete')?.setAttribute('aria-label', 'Удалить шаблон');
        listen(card, 'keydown', e => { if (e.target === card && ['Enter', ' '].includes(e.key)) { e.preventDefault(); card.click(); } });
      });
      root.querySelectorAll('span[id$="-btn"], .arz-accordion-header').forEach(el => {
        if (el.hasAttribute('tabindex')) return;
        el.tabIndex = 0; el.setAttribute('role', 'button');
        listen(el, 'keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); el.click(); } });
      });
      root.querySelectorAll('.arz-accordion-header').forEach(el => el.setAttribute('aria-expanded', String(getComputedStyle(el.nextElementSibling).display !== 'none')));
    }
    decorate();
    listen(root, 'alh-refresh-controls', decorate);
    let decorateTask = null;
    const observer = new MutationObserver(changes => {
      // Page controls are explicitly marked; unrelated form mutations need no scan.
      if (page && !changes.some(r => [...r.addedNodes].some(n => n.nodeType === 1 &&
        (n.matches('input[data-alh-upgraded], select[data-alh-upgraded]') || n.querySelector('input[data-alh-upgraded], select[data-alh-upgraded]'))))) return;
      if (decorateTask !== null) return;
      decorateTask = window.ArizonaRuntime?.schedule(() => { decorateTask = null; if (!signal.aborted) { decorate(); validate(); } }) ?? null;
      if (!window.ArizonaRuntime) { decorate(); validate(); }
    });
    observer.observe(root, { childList: true, subtree: true });
    listen(root, 'click', e => {
      if (e.target.closest('.alh-control-popover, .alh-field-trigger')) return;
      if (popup && e.target !== anchor) dismiss();
      const action = e.target.closest('.arz-btn-primary, button[type="submit"]');
      if (action) {
        validate();
        const invalid = [...records.values()].find(r => r.error && !r.error.hidden && r.proxy.getClientRects().length);
        if (invalid) { e.preventDefault(); e.stopImmediatePropagation(); invalid.proxy.focus(); }
      }
    }, { capture: true });
    listen(root, 'click', e => {
      if (e.target.closest('.arz-tab-btn, .arz-accordion-header, .forms-switch-btn, .similar-mode-btn, .repeats-mode-btn')) queueMicrotask(decorate);
      const shortcut = e.target.closest('.arz-btn-shortcut');
      if (shortcut) {
        shortcut.parentElement.querySelectorAll('.arz-btn-shortcut').forEach(b => b.setAttribute('aria-pressed', String(b === shortcut)));
      }
    });
    listen(root, 'input', e => {
      if (e.target.closest('.alh-field-control')) root.querySelectorAll('.arz-btn-shortcut').forEach(b => b.setAttribute('aria-pressed', 'false'));
    });
    listen(document, 'keydown', e => {
      const overlays = document.querySelectorAll('.alh-modal-overlay.open-active');
      if (page ? overlays.length > 0 || document.activeElement?.closest('.arz-filter-modal') && !root.contains(document.activeElement) : overlays[overlays.length - 1] !== root) return;
      if (page && !popup) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (popup) dismiss(true); else if (!page) onClose(); }
      if (!page && e.key === 'Tab') {
        const focusable = [...root.querySelectorAll('button, input, textarea, select, [tabindex="0"], a[href]')].filter(el => !el.disabled && el.getClientRects().length && el.tabIndex >= 0);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
      }
    }, { capture: true });
    listen(window, 'resize', position);
    listen(document, 'alh-dismiss-controls', () => dismiss());
    listen(root, 'scroll', position, { capture: true, passive: true });
    if (page) {
      listen(document, 'pointerdown', e => {
        const ownControl = anchor?.closest('.alh-combo-control, .alh-field-control');
        if (popup && !popupHost.contains(e.target) && !ownControl?.contains(e.target) && e.target !== anchor) dismiss();
      }, { capture: true });
      listen(root, 'reset', () => setTimeout(() => { if (signal.aborted) return; for (const record of records.values()) record.sync?.(); root.querySelectorAll('[data-alh-upgraded]').forEach(emit); }, 0));
      listen(root, 'change', e => { if (e.target.matches('[data-alh-upgraded]')) e.target.dispatchEvent(new CustomEvent('alh-site-change', { bubbles: true })); });
      listen(root, 'submit', e => { validate(); const invalid = [...records.values()].find(r => r.error && !r.error.hidden); if (invalid) {e.preventDefault();e.stopImmediatePropagation(); invalid.proxy.focus();} }, {capture:true});
    }
    listen(window, 'scroll', position, {capture:true, passive:true});
    if (!page) queueMicrotask(() => { if (!signal.aborted) root.querySelector('.arz-modal-container, .arz-modal')?.focus({preventScroll:true}); });
    mounted.set(root, () => {
      dismiss(); observer.disconnect(); controller.abort();
      for (const [input] of records) if (Object.hasOwn(input, 'value')) delete input.value;
      if (page) popupHost.remove();
      else if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    });
  }
  window.ArizonaModalControls = { mount, dismissAll() { document.dispatchEvent(new Event('alh-dismiss-controls')); }, unmount(root) { mounted.get(root)?.(); mounted.delete(root); }, date: { parseDate, parseDisplay, displayDate, validTime } };
})();
