// Traducción de la interfaz. Los textos están en locales/<idioma>.js; se cargan
// como scripts y no con fetch para que la app funcione también abierta desde
// el disco (file://).
(function () {
  const locales = window.CLASSE_LOCALES || {};
  let lang = 'es';

  function t(key, vars) {
    const table = locales[lang] || locales.es || {};
    let text = Object.prototype.hasOwnProperty.call(table, key) ? table[key]
      : (locales.es && Object.prototype.hasOwnProperty.call(locales.es, key) ? locales.es[key] : key);
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
    }
    return text;
  }

  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  function setLanguage(code) {
    if (locales[code]) lang = code;
    apply();
  }

  window.i18n = { t, apply, setLanguage, get lang() { return lang; } };
})();
