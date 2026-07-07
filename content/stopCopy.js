(function () {
  const stopCopy = (e) => {

    e.stopImmediatePropagation();
  };
  window.addEventListener('copy', stopCopy, true);
  document.addEventListener('copy', stopCopy, true);
})();