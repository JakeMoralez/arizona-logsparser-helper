export function create(context) {
  const { openOverlay, closeOverlay, runWhenElementExists } = context;

    let settings = {};
    let source = 'first';

    const modalHTML = `
      <div id="alh-forms-overlay" class="alh-modal-overlay">
        <div class="arz-modal-container">
          <div class="alh-modal-header">
            <div class="arz-modal-icon-wrapper">
              <i class="fa-solid fa-list-check"></i>
            </div>
            <div class="arz-modal-title-block">
              <div class="arz-modal-title">Генератор команд</div>
              <div class="arz-modal-subtitle">{nick} — автоматически заменится на ник игрока</div>
            </div>
            <button id="alh-forms-close" class="alh-modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="alh-layout-63 alh-modal-body">
            <div class="arz-modal-form-group">
              <div class="alh-layout-43">
                <label class="arz-modal-label"><i class="fa-solid fa-terminal"></i> Шаблон команды</label>
                <span class="alh-layout-64">Пример: /banoff 0 {nick} 2000 Чит</span>
              </div>
              <textarea id="alh-form-template" class="arz-textarea" rows="3" placeholder="/banoff 0 {nick} 2000 Чит"></textarea>
            </div>
            <div class="arz-modal-form-group">
              <label class="alh-layout-65 arz-modal-label"><i class="fa-solid fa-user"></i> Источник ника</label>
              <div class="alh-layout-31">
                <button type="button" class="alh-layout-66 forms-switch-btn active" data-source="first">Первый ник</button>
                <button type="button" class="alh-layout-67 forms-switch-btn" data-source="second">Второй ник</button>
              </div>
            </div>
            <div class="arz-modal-form-group">
              <div class="alh-layout-43">
                <label class="arz-modal-label"><i class="fa-solid fa-list"></i> Сгенерированные команды</label>
                <span id="arz-commands-count" class="alh-layout-34">0</span>
              </div>
              <div id="alh-form-commands" class="arz-list-container"></div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-forms-close-bottom" class="alh-layout-11 arz-btn-danger">Закрыть</button>
            <button id="arz-copy-all-btn" class="alh-layout-11 arz-btn-primary">Копировать всё</button>
          </div>
        </div>
      </div>
    `;

    function extractNicks(src) {
      const nicks = [];
      document.querySelectorAll('table.table tbody tr').forEach(row => {
        const td = row.querySelectorAll('td')[1];
        if (!td) return;
        const links = td.querySelectorAll('a strong');
        const idx = src === 'second' ? 1 : 0;
        const name = links[idx]?.textContent.trim();
        if (name && !nicks.includes(name)) nicks.push(name);
      });
      return nicks;
    }

    function generate() {
      const template = document.getElementById('alh-form-template')?.value || '';
      const count = document.getElementById('arz-commands-count');
      const container = document.getElementById('alh-form-commands');
      if (!container) return;
      if (!template.trim() || !template.includes('{nick}')) {
        if (count) count.textContent = '0';
        container.innerHTML = '';
        return;
      }
      const nicks = extractNicks(source);
      if (count) count.textContent = nicks.length;
      container.innerHTML = '';
      nicks.forEach(nick => {
        const cmd = template.replace(/\{nick\}/g, nick);
        const item = document.createElement('div');
        item.className = 'arz-list-item';

        const txt = document.createElement('div');
        txt.className = 'arz-list-item-text';
        txt.textContent = cmd;

        const copyBtn = document.createElement('button');
        copyBtn.className = 'arz-list-item-btn';
        copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';

        const copyHandler = async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(cmd);
            window.ArizonaNotifications.show('✅ Команда скопирована', 'success');
          } catch (err) { }
        };
        copyBtn.onclick = copyHandler;
        item.onclick = copyHandler;

        item.appendChild(txt);
        item.appendChild(copyBtn);
        container.appendChild(item);
      });
    }

    function setup(modal) {
      modal.querySelector('#alh-forms-close').onclick = () => closeOverlay(modal);
      modal.querySelector('#arz-forms-close-bottom').onclick = () => closeOverlay(modal);
      modal.querySelector('#arz-copy-all-btn').onclick = async () => {
        const cmds = Array.from(modal.querySelectorAll('#alh-form-commands .arz-list-item-text')).map(el => el.textContent);
        if (cmds.length) {
          await navigator.clipboard.writeText(cmds.join('\n'));
          window.ArizonaNotifications.show(`✅ Скопировано ${cmds.length} команд`, 'success');
        }
      };
      const ta = modal.querySelector('#alh-form-template');
      ta.oninput = () => { generate(); localStorage.setItem('arz_forms_template', ta.value); };
      ta.value = localStorage.getItem('arz_forms_template') || '';

      const switchBtns = modal.querySelectorAll('.forms-switch-btn');
      switchBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === source);
        btn.onclick = () => {
          switchBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          source = btn.dataset.source;
          generate();
        };
      });
      generate();
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
        const isEnabled = context.currentSettings['extension-toggle'] !== false && settings.tools?.formsEnabled !== false;
        const existingBtn = document.getElementById('arz-forms-btn');
        if (isEnabled) {
          runWhenElementExists('.filter-buttons', () => this.injectButton());
        } else {
          if (existingBtn) existingBtn.remove();
        }
      },
      injectButton: function () {
        if (document.getElementById('arz-forms-btn')) return;
        const container = document.querySelector('.filter-buttons');
        if (!container) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'arz-forms-btn';
        btn.className = 'btn btn-success';
        btn.style.cssText = 'margin-left: 10px;';
        btn.innerHTML = `<i style="margin-right: 6px;" class="fa-solid fa-list-check"></i> Формы`;
        btn.onclick = () => this.openModal();

        container.appendChild(btn);
      },
      openModal: () => {
          const overlay = document.createElement('div');
          overlay.innerHTML = modalHTML;
          const el = overlay.firstElementChild;
          openOverlay(el);
          setup(el);
        }
    };

}
