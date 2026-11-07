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
          <div class="alh-modal-body" style="gap: 18px !important;">
            <div class="arz-modal-form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="arz-modal-label"><i class="fa-solid fa-terminal"></i> Шаблон команды</label>
                <span style="font-size: 10px; color: var(--az-text-secondary); background: var(--az-input-bg); border: 1px solid var(--az-border); padding: 3px 8px; border-radius: 12px;">Пример: /banoff 0 {nick} 2000 Чит</span>
              </div>
              <textarea id="alh-form-template" class="arz-textarea" rows="3" placeholder="/banoff 0 {nick} 2000 Чит"></textarea>
            </div>
            <div class="arz-modal-form-group">
              <label class="arz-modal-label" style="margin-bottom: 4px;"><i class="fa-solid fa-user"></i> Источник ника</label>
              <div style="display: flex; gap: 8px; background: var(--az-input-bg); padding: 6px; border-radius: 14px; border: 1px solid var(--az-border);">
                <button type="button" class="forms-switch-btn active" data-source="first" style="flex: 1; padding: 10px 16px; background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); border: none; border-radius: 10px; font-size: 13px; font-weight: 600; color: white; cursor: pointer; transition: all 0.2s;">Первый ник</button>
                <button type="button" class="forms-switch-btn" data-source="second" style="flex: 1; padding: 10px 16px; background: transparent; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--az-text-secondary); cursor: pointer; transition: all 0.2s;">Второй ник</button>
              </div>
            </div>
            <div class="arz-modal-form-group">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label class="arz-modal-label"><i class="fa-solid fa-list"></i> Сгенерированные команды</label>
                <span id="arz-commands-count" style="background: linear-gradient(135deg, var(--az-accent) 0%, var(--az-accent-hover) 100%); color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 30px;">0</span>
              </div>
              <div id="alh-form-commands" class="arz-list-container"></div>
            </div>
          </div>
          <div class="alh-modal-footer">
            <button id="arz-forms-close-bottom" class="arz-btn-danger" style="flex: 1;">Закрыть</button>
            <button id="arz-copy-all-btn" class="arz-btn-primary" style="flex: 1;">Копировать всё</button>
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
        btn.innerHTML = `<i class="fa-solid fa-list-check" style="margin-right: 6px;"></i> Формы`;
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
