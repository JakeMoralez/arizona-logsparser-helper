(() => {
  const labels = {
    id: 'ID предмета', model_id: 'ID модели', eng_name: 'Английское название', stack: 'Максимум в стаке',
    useable: 'Можно использовать', tradeable: 'Можно передать', droppable: 'Можно выбросить',
    is_custom: 'Тип', colored: 'Можно окрасить', enchanted: 'Можно заточить', slot_id: 'Слот',
    no_pic: 'Нет изображения', no_info: 'Нет информации'
  };
  const instanceLabels = { quantity: 'Количество', remaining: 'В инвентаре', unic_id: 'Уникальный ID', unic_id2: 'Уникальный ID 2',
    unic_id3: 'Уникальный ID 3', colorid: 'Цвет', enchantment: 'Заточка', durability: 'Прочность', quality: 'Качество',
    expires: 'Срок', extraId: 'Дополнительное значение' };
  const types = { CUSTOM_NONE: 'Стандартный', CUSTOM_SKIN: 'Скин', CUSTOM_OBJECT: 'Объект', CUSTOM_WEAPON: 'Оружие' };
  const format = value => value === null || value === undefined ? 'Нет данных' : typeof value === 'boolean' ? value ? 'Да' : 'Нет' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const typeName = value => types[value] || format(value);

  function icon(name) {
    const node = document.createElement('i');
    node.className = `fa-solid fa-${name}`;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function image(item) {
    const frame = element('span', undefined, 'alh-item-image');
    frame.append(icon('box-open'));
    frame.setAttribute('role', 'img');
    frame.setAttribute('aria-label', 'Нет изображения');
    const id = Number(item?.id);
    if (!item || item.no_pic || !Number.isSafeInteger(id) || id < 0) return frame;
    const primary = `https://items.sethp.org/images/${id}`;
    const candidates = [primary];
    try {
      const url = new URL(item.image_url);
      if (url.protocol === 'https:' && url.hostname === 'items.sethp.org' && !url.username && !url.password && !url.port && url.href !== primary) candidates.push(url.href);
    } catch { }
    const img = document.createElement('img');
    img.alt = item.name || 'Предмет';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    frame.classList.add('is-loading');
    img.addEventListener('load', () => {
      frame.classList.remove('is-loading');
      frame.classList.add('has-image');
      frame.removeAttribute('role');
      frame.removeAttribute('aria-label');
    });
    img.addEventListener('error', () => {
      if (candidates.length) img.src = candidates.shift();
      else {
        img.remove();
        frame.classList.remove('is-loading');
      }
    });
    img.src = candidates.shift();
    frame.append(img);
    return frame;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function fields(values, names) {
    const list = element('dl', undefined, 'alh-item-fields');
    for (const [key, label] of Object.entries(names)) {
      let value = values[key];
      if (key === 'is_custom') value = typeName(value);
      if (key === 'slot_id' && value === -1) value = 'Не занимает слот';
      if (key === 'slot_id' && value === 2) value = 'Лицо (2)';
      if (key === 'expires' && /01\.01\.1970/.test(value || '')) value += ' (служебная дата)';
      list.append(element('dt', label), element('dd', format(value)));
    }
    return list;
  }

  function section(title, content) {
    const node = element('section', undefined, 'alh-item-section');
    node.append(element('h4', title), content);
    return node;
  }

  function card(item, context = {}) {
    const root = element('div', undefined, 'alh-item-card');
    const header = element('div', undefined, 'alh-item-card-heading');
    const title = element('div', undefined, 'alh-item-heading-text');
    title.append(element('span', 'ПРЕДМЕТ ИНВЕНТАРЯ', 'alh-item-eyebrow'), element('h3', item?.name || context.name || `Предмет #${context.id}`));
    const badges = element('div', undefined, 'alh-item-badges');
    badges.append(element('span', `ID ${item?.id ?? context.id}`, 'alh-item-badge is-accent'));
    if (item) badges.append(element('span', typeName(item.is_custom), 'alh-item-badge'));
    title.append(badges);
    header.append(image(item), title);
    root.append(header);
    if (item) {
      root.append(section('Характеристики', fields(item, { model_id: 'Модель', eng_name: 'Название EN', stack: 'Максимум в стаке', slot_id: 'Слот' })));
      const capabilities = element('div', undefined, 'alh-item-capabilities');
      for (const [key, label] of Object.entries({ useable: 'Использование', tradeable: 'Передача', droppable: 'Выбрасывание', colored: 'Окрашивание', enchanted: 'Заточка' })) {
        const value = item[key];
        const feature = element('div', undefined, `alh-item-capability${value === true ? ' is-enabled' : ''}`);
        feature.append(icon(value === true ? 'check' : value === false ? 'minus' : 'question'), element('span', label), element('strong', format(value)));
        capabilities.append(feature);
      }
      root.append(section('Возможности', capabilities));
      if (item.no_info) root.append(element('p', 'Нет информации: источник пометил сведения о предмете как неполные.', 'alh-item-notice'));
    } else root.append(element('p', 'Предмет отсутствует в сохранённом каталоге.', 'alh-item-notice'));
    if (context.parameters && Object.keys(context.parameters).length) {
      root.append(section('Экземпляр из лога', fields(context.parameters, Object.fromEntries(Object.entries(instanceLabels).filter(([key]) => Object.hasOwn(context.parameters, key))))));
    }
    if (item) {
      const technical = { no_pic: item.no_pic, no_info: item.no_info };
      const extra = Object.fromEntries(Object.entries(item).filter(([key]) => !Object.hasOwn(labels, key) && !['name', 'image_url'].includes(key)));
      const details = element('details', undefined, 'alh-item-technical');
      details.append(element('summary', 'Дополнительные сведения'), fields({ ...technical, ...extra }, { no_pic: 'Нет изображения в источнике', no_info: 'Нет информации в источнике', ...Object.fromEntries(Object.keys(extra).map(key => [key, key])) }));
      root.append(details);
    }
    const source = element('a', 'items.sethp.org');
    source.href = 'https://items.sethp.org/';
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    const credit = element('small', 'Источник: ', 'alh-item-source');
    credit.append(source);
    root.append(credit);
    return root;
  }

  function loadingCard() {
    const root = element('div', undefined, 'alh-item-skeleton');
    root.setAttribute('aria-hidden', 'true');
    root.append(element('span', undefined, 'alh-item-skeleton-image'), element('span', undefined, 'alh-item-skeleton-line'));
    for (let i = 0; i < 6; i++) root.append(element('span', undefined, 'alh-item-skeleton-line'));
    return root;
  }

  function parse(text) {
    const prefix = /(?:не смог получить в инвентарь|получил(?: от игрока \S+)? в инвентарь|потерял из инвентаря|взял из багажника|положил в багажник|положил в шкаф дома №\s*\d+|взял из шкафа дома №\s*\d+|получил в хранилище \(storage\) предмет|забирает предмет \(storage\)|отправляет предмет|автоматически удален предмет из хранилища|выкидывает предмет)\s*/g;
    const actions = [...text.matchAll(prefix)];
    const results = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const start = action.index + action[0].length;
      const tail = text.slice(start, actions[i + 1]?.index ?? text.length);
      const match = /^(.*?)\s*(\[id:\s*(\d+)\]|\(ID:\s*(\d+))/i.exec(tail);
      if (!match) continue;
      const name = match[1].trim();
      let id = Number(match[3] ?? match[4]);
      const markerStart = start + match[0].length - match[2].length;
      let idStart = markerStart;
      let idEnd = start + match[0].length;
      if (/багажник/.test(action[0])) {
        const second = /^\s*(\[id:\s*(\d+)\])/i.exec(tail.slice(match[0].length));
        if (!second) continue;
        id = Number(second[2]);
        idStart = idEnd + second[0].length - second[1].length;
        idEnd += second[0].length;
      }
      if (!Number.isSafeInteger(id)) continue;
      const ranges = [];
      if (name) {
        const nameStart = start + match[1].indexOf(name);
        ranges.push([nameStart, nameStart + name.length]);
      }
      ranges.push([idStart, idEnd]);
      const parameters = {};
      const patterns = {
        quantity: /(?:в количестве|Кол-во)\s+(-?\d+)/i, remaining: /в инвентаре\s+(-?\d+)/i,
        unic_id: /\bunic_id:\s*(-?\d+)/, unic_id2: /\bunic_id2:\s*(-?\d+)/, unic_id3: /\bunic_id3:\s*(-?\d+)/,
        colorid: /\bcolorid:\s*(-?\d+)/, enchantment: /Заточка:\s*(-?\d+)/i,
        durability: /Проч\.:\s*(-?\d+(?:[.,]\d+)?)/i, quality: /Кач-во:\s*(-?\d+)/i,
        expires: /До:\s*(\d{2}:\d{2}(?::\d{2})?\s+\d{2}\.\d{2}\.\d{4})/i
      };
      for (const [key, pattern] of Object.entries(patterns)) {
        const value = pattern.exec(tail)?.[1];
        if (value !== undefined) parameters[key] = value;
      }
      if (/получил в хранилище/.test(action[0])) {
        const extra = /^\s*\(\s*(\d+)\s*\)/.exec(tail.slice(match[0].length));
        if (extra) parameters.extraId = extra[1];
      }
      results.push({ id, name, ranges, parameters });
    }
    return results;
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, response => {
          const error = chrome.runtime.lastError;
          if (error || !response?.success) reject(new Error(error?.message || response?.error || 'Каталог недоступен'));
          else resolve(response);
        });
      } catch (error) { reject(error); }
    });
  }

  globalThis.ArizonaInventory = { card, image, parse, send, typeName, element, icon, loadingCard };
})();
