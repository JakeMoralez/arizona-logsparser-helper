/* Runs in the page world to retire the site's widgets without losing its form. */
(function () {
  const allowed = el => el instanceof HTMLElement && el.matches('[data-alh-upgraded]') && (el.closest('form.filter') || el.matches('select[name="limit"]'));
  document.addEventListener('alh-site-upgrade', e => {
    const el = e.target;
    if (!allowed(el)) return;
    try {
      if (window.jQuery?.fn?.select2 && window.jQuery(el).data('select2')) window.jQuery(el).select2('destroy');
      window.jQuery?.(el).off('change.alhControls').on('change.alhControls', () => el.dispatchEvent(new Event('alh-site-sync')));
      const instance = window.tempusDominus?.TempusDominus?.getInstance?.(el) || window.tempusDominus?.TempusDominus?.getInstance?.(el.parentElement);
      instance?.dispose();
      for (const target of [el, el.parentElement]) {
        if (window.jQuery?.fn?.datetimepicker && window.jQuery(target).data('datetimepicker')) window.jQuery(target).datetimepicker('destroy');
      }
    } catch (error) { console.debug('Arizona Helper widget cleanup:', error); }
  });
})();
