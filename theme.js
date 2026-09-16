// Apariencia clara u oscura. Hay tres opciones: «Sistema» (sigue al sistema
// operativo o al navegador), «Claro» y «Oscuro». La elección se guarda en el
// navegador y se aplica con el atributo data-theme del <html>; el color real
// de cada cosa lo deciden las variables CSS de style.css.
//
// El script en línea de <head> aplica el tema guardado antes de pintar la
// página, para que no haya un destello claro al abrirla en modo oscuro.
(function () {
  const STORAGE_KEY = 'classe-theme';
  const VALUES = ['system', 'light', 'dark'];
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';

  function read() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (VALUES.includes(saved)) return saved;
    } catch (e) { /* sin almacenamiento: se sigue al sistema */ }
    return 'system';
  }

  function resolved() {
    if (preference === 'system') return media.matches ? 'dark' : 'light';
    return preference;
  }

  function apply() {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = preference;
    // El plano se dibuja con colores tomados de las variables CSS, así que
    // hay que avisar a la app para que lo vuelva a pintar.
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolved() } }));
  }

  function setPreference(value, { save = true } = {}) {
    preference = VALUES.includes(value) ? value : 'system';
    if (save) {
      try { localStorage.setItem(STORAGE_KEY, preference); } catch (e) { /* modo privado */ }
    }
    apply();
  }

  media.addEventListener('change', () => { if (preference === 'system') apply(); });

  preference = read();
  apply();

  window.theme = {
    setPreference,
    get preference() { return preference; },
    get resolved() { return resolved(); }
  };
})();
