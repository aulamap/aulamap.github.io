// Traducción de la interfaz. Los textos están en locales/<idioma>.js; se cargan
// como scripts y no con fetch para que la app funcione también abierta desde
// el disco (file://).
//
// El idioma se detecta a partir del navegador. Quien prefiera otro puede
// elegirlo en la barra superior: la preferencia ('auto', 'es', 'ca'…) se
// guarda en el navegador y manda sobre la detección automática.
(function () {
  const locales = window.CLASSE_LOCALES || {};
  const FALLBACK = 'es';
  const STORAGE_KEY = 'classe-lang';

  let preference = 'auto';
  let lang = FALLBACK;
  const listeners = [];

  function available() {
    return Object.keys(locales);
  }

  // 'ca-ES' o 'ca-valencia' valen como catalán; 'es-419', como español.
  function normalize(code) {
    if (!code) return null;
    const lower = String(code).toLowerCase();
    if (locales[lower]) return lower;
    const base = lower.split('-')[0];
    return locales[base] ? base : null;
  }

  function detect() {
    const list = navigator.languages && navigator.languages.length
      ? navigator.languages : [navigator.language];
    for (const code of list) {
      const match = normalize(code);
      if (match) return match;
    }
    return FALLBACK;
  }

  function readPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'auto' || locales[saved]) return saved;
    } catch (e) { /* sin almacenamiento: se usa la detección automática */ }
    return 'auto';
  }

  function resolve() {
    return preference === 'auto' ? detect() : preference;
  }

  function t(key, vars) {
    const table = locales[lang] || locales[FALLBACK] || {};
    const fallback = locales[FALLBACK] || {};
    let text = Object.prototype.hasOwnProperty.call(table, key) ? table[key]
      : (Object.prototype.hasOwnProperty.call(fallback, key) ? fallback[key] : key);
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m));
    }
    return text;
  }

  function apply(root = document) {
    document.documentElement.lang = lang;
    // La página puede indicar qué clave usa de título (la presentación, por ejemplo).
    if (root === document) document.title = t(document.documentElement.dataset.i18nDocTitle || 'app_title');
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    // Textos con formato propio (negritas, enlaces): son de la aplicación, no del usuario.
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-alt]').forEach(el => { el.alt = t(el.dataset.i18nAlt); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-href]').forEach(el => { el.href = t(el.dataset.i18nHref); });
  }

  // Cambia la preferencia de idioma ('auto' o el código de un idioma) y avisa
  // a la app para que vuelva a dibujar los textos que genera por su cuenta.
  function setPreference(code, { save = true } = {}) {
    preference = code === 'auto' || locales[code] ? code : 'auto';
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, preference); } catch (e) { /* modo privado */ }
    }
    const next = resolve();
    const changed = next !== lang;
    lang = next;
    apply();
    if (changed) listeners.forEach(fn => fn(lang));
  }

  function onChange(fn) { listeners.push(fn); }

  preference = readPreference();
  lang = resolve();

  window.i18n = {
    t, apply, available, onChange,
    setLanguage: code => setPreference(code),
    setPreference,
    get lang() { return lang; },
    get preference() { return preference; }
  };
})();
