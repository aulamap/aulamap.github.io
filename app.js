// Plano de clase: editor del aula y reparto del alumnado.
// Todas las medidas del plano van en centímetros; cada objeto guarda su centro
// (x, y), su tamaño (w, h) y su giro en grados.
(function () {
  const { t } = window.i18n;
  const STORAGE_KEY = 'classe-state-v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MARGIN = 60;
  const SNAP = 5;

  // Colores que dependen del tema (modo claro u oscuro). Se leen de las
  // variables CSS de :root, así que basta con volver a dibujar el plano
  // cuando cambia el tema.
  function themeColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  /* ---------- Catálogo de elementos ---------- */

  const DESK_TYPES = {
    desk1: { w: 70, h: 50, cols: 1, rows: 1 },
    desk2: { w: 140, h: 50, cols: 2, rows: 1 },
    group4: { w: 140, h: 100, cols: 2, rows: 2 },
    group6: { w: 210, h: 100, cols: 3, rows: 2 }
  };

  const FURNITURE_TYPES = {
    teacher: { w: 140, h: 70, fill: '#e8d9c0', stroke: '#8a6d3b' },
    board: { w: 300, h: 14, fill: '#3f5a4c', stroke: '#2b3e34', labelColor: '#fff' },
    screen: { w: 200, h: 10, fill: '#d6d8dc', stroke: '#6b7078' },
    door: { w: 90, h: 10, fill: '#fff', stroke: '#6b5638' },
    window: { w: 150, h: 10, fill: '#dcecf7', stroke: '#5b88a8' },
    notice: { w: 150, h: 10, fill: '#d9b88a', stroke: '#8a6d3b' },
    cabinet: { w: 100, h: 50, fill: '#ece7df', stroke: '#8a8176' },
    shelf: { w: 120, h: 35, fill: '#f1ece3', stroke: '#8a8176' },
    table: { w: 120, h: 60, fill: '#f3ead9', stroke: '#8a6d3b' },
    computer: { w: 60, h: 50, fill: '#e3e6ea', stroke: '#6b7078' },
    sink: { w: 60, h: 45, fill: '#e1eef2', stroke: '#5b88a8' },
    column: { w: 40, h: 40, fill: '#c9c4bb', stroke: '#7d776d' },
    bin: { w: 35, h: 35, fill: '#e9e6df', stroke: '#7d776d' },
    plant: { w: 45, h: 45, fill: '#cfe3c6', stroke: '#5b8a55' },
    text: { w: 120, h: 30, fill: 'none', stroke: 'none' }
  };

  // Hojas de la planta: [ángulo, largo, arranque, curvatura, tono]. El largo y
  // el arranque van en fracción del radio. La lista es fija (así la planta se
  // dibuja siempre igual) y deliberadamente irregular: ángulos desiguales,
  // hojas de distinto tamaño y algún hueco, para que sea una mata y no una flor.
  const PLANT_LEAVES = [
    [4, 1, 0.06, -0.25, 0], [27, 0.71, 0.14, 0.3, 1], [58, 0.93, 0.08, -0.15, 2],
    [96, 0.63, 0.18, 0.35, 1], [119, 0.97, 0.05, 0.2, 0], [141, 0.79, 0.12, -0.3, 2],
    [176, 1, 0.07, 0.15, 1], [199, 0.66, 0.16, -0.35, 0], [215, 0.87, 0.1, 0.25, 2],
    [247, 0.74, 0.13, -0.2, 1], [268, 0.95, 0.06, 0.3, 0], [297, 0.6, 0.19, -0.3, 2],
    [318, 0.88, 0.09, 0.2, 1], [351, 0.77, 0.15, -0.25, 0],
    [44, 0.42, 0.22, 0.4, 2], [131, 0.38, 0.26, -0.4, 0],
    [232, 0.44, 0.21, 0.35, 1], [306, 0.4, 0.24, -0.35, 2]
  ];

  const PLANT_GREENS = ['#cfe3c6', '#b3d2a3', '#9cc48c'];

  const NAME_FORMATS = ['first1', 'full', 'initial', 'given'];
  const NAME_FORMAT_LABEL = { full: 'name_full', first1: 'name_first_surname', initial: 'name_initial', given: 'name_given' };

  /* ---------- Estado ---------- */

  let state = loadState();
  let mode = 'room';
  let selection = new Set();
  let zoom = 1;
  const history = { undo: [], redo: [] };

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function isDesk(obj) { return obj.type in DESK_TYPES; }

  function makeObject(type, x, y) {
    const base = DESK_TYPES[type] || FURNITURE_TYPES[type];
    const obj = { id: uid(), type, x, y, w: base.w, h: base.h, rot: 0 };
    if (isDesk(obj)) {
      obj.cols = base.cols;
      obj.rows = base.rows;
      obj.seats = new Array(base.cols * base.rows).fill(null);
    } else {
      // labelKey recuerda que el texto es el de serie: así se traduce solo al
      // cambiar de idioma. En cuanto alguien lo edita, se queda como esté.
      obj.labelKey = 'label_' + type;
      obj.label = t(obj.labelKey);
    }
    return obj;
  }

  function newClass(name) {
    const room = { w: 800, h: 700 };
    const board = makeObject('board', room.w / 2, 7);
    const teacher = makeObject('teacher', 150, 120);
    const door = makeObject('door', room.w - 80, room.h - 5);
    return { id: uid(), name, room, objects: [board, teacher, door], students: [], nameFormat: 'first1' };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.classes) && parsed.classes.length) return parsed;
      }
    } catch (e) {
      console.warn('No se pudo leer el plano guardado:', e);
    }
    const first = newClass(t('class_first_name'));
    return { version: 1, current: first.id, classes: [first] };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('No se pudo guardar el plano:', e);
    }
  }

  function cls() {
    return state.classes.find(c => c.id === state.current) || state.classes[0];
  }

  // Texto de un elemento: el de serie se traduce; el editado a mano, no.
  function labelOf(obj) {
    return obj.labelKey ? t(obj.labelKey) : (obj.label || '');
  }

  function findObj(id) { return cls().objects.find(o => o.id === id); }
  function findStudent(id) { return cls().students.find(s => s.id === id); }

  // Guarda una instantánea de la clase actual antes de cambiarla.
  function checkpoint() {
    history.undo.push({ classId: state.current, data: JSON.stringify(cls()) });
    if (history.undo.length > 100) history.undo.shift();
    history.redo.length = 0;
    updateUndoButtons();
  }

  function restoreSnapshot(from, to) {
    const snap = from.pop();
    if (!snap) return;
    const idx = state.classes.findIndex(c => c.id === snap.classId);
    if (idx < 0) return;
    to.push({ classId: snap.classId, data: JSON.stringify(state.classes[idx]) });
    state.classes[idx] = JSON.parse(snap.data);
    state.current = snap.classId;
    selection.clear();
    commit(false);
  }

  function commit(fullUi = true) {
    saveState();
    render();
    if (fullUi) renderSidebar();
    else renderAll();
  }

  function updateUndoButtons() {
    document.getElementById('btn-undo').disabled = !history.undo.length;
    document.getElementById('btn-redo').disabled = !history.redo.length;
  }

  /* ---------- Nombres ---------- */

  function splitName(raw) {
    const text = raw.trim().replace(/\s+/g, ' ');
    if (text.includes(',')) {
      const [surnames, given] = text.split(',').map(s => s.trim());
      return { given: given || surnames, surnames: given ? surnames : '' };
    }
    const parts = text.split(' ');
    return { given: parts[0] || '', surnames: parts.slice(1).join(' ') };
  }

  // Partículas que van pegadas al apellido: «de la Torre» es un apellido, no
  // tres. Sin esto, «Ana de la Torre Pérez» se quedaba en «Ana de».
  const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'lo', 'los', 'y', 'i',
    'da', 'das', 'do', 'dos', 'di', 'van', 'von', 'der', 'den', 'le', 'saint', 'san', 'santa']);

  function firstSurname(surnames) {
    const parts = surnames.split(' ').filter(Boolean);
    const out = [];
    let i = 0;
    while (i < parts.length && NAME_PARTICLES.has(parts[i].toLowerCase())) out.push(parts[i++]);
    if (i < parts.length) out.push(parts[i]);
    return out.join(' ');
  }

  function formatName(raw, format) {
    const { given, surnames } = splitName(raw);
    const first = firstSurname(surnames);
    switch (format) {
      case 'full': return (given + ' ' + surnames).trim();
      // La inicial es la de la palabra que cuenta, no la de la partícula.
      case 'initial': {
        const word = first.split(' ').pop() || '';
        return word ? `${given} ${word[0]}.` : given;
      }
      case 'given': return given;
      default: return (given + ' ' + first).trim();
    }
  }

  // Ancho real del texto con la fuente del plano. Se mide a cuerpo 100 y se
  // guarda el resultado, de modo que el ancho a cualquier tamaño es
  // textWidth(t) * tamaño. Medirlo (en vez de contar letras) es lo que evita
  // que un nombre largo se salga de su sitio.
  const measureCtx = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();
  function textWidth(str, weight = NAME_WEIGHT) {
    const key = weight + '|' + str;
    let value = widthCache.get(key);
    if (value === undefined) {
      measureCtx.font = `${weight} 100px system-ui, sans-serif`;
      value = measureCtx.measureText(str).width / 100;
      widthCache.set(key, value);
    }
    return value;
  }

  // Recorta con puntos suspensivos lo que no quepa en «maxWidth» unidades de
  // ancho por cada unidad de tamaño de letra.
  function clipText(line, maxWidth, weight = NAME_WEIGHT) {
    if (textWidth(line, weight) <= maxWidth) return line;
    let cut = line;
    while (cut.length > 1 && textWidth(cut + '…', weight) > maxWidth) cut = cut.slice(0, -1);
    return cut + '…';
  }

  // Reparte las palabras en «count» renglones procurando que el más ancho sea
  // lo más estrecho posible.
  function splitLines(words, count) {
    const n = words.length;
    const width = (i, j) => textWidth(words.slice(i, j).join(' '));
    const memo = new Map();
    const rec = (i, k) => {
      const key = i + ':' + k;
      if (memo.has(key)) return memo.get(key);
      let out;
      if (k === 1) out = { max: width(i, n), cuts: [n] };
      else {
        out = { max: Infinity, cuts: [n] };
        for (let j = i + 1; j <= n - k + 1; j++) {
          const rest = rec(j, k - 1);
          const max = Math.max(width(i, j), rest.max);
          if (max < out.max) out = { max, cuts: [j, ...rest.cuts] };
        }
      }
      memo.set(key, out);
      return out;
    };
    const cuts = rec(0, Math.min(count, n)).cuts;
    const lines = [];
    let start = 0;
    for (const cut of cuts) { lines.push(words.slice(start, cut).join(' ')); start = cut; }
    return lines;
  }

  // Parte el texto por letras en «count» trozos parecidos.
  function chunkText(text, count) {
    const each = Math.ceil(text.length / count);
    const out = [];
    for (let i = 0; i < text.length; i += each) out.push(text.slice(i, i + each).trim());
    return out.filter(Boolean);
  }

  const NAME_MIN_SIZE = 5;    // por debajo no se lee: mejor recortar el nombre
  const NAME_MAX_SIZE = 12;   // tope, para que no cante en las mesas grandes
  const NAME_WEIGHT = 'normal'; // sin negrita: la misma letra ocupa menos ancho
  const NAME_LINE_GAP = 1.05;   // renglones juntos: así cabe más nombre

  // Alto que ocupa un bloque de «n» renglones, en múltiplos del tamaño de
  // letra: los saltos entre renglones más los trazos altos y bajos del último.
  const blockHeight = (n) => (n - 1) * NAME_LINE_GAP + 1.4;

  // Busca el mayor tamaño de letra con el que el nombre cabe en el hueco,
  // probando a partirlo hasta en cuatro renglones. Si ni así cabe, se recorta.
  function fitName(text, width, height, max = NAME_MAX_SIZE) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return { lines: [''], size: max };
    let best = null;
    for (let k = 1; k <= Math.min(4, words.length); k++) {
      const lines = splitLines(words, k);
      const size = Math.min(max, width / Math.max(...lines.map(l => textWidth(l))), height / blockHeight(lines.length));
      if (!best || size > best.size) best = { lines, size };
    }
    if (best.size >= NAME_MIN_SIZE) return best;
    // Una palabra sola demasiado larga no se puede partir por espacios: antes
    // de recortarla se prueba a partirla por letras, que se lee mejor.
    const flat = words.join(' ');
    for (let k = 2; k <= 4; k++) {
      const lines = chunkText(flat, k);
      const size = Math.min(max, width / Math.max(...lines.map(l => textWidth(l))), height / blockHeight(lines.length));
      if (size > best.size) best = { lines, size };
    }
    if (best.size >= NAME_MIN_SIZE) return best;
    const maxLines = Math.max(1, Math.floor((height / NAME_MIN_SIZE - 1.4) / NAME_LINE_GAP) + 1);
    const lines = splitLines(words, Math.min(maxLines, words.length)).slice(0, maxLines);
    return { lines: lines.map(l => clipText(l, width / NAME_MIN_SIZE)), size: NAME_MIN_SIZE };
  }

  /* ---------- Dibujo del plano ---------- */

  function el(tag, attrs = {}, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  function normAngle(a) {
    let r = ((a % 360) + 360) % 360;
    if (r > 180) r -= 360;
    return r;
  }

  // Giro que hay que dar a un texto dentro del objeto para que no quede boca abajo.
  function uprightFix(rot, viewRot) {
    const total = normAngle(rot + viewRot);
    return total > 90 || total <= -90 ? 180 : 0;
  }

  function addText(parent, str, x, y, size, opts = {}) {
    const lines = Array.isArray(str) ? str : [str];
    const text = el('text', {
      x, y, 'font-size': size, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: opts.fill || '#23262b', 'font-weight': opts.weight || 'normal',
      'font-family': 'system-ui, sans-serif'
    }, parent);
    if (opts.halo) {
      text.setAttribute('stroke', opts.halo);
      text.setAttribute('stroke-width', size * 0.25);
      text.setAttribute('paint-order', 'stroke');
    }
    if (opts.flip) text.setAttribute('transform', `rotate(180 ${x} ${y})`);
    const lh = size * (opts.lineHeight || 1.15);
    lines.forEach((line, i) => {
      const tspan = el('tspan', { x, y: y + (i - (lines.length - 1) / 2) * lh }, text);
      tspan.textContent = line;
    });
    return text;
  }

  function drawDesk(g, obj, c, opts) {
    const { w, h } = obj;
    el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 3, fill: '#fbf8f2', stroke: '#8a6d3b', 'stroke-width': 1.5 }, g);
    const sw = w / obj.cols;
    const sh = h / obj.rows;
    const flip = uprightFix(obj.rot, opts.viewRot) === 180;
    for (let r = 0; r < obj.rows; r++) {
      for (let col = 0; col < obj.cols; col++) {
        const i = r * obj.cols + col;
        const sx = -w / 2 + col * sw;
        const sy = -h / 2 + r * sh;
        const studentId = obj.seats[i];
        const student = studentId ? c.students.find(s => s.id === studentId) : null;
        const seatG = el('g', { 'data-obj': obj.id, 'data-seat': i }, g);
        el('rect', {
          class: 'seat', x: sx + 1.5, y: sy + 1.5, width: sw - 3, height: sh - 3, rx: 2,
          fill: student ? '#ffffff' : '#fbf8f2', stroke: 'none'
        }, seatG);
        if (opts.showPeople) drawPerson(seatG, obj, r, col, sx, sy, sw, sh, !!student);
        if (col > 0) el('line', { x1: sx, y1: sy + 4, x2: sx, y2: sy + sh - 4, stroke: '#c9b894', 'stroke-width': 1 }, g);
        if (r > 0 && col === 0) el('line', { x1: -w / 2 + 4, y1: sy, x2: w / 2 - 4, y2: sy, stroke: '#c9b894', 'stroke-width': 1 }, g);
        if (student) {
          const { lines, size } = fitName(formatName(student.name, opts.nameFormat), sw - 10, sh - 10);
          addText(g, lines, sx + sw / 2, sy + sh / 2, size, { flip, weight: NAME_WEIGHT, lineHeight: NAME_LINE_GAP });
        }
      }
    }
  }

  // Lado de la mesa en el que se sienta cada puesto: una sola fila mira hacia
  // la pizarra (se sienta abajo); con varias filas, la primera arriba, la última
  // abajo y las intermedias a los lados.
  function seatSide(obj, r, col) {
    if (obj.rows === 1 || r === obj.rows - 1) return 'bottom';
    if (r === 0) return 'top';
    if (col === 0) return 'left';
    if (col === obj.cols - 1) return 'right';
    return 'bottom';
  }

  // Figura esquemática vista desde arriba: silla, cuerpo, cabeza y brazos sobre
  // la mesa. Sin nombre asignado solo se dibuja la silla vacía.
  function drawPerson(parent, obj, r, col, sx, sy, sw, sh, seated) {
    const side = seatSide(obj, r, col);
    const pos = {
      bottom: [sx + sw / 2, sy + sh, 0, sw],
      top: [sx + sw / 2, sy, 180, sw],
      left: [sx, sy + sh / 2, 90, sh],
      right: [sx + sw, sy + sh / 2, -90, sh]
    }[side];
    drawFigure(parent, ...pos, seated);
  }

  // (px, py) es el punto medio del borde de la mesa; la figura queda fuera,
  // mirando hacia la mesa. angle 0 = sentada abajo; 180 = arriba.
  function drawFigure(parent, px, py, angle, edge, seated) {
    const W = Math.min(46, edge * 0.8);
    const k = W / 46;
    const fig = el('g', { class: 'person', transform: `translate(${px} ${py}) rotate(${angle}) scale(${k})` }, parent);
    const line = { stroke: '#6b6258', 'stroke-width': 1.4 };
    el('rect', { x: -21, y: 30, width: 42, height: 8, rx: 3, fill: '#e6e0d5', ...line }, fig);
    if (!seated) return;
    el('rect', { x: -21, y: -6, width: 8, height: 26, rx: 4, fill: '#fff', ...line }, fig);
    el('rect', { x: 13, y: -6, width: 8, height: 26, rx: 4, fill: '#fff', ...line }, fig);
    el('ellipse', { cx: 0, cy: 21, rx: 20, ry: 9, fill: '#fff', ...line }, fig);
    el('circle', { cx: 0, cy: 17, r: 9, fill: '#fff', ...line }, fig);
  }

  // Una hoja con su nervio, apuntando hacia fuera. «off» es lo que se separa
  // del centro y «bend», cuánto se tuerce la punta hacia un lado.
  function drawLeaf(parent, len, angle, off, bend, fill, stroke, width) {
    const wide = len * 0.44;
    const bx = bend * len * 0.3;
    const leaf = el('g', { transform: `rotate(${angle}) translate(0 ${-off})` }, parent);
    el('path', {
      d: `M 0 0 C ${wide * 0.65} ${-len * 0.3} ${wide * 0.5 + bx} ${-len * 0.76} ${bx} ${-len}`
        + ` C ${-wide * 0.5 + bx} ${-len * 0.76} ${-wide * 0.65} ${-len * 0.3} 0 0 Z`,
      fill, stroke, 'stroke-width': width, 'stroke-linejoin': 'round'
    }, leaf);
    el('path', {
      d: `M 0 ${-len * 0.08} Q ${bx * 0.4} ${-len * 0.5} ${bx * 0.85} ${-len * 0.85}`,
      fill: 'none', stroke, 'stroke-width': width * 0.6, 'stroke-opacity': .5
    }, leaf);
    return leaf;
  }

  function drawFurniture(g, obj, opts) {
    const def = FURNITURE_TYPES[obj.type] || FURNITURE_TYPES.table;
    const { w, h } = obj;
    const flip = uprightFix(obj.rot, opts.viewRot) === 180;
    const common = { fill: def.fill, stroke: def.stroke, 'stroke-width': 1.5 };
    switch (obj.type) {
      case 'door':
        // El arco es el recorrido de la punta de la hoja, centrado en la
        // bisagra (la esquina derecha): por eso se abomba hacia fuera.
        el('path', { d: `M ${-w / 2} ${-h / 2} A ${w} ${w} 0 0 1 ${w / 2} ${-h / 2 - w}`, fill: 'none', stroke: '#b9a98f', 'stroke-dasharray': '4 4', 'stroke-width': 1 }, g);
        el('line', { x1: w / 2, y1: -h / 2, x2: w / 2, y2: -h / 2 - w, stroke: def.stroke, 'stroke-width': 2 }, g);
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, ...common }, g);
        break;
      case 'window':
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, ...common }, g);
        el('line', { x1: -w / 2, y1: 0, x2: w / 2, y2: 0, stroke: def.stroke, 'stroke-width': 1 }, g);
        break;
      case 'bin':
      case 'column':
        if (obj.type === 'bin') el('ellipse', { cx: 0, cy: 0, rx: w / 2, ry: h / 2, ...common }, g);
        else {
          el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, ...common }, g);
          el('path', { d: `M ${-w / 2} ${-h / 2} L ${w / 2} ${h / 2} M ${w / 2} ${-h / 2} L ${-w / 2} ${h / 2}`, stroke: def.stroke, 'stroke-width': 1 }, g);
        }
        break;
      // Ordenador visto desde arriba, con medidas reales en centímetros dentro
      // de un puesto de 60 × 50: monitor de 24" (54 de ancho y 5 de canto) con
      // la peana asomando por detrás, teclado de 44 × 15 y ratón de 6,5 × 11.
      // El pie que une pantalla y peana no se ve: lo tapa la propia pantalla.
      case 'computer': {
        const k = Math.min(w / 60, h / 50);
        const pc = el('g', { transform: `scale(${k})` }, g);
        el('rect', { x: -11, y: -25, width: 22, height: 14, rx: 5, fill: '#b6bcc3', stroke: def.stroke, 'stroke-width': 1 }, pc);
        el('rect', { x: -27, y: -14, width: 54, height: 5, rx: 1, fill: '#3a4046', stroke: '#23262b', 'stroke-width': 1 }, pc);
        // Franja clara: la cara de la pantalla, que mira hacia el teclado.
        el('rect', { x: -26, y: -10.4, width: 52, height: 1.2, fill: '#8fc3e8' }, pc);
        el('rect', { x: -29, y: 4, width: 44, height: 15, rx: 2, ...common, 'stroke-width': 1 }, pc);
        // Tres filas de teclas, cada una de un trazo de puntos, y el espaciador.
        for (let i = 0; i < 3; i++) {
          el('line', {
            x1: -27, y1: 7.5 + i * 3.2, x2: 13, y2: 7.5 + i * 3.2,
            stroke: def.stroke, 'stroke-width': 2, 'stroke-dasharray': '2.2 1.1', 'stroke-opacity': .45
          }, pc);
        }
        el('rect', { x: -17, y: 16, width: 20, height: 1.6, rx: .6, fill: 'none', stroke: def.stroke, 'stroke-width': .8, 'stroke-opacity': .5 }, pc);
        el('ellipse', { cx: 21.5, cy: 11, rx: 3.25, ry: 5.5, ...common, 'stroke-width': 1 }, pc);
        el('line', { x1: 21.5, y1: 6.5, x2: 21.5, y2: 10, stroke: def.stroke, 'stroke-width': .8, 'stroke-opacity': .7 }, pc);
        break;
      }
      // Planta vista desde arriba: mata de hojas y, en medio, la maceta.
      case 'plant': {
        const R = Math.min(w, h) / 2;
        el('circle', { cx: 0, cy: 0, r: R * 0.3, fill: '#c98f63', stroke: '#8a5a3b', 'stroke-width': 1.2 }, g);
        for (const [a, len, off, bend, tone] of PLANT_LEAVES) {
          drawLeaf(g, R * len, a, R * off, bend, PLANT_GREENS[tone], def.stroke, 1.1);
        }
        break;
      }
      // Pica vista desde arriba: encimera, seno, desagüe y grifo.
      case 'sink': {
        const drain = Math.min(w, h) * 0.07;
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 4, ...common }, g);
        el('rect', { x: -w * 0.36, y: -h * 0.2, width: w * 0.72, height: h * 0.56, rx: Math.min(w, h) * 0.12, fill: '#ffffff', stroke: def.stroke, 'stroke-width': 1.2 }, g);
        el('circle', { cx: 0, cy: h * 0.08, r: drain, fill: 'none', stroke: def.stroke, 'stroke-width': 1.2 }, g);
        el('circle', { cx: 0, cy: h * 0.08, r: drain * 0.35, fill: def.stroke }, g);
        el('rect', { x: -w * 0.08, y: -h * 0.42, width: w * 0.16, height: h * 0.12, rx: 2, fill: '#d6d8dc', stroke: def.stroke, 'stroke-width': 1.2 }, g);
        el('line', { x1: 0, y1: -h * 0.36, x2: 0, y2: -h * 0.08, stroke: def.stroke, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, g);
        break;
      }
      case 'text':
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: 'transparent', stroke: opts.print ? 'none' : '#c9c4bb', 'stroke-dasharray': '3 3' }, g);
        break;
      case 'teacher':
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 3, ...common }, g);
        // El docente se sienta entre la mesa y la pizarra, mirando a la clase.
        if (opts.showPeople) drawFigure(g, 0, -h / 2, 180, w, true);
        break;
      default:
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: obj.type === 'board' ? 1 : 3, ...common }, g);
    }
    const label = labelOf(obj);
    if (label) {
      const thin = h < 25;
      const weight = obj.type === 'text' ? 600 : 'normal';
      const maxSize = obj.type === 'text' ? h * 0.6 : 15;
      const size = Math.max(NAME_MIN_SIZE, Math.min(maxSize, (w - 6) / textWidth(label, weight)));
      const labelInside = !thin || obj.type === 'board';
      addText(g, clipText(label, (w - 6) / size, weight), 0, 0, size, {
        flip,
        fill: labelInside ? (def.labelColor || '#23262b') : '#23262b',
        weight,
        halo: labelInside ? null : 'rgba(255,255,255,.9)'
      });
    }
  }

  // Dibuja el plano completo dentro de <svg>. Se usa tanto en el editor como al imprimir.
  function drawRoom(svg, c, opts) {
    svg.innerHTML = '';
    const { w: RW, h: RH } = c.room;
    const vb = opts.viewBox || [-MARGIN, -MARGIN, RW + 2 * MARGIN, RH + 2 * MARGIN];
    svg.setAttribute('viewBox', vb.join(' '));
    const root = el('g', opts.viewRot ? { transform: `rotate(180 ${RW / 2} ${RH / 2})` } : {}, svg);

    if (!opts.print) {
      const defs = el('defs', {}, svg);
      const pat = el('pattern', { id: 'grid', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, defs);
      el('rect', { x: 0, y: 0, width: 50, height: 50, fill: themeColor('--floor', '#f3f0ea') }, pat);
      el('path', { d: 'M 50 0 L 0 0 0 50', fill: 'none', stroke: themeColor('--grid', '#e4e0d6'), 'stroke-width': 1 }, pat);
      svg.insertBefore(defs, root);
    }
    const wallColor = opts.print ? '#55504a' : themeColor('--wall', '#55504a');
    el('rect', { x: 0, y: 0, width: RW, height: RH, fill: opts.print ? '#fff' : 'url(#grid)', stroke: 'none' }, root);
    el('rect', { x: 0, y: 0, width: RW, height: RH, fill: 'none', stroke: wallColor, 'stroke-width': 6 }, root);

    // Zonas para arrastrar las paredes: debajo de los objetos, para que la
    // pizarra o la puerta pegadas a la pared se sigan pudiendo coger.
    const walls = !opts.print && mode === 'room';
    if (walls) {
      const hit = Math.max(16, 16 / zoom);
      const lines = { left: [0, 0, 0, RH], right: [RW, 0, RW, RH], top: [0, 0, RW, 0], bottom: [0, RH, RW, RH] };
      for (const [wall, [x1, y1, x2, y2]] of Object.entries(lines)) {
        el('line', { class: 'wall', 'data-wall': wall, x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': hit }, root);
      }
    }

    for (const obj of c.objects) {
      const g = el('g', { class: 'obj', 'data-id': obj.id, transform: `translate(${obj.x} ${obj.y}) rotate(${obj.rot})` }, root);
      if (isDesk(obj)) drawDesk(g, obj, c, opts);
      else drawFurniture(g, obj, opts);
    }

    if (!opts.print && mode === 'room') drawSelection(root, c);
    return root;
  }

  function drawSelection(root, c) {
    const sel = c.objects.filter(o => selection.has(o.id));
    for (const obj of sel) {
      const g = el('g', { transform: `translate(${obj.x} ${obj.y}) rotate(${obj.rot})` }, root);
      el('rect', { x: -obj.w / 2 - 4, y: -obj.h / 2 - 4, width: obj.w + 8, height: obj.h + 8, fill: 'none', stroke: '#2f6f5e', 'stroke-width': 2, 'stroke-dasharray': '6 4', 'pointer-events': 'none' }, g);
      if (sel.length === 1 && mode === 'room') {
        const hs = 9 / zoom;
        const r = Math.max(8, 7 / zoom);
        el('line', { x1: 0, y1: -obj.h / 2 - 4, x2: 0, y2: -obj.h / 2 - 28 / zoom, stroke: '#2f6f5e', 'stroke-width': 1.5, 'pointer-events': 'none' }, g);
        el('circle', { class: 'handle', 'data-handle': 'rotate', cx: 0, cy: -obj.h / 2 - 28 / zoom, r, fill: '#fff', stroke: '#2f6f5e', 'stroke-width': 2 }, g);
        el('rect', { class: 'handle', 'data-handle': 'resize', x: obj.w / 2 + 4 - hs / 2, y: obj.h / 2 + 4 - hs / 2, width: hs, height: hs, fill: '#2f6f5e', style: 'cursor:nwse-resize' }, g);
      }
    }
    const groups = new Map();
    sel.forEach(o => { if (o.groupId) (groups.get(o.groupId) || groups.set(o.groupId, []).get(o.groupId)).push(o); });
    for (const members of groups.values()) {
      const b = boundsOf(members, c, 10);
      el('rect', { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, rx: 8, fill: 'none', stroke: '#2f6f5e', 'stroke-width': 1.5, 'pointer-events': 'none' }, root);
    }
    // Varios objetos (o un grupo) se giran juntos con un tirador sobre el conjunto.
    if (sel.length > 1) {
      const b = boundsOf(sel, c, 10);
      const cx = (b.x0 + b.x1) / 2;
      const r = Math.max(8, 7 / zoom);
      const hy = b.y0 - 28 / zoom;
      el('line', { x1: cx, y1: b.y0, x2: cx, y2: hy, stroke: '#2f6f5e', 'stroke-width': 1.5, 'pointer-events': 'none' }, root);
      el('circle', { class: 'handle', 'data-handle': 'rotate-group', cx, cy: hy, r, fill: '#fff', stroke: '#2f6f5e', 'stroke-width': 2 }, root);
    }
    if (marquee) {
      const x = Math.min(marquee.x0, marquee.x1), y = Math.min(marquee.y0, marquee.y1);
      el('rect', { x, y, width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0), fill: 'rgba(47,111,94,.08)', stroke: '#2f6f5e', 'stroke-dasharray': '4 3', 'pointer-events': 'none' }, root);
    }
  }

  const svg = document.getElementById('room-svg');
  const canvas = document.getElementById('canvas');

  function render() {
    const c = cls();
    // Mientras se arrastra una pared, el lienzo mantiene un marco fijo para que
    // el plano no se desplace bajo el ratón al cambiar el tamaño del aula.
    const frame = drag && drag.kind === 'wall' ? drag.frame : null;
    const viewBox = frame
      ? [frame.x - drag.shiftX, frame.y - drag.shiftY, frame.w, frame.h]
      : null;
    drawRoom(svg, c, { viewRot: 0, nameFormat: c.nameFormat, showPeople: c.showPeople !== false, print: false, viewBox });
    svg.setAttribute('width', (frame ? frame.w : c.room.w + 2 * MARGIN) * zoom);
    svg.setAttribute('height', (frame ? frame.h : c.room.h + 2 * MARGIN) * zoom);
    svg.classList.toggle('students-mode', mode === 'students');
    renderProps();
    updateUndoButtons();
  }

  function fitZoom() {
    const c = cls();
    const availW = canvas.clientWidth - 20;
    const availH = canvas.clientHeight - 20;
    zoom = Math.max(0.2, Math.min(3, availW / (c.room.w + 2 * MARGIN), availH / (c.room.h + 2 * MARGIN)));
    render();
  }

  /* ---------- Paneles ---------- */

  function renderClassSelect() {
    const select = document.getElementById('class-select');
    select.innerHTML = '';
    for (const c of state.classes) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === state.current) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function renderSidebar() {
    const c = cls();
    document.getElementById('room-w').value = (c.room.w / 100).toFixed(1);
    document.getElementById('room-h').value = (c.room.h / 100).toFixed(1);
    document.querySelectorAll('select.name-format').forEach(s => { s.value = c.nameFormat; });
    document.getElementById('show-people').checked = c.showPeople !== false;
    renderStudents();
  }

  function renderAll() {
    renderClassSelect();
    renderSidebar();
    render();
  }

  function seatOf(studentId) {
    for (const obj of cls().objects) {
      if (isDesk(obj) && obj.seats.includes(studentId)) return obj;
    }
    return null;
  }

  function renderStudents() {
    const c = cls();
    const list = document.getElementById('student-list');
    list.innerHTML = '';
    const seated = new Set();
    c.objects.forEach(o => { if (isDesk(o)) o.seats.forEach(s => s && seated.add(s)); });
    document.getElementById('students-count').textContent = t('students_list', { assigned: seated.size, total: c.students.length });
    if (!c.students.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('students_empty');
      list.appendChild(li);
      return;
    }
    for (const s of c.students) {
      const li = document.createElement('li');
      li.dataset.student = s.id;
      if (seated.has(s.id)) li.classList.add('seated');
      const handle = document.createElement('span');
      handle.className = 'handle';
      handle.textContent = '⠿';
      handle.dataset.student = s.id;
      const mark = document.createElement('span');
      mark.className = 'seat-mark';
      mark.textContent = seated.has(s.id) ? '✓' : '';
      if (seated.has(s.id)) mark.title = t('student_seated');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = s.name;
      input.addEventListener('change', () => {
        const name = input.value.trim();
        if (!name) { input.value = s.name; return; }
        checkpoint();
        s.name = name;
        commit();
      });
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '×';
      del.title = t('student_delete');
      del.addEventListener('click', () => {
        checkpoint();
        c.students = c.students.filter(x => x.id !== s.id);
        c.objects.forEach(o => { if (isDesk(o)) o.seats = o.seats.map(v => (v === s.id ? null : v)); });
        commit();
      });
      li.append(handle, mark, input, del);
      list.appendChild(li);
    }
  }

  function numberInput(label, value, onChange, opts = {}) {
    const lab = document.createElement('label');
    if (opts.full) lab.className = 'full';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = opts.type || 'number';
    input.value = value;
    if (opts.min !== undefined) input.min = opts.min;
    if (opts.max !== undefined) input.max = opts.max;
    if (opts.step) input.step = opts.step;
    input.addEventListener('change', () => onChange(input.value));
    lab.append(span, input);
    return lab;
  }

  // Iconos de la botonera de ordenación: la barra marca por dónde se alinea.
  const ALIGN_ICONS = {
    left: '<path d="M2.5 2v12"/><rect x="4.5" y="4" width="9.5" height="3"/><rect x="4.5" y="9" width="5.5" height="3"/>',
    hcenter: '<path d="M8 2v12"/><rect x="3.2" y="4" width="9.6" height="3"/><rect x="5.2" y="9" width="5.6" height="3"/>',
    right: '<path d="M13.5 2v12"/><rect x="2.5" y="4" width="9.5" height="3"/><rect x="6.5" y="9" width="5.5" height="3"/>',
    top: '<path d="M2 2.5h12"/><rect x="4" y="4.5" width="3" height="9.5"/><rect x="9" y="4.5" width="3" height="5.5"/>',
    vcenter: '<path d="M2 8h12"/><rect x="4" y="3.2" width="3" height="9.6"/><rect x="9" y="5.2" width="3" height="5.6"/>',
    bottom: '<path d="M2 13.5h12"/><rect x="4" y="2" width="3" height="9.5"/><rect x="9" y="6" width="3" height="5.5"/>',
    distx: '<rect x="1.5" y="3" width="2.5" height="10"/><rect x="6.8" y="3" width="2.5" height="10"/><rect x="12" y="3" width="2.5" height="10"/>',
    disty: '<rect x="3" y="1.5" width="10" height="2.5"/><rect x="3" y="6.8" width="10" height="2.5"/><rect x="3" y="12" width="10" height="2.5"/>'
  };

  function alignTools() {
    const box = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = t('align_title');
    const grid = document.createElement('div');
    grid.className = 'align-grid';
    const units = selectionUnits().length;
    const add = (key, onClick, enabled) => {
      const b = button('', onClick, 'icon');
      b.innerHTML = `<svg class="ico" viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" aria-hidden="true">${ALIGN_ICONS[key]}</svg>`;
      b.title = t('align_' + key);
      b.setAttribute('aria-label', b.title);
      b.disabled = !enabled;
      grid.appendChild(b);
    };
    add('left', () => alignSelection('left'), units > 1);
    add('hcenter', () => alignSelection('hcenter'), units > 1);
    add('right', () => alignSelection('right'), units > 1);
    add('top', () => alignSelection('top'), units > 1);
    add('vcenter', () => alignSelection('vcenter'), units > 1);
    add('bottom', () => alignSelection('bottom'), units > 1);
    add('distx', () => distributeSelection('x'), units > 2);
    add('disty', () => distributeSelection('y'), units > 2);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = t(units > 2 ? 'align_hint' : 'align_hint_three');
    box.append(title, grid, hint);
    return box;
  }

  function button(label, onClick, cls = '') {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderProps() {
    const body = document.getElementById('props-body');
    const props = document.getElementById('props');
    props.hidden = mode !== 'room';
    document.querySelector('.layout').classList.toggle('no-props', mode !== 'room');
    body.innerHTML = '';
    const sel = cls().objects.filter(o => selection.has(o.id));
    if (!sel.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = t('props_none');
      body.appendChild(p);
      return;
    }
    const actions = document.createElement('div');
    actions.className = 'props-actions';
    actions.append(
      button('⟲ 15°', () => rotateSelection(-15)),
      button('⟳ 15°', () => rotateSelection(15)),
      button(t('duplicate'), duplicateSelection),
      button(t('delete'), deleteSelection, 'danger')
    );
    actions.children[0].title = t('rotate_left');
    actions.children[1].title = t('rotate_right');

    if (sel.length > 1) {
      const gs = groupState();
      const p = document.createElement('p');
      p.className = 'props-type';
      p.textContent = t(gs.single ? 'props_group' : 'props_multi', { count: sel.length });
      if (gs.canGroup) actions.prepend(button(t('group'), groupSelection));
      if (gs.canUngroup) actions.prepend(button(t('ungroup'), ungroupSelection));
      body.append(p, alignTools(), actions);
      return;
    }

    const obj = sel[0];
    const title = document.createElement('p');
    title.className = 'props-type';
    title.textContent = t('type_' + obj.type);
    const grid = document.createElement('div');
    grid.className = 'props-grid';
    const update = (fn) => (v) => { checkpoint(); fn(v); commit(); };
    if (!isDesk(obj)) {
      grid.append(numberInput(t('prop_label'), labelOf(obj), update(v => { obj.label = v; delete obj.labelKey; }), { type: 'text', full: true }));
    }
    grid.append(
      numberInput(t('prop_width'), Math.round(obj.w), update(v => { obj.w = clamp(+v, 5, 2000); }), { min: 5 }),
      numberInput(t('prop_depth'), Math.round(obj.h), update(v => { obj.h = clamp(+v, 3, 2000); }), { min: 3 }),
      numberInput(t('prop_rotation'), Math.round(normAngle(obj.rot)), update(v => { obj.rot = normAngle(+v || 0); }), { step: 5, full: true })
    );
    if (isDesk(obj)) {
      grid.append(
        numberInput(t('prop_cols'), obj.cols, update(v => resizeSeats(obj, clamp(Math.round(+v), 1, 8), obj.rows)), { min: 1, max: 8 }),
        numberInput(t('prop_rows'), obj.rows, update(v => resizeSeats(obj, obj.cols, clamp(Math.round(+v), 1, 8))), { min: 1, max: 8 })
      );
    }
    body.append(title, grid, actions);
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)); }

  // Cambia el número de puestos conservando a quien ya estaba sentado donde siga cabiendo.
  function resizeSeats(obj, cols, rows) {
    const seats = new Array(cols * rows).fill(null);
    for (let r = 0; r < Math.min(rows, obj.rows); r++) {
      for (let c = 0; c < Math.min(cols, obj.cols); c++) seats[r * cols + c] = obj.seats[r * obj.cols + c];
    }
    obj.cols = cols;
    obj.rows = rows;
    obj.seats = seats;
  }

  /* ---------- Paleta ---------- */

  function paletteIcon(type) {
    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('viewBox', '0 0 26 20');
    const def = DESK_TYPES[type];
    if (def) {
      const cw = 22 / Math.max(def.cols, 2) * (def.cols === 1 ? 1 : 1);
      const ch = def.rows === 1 ? 10 : 7;
      const totalW = cw * def.cols, totalH = ch * def.rows;
      for (let r = 0; r < def.rows; r++) for (let c = 0; c < def.cols; c++) {
        el('rect', { x: 13 - totalW / 2 + c * cw + .5, y: 10 - totalH / 2 + r * ch + .5, width: cw - 1, height: ch - 1, fill: '#fbf8f2', stroke: '#8a6d3b' }, icon);
      }
    } else {
      const f = FURNITURE_TYPES[type];
      const ratio = f.w / f.h;
      let w = 22, h = Math.max(3, 22 / ratio);
      if (h > 16) { h = 16; w = 16 * ratio; }
      if (type === 'text') {
        // currentColor: en modo oscuro tiene que verse igual que el rótulo del botón.
        addText(icon, 'Aa', 13, 10, 11, { weight: 700, fill: 'currentColor' });
      } else if (type === 'computer') {
        el('ellipse', { cx: 12.5, cy: 3.4, rx: 2.6, ry: 1.2, fill: '#b6bcc3', stroke: f.stroke, 'stroke-width': .5 }, icon);
        el('rect', { x: 6, y: 3.4, width: 13, height: 3.2, rx: .8, fill: '#3a4046' }, icon);
        el('rect', { x: 6.6, y: 5.5, width: 11.8, height: .8, fill: '#8fc3e8' }, icon);
        el('rect', { x: 5.5, y: 10.5, width: 13, height: 6, rx: 1, fill: f.fill, stroke: f.stroke, 'stroke-width': .8 }, icon);
        for (let i = 0; i < 3; i++) {
          el('line', { x1: 6.6, y1: 11.8 + i * 1.5, x2: 17.4, y2: 11.8 + i * 1.5, stroke: f.stroke, 'stroke-width': .9, 'stroke-dasharray': '1 .7', 'stroke-opacity': .5 }, icon);
        }
        el('ellipse', { cx: 21.3, cy: 13, rx: 1.5, ry: 2.2, fill: f.fill, stroke: f.stroke, 'stroke-width': .8 }, icon);
      } else if (type === 'sink') {
        el('rect', { x: 13 - w / 2, y: 10 - h / 2, width: w, height: h, rx: 2, fill: f.fill, stroke: f.stroke, 'stroke-width': .8 }, icon);
        el('rect', { x: 13 - w * 0.36, y: 11 - h * 0.3, width: w * 0.72, height: h * 0.56, rx: 1.5, fill: '#fff', stroke: f.stroke, 'stroke-width': .8 }, icon);
        el('circle', { cx: 13, cy: 12, r: 1, fill: 'none', stroke: f.stroke, 'stroke-width': .8 }, icon);
        el('line', { x1: 13, y1: 5.5, x2: 13, y2: 9, stroke: f.stroke, 'stroke-width': 1.4, 'stroke-linecap': 'round' }, icon);
      } else if (type === 'plant') {
        const mata = el('g', { transform: 'translate(13 10)' }, icon);
        el('circle', { cx: 0, cy: 0, r: 2.4, fill: '#c98f63', stroke: '#8a5a3b', 'stroke-width': .6 }, mata);
        for (const [a, len, off, bend, tone] of PLANT_LEAVES) {
          drawLeaf(mata, 8 * len, a, 8 * off, bend, PLANT_GREENS[tone], f.stroke, .6);
        }
      } else {
        el(type === 'bin' ? 'ellipse' : 'rect', type === 'bin' ? { cx: 13, cy: 10, rx: 7, ry: 7, fill: f.fill, stroke: f.stroke } : { x: 13 - w / 2, y: 10 - h / 2, width: w, height: h, fill: f.fill, stroke: f.stroke }, icon);
      }
    }
    return icon;
  }

  // Se vuelve a ejecutar al cambiar de idioma, así que primero se vacía todo.
  function buildPalettes() {
    const desks = document.getElementById('palette-desks');
    const furniture = document.getElementById('palette-furniture');
    const blockType = document.getElementById('block-type');
    desks.innerHTML = '';
    furniture.innerHTML = '';
    blockType.innerHTML = '';
    document.querySelectorAll('select.name-format').forEach(s => { s.innerHTML = ''; });
    for (const type of Object.keys(DESK_TYPES)) {
      desks.appendChild(paletteButton(type));
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = t('type_' + type);
      blockType.appendChild(opt);
    }
    for (const type of Object.keys(FURNITURE_TYPES)) furniture.appendChild(paletteButton(type));
    document.querySelectorAll('select.name-format').forEach(select => {
      for (const f of NAME_FORMATS) {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = t(NAME_FORMAT_LABEL[f]);
        select.appendChild(opt);
      }
    });
  }

  function paletteButton(type) {
    const b = document.createElement('button');
    b.type = 'button';
    const span = document.createElement('span');
    span.textContent = t('type_' + type);
    b.append(paletteIcon(type), span);
    b.addEventListener('click', () => addObject(type));
    return b;
  }

  // Coloca el objeto nuevo en el centro de la parte visible del aula, sin taparse con otro recién puesto.
  function visibleCenter() {
    const rect = canvas.getBoundingClientRect();
    const p = clientToSvg(rect.left + rect.width / 2, rect.top + rect.height / 2);
    const c = cls();
    return { x: clamp(p.x, 0, c.room.w), y: clamp(p.y, 0, c.room.h) };
  }

  function addObject(type) {
    checkpoint();
    const c = cls();
    let { x, y } = visibleCenter();
    while (c.objects.some(o => Math.abs(o.x - x) < 5 && Math.abs(o.y - y) < 5)) { x += 30; y += 30; }
    const obj = makeObject(type, snap(x), snap(y));
    c.objects.push(obj);
    selection = new Set([obj.id]);
    commit();
  }

  function snap(v) { return Math.round(v / SNAP) * SNAP; }

  /* ---------- Operaciones sobre la selección ---------- */

  function selectedObjects() { return cls().objects.filter(o => selection.has(o.id)); }

  function deleteSelection() {
    if (!selection.size) return;
    checkpoint();
    const c = cls();
    c.objects = c.objects.filter(o => !selection.has(o.id));
    selection.clear();
    commit();
  }

  function duplicateSelection() {
    const sel = selectedObjects();
    if (!sel.length) return;
    checkpoint();
    // La copia se coloca al lado del original: un objeto solo, a lo largo de su
    // propia orientación (así se forman filas, también en diagonal); varios, a
    // la derecha del conjunto. Mantiene tamaño y giro, pero no el alumnado.
    let dx, dy;
    if (sel.length === 1) {
      const rad = sel[0].rot * Math.PI / 180;
      const step = sel[0].w + 30;
      dx = step * Math.cos(rad);
      dy = step * Math.sin(rad);
    } else {
      const b = boundsOf(sel, cls());
      dx = b.x1 - b.x0 + 30;
      dy = 0;
    }
    const newGroups = new Map();
    const copies = sel.map(o => {
      const copy = JSON.parse(JSON.stringify(o));
      copy.id = uid();
      if (copy.groupId) {
        if (!newGroups.has(copy.groupId)) newGroups.set(copy.groupId, uid());
        copy.groupId = newGroups.get(copy.groupId);
      }
      copy.x = snap(o.x + dx);
      copy.y = snap(o.y + dy);
      if (copy.seats) copy.seats = copy.seats.map(() => null);
      return copy;
    });
    cls().objects.push(...copies);
    selection = new Set(copies.map(o => o.id));
    commit();
  }

  /* ---------- Alinear y repartir ---------- */

  // La selección se reparte en «unidades»: cada grupo cuenta como una sola
  // pieza y se mueve entero, y cada objeto suelto va por su cuenta. De cada
  // unidad se toma su rectángulo (sin las sillas: lo que se alinea son las
  // mesas y el mobiliario, no el sitio que ocupa quien se sienta).
  function selectionUnits() {
    const units = new Map();
    for (const o of selectedObjects()) {
      const key = o.groupId || o.id;
      if (!units.has(key)) units.set(key, []);
      units.get(key).push(o);
    }
    return [...units.values()].map(objs => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const o of objs) {
        const { halfW, halfH } = extent(o);
        x0 = Math.min(x0, o.x - halfW); x1 = Math.max(x1, o.x + halfW);
        y0 = Math.min(y0, o.y - halfH); y1 = Math.max(y1, o.y + halfH);
      }
      return { objs, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
    });
  }

  // Al alinear no se redondea a la rejilla: si no, cada elemento caería en una
  // casilla distinta y la fila volvería a quedar desigual.
  function moveUnit(unit, dx, dy) {
    unit.objs.forEach(o => { o.x += dx; o.y += dy; });
  }

  function alignSelection(mode) {
    const units = selectionUnits();
    if (units.length < 2) return;
    const x0 = Math.min(...units.map(u => u.x0)), x1 = Math.max(...units.map(u => u.x1));
    const y0 = Math.min(...units.map(u => u.y0)), y1 = Math.max(...units.map(u => u.y1));
    checkpoint();
    for (const u of units) {
      switch (mode) {
        case 'left': moveUnit(u, x0 - u.x0, 0); break;
        case 'right': moveUnit(u, x1 - u.x1, 0); break;
        case 'hcenter': moveUnit(u, (x0 + x1 - u.x0 - u.x1) / 2, 0); break;
        case 'top': moveUnit(u, 0, y0 - u.y0); break;
        case 'bottom': moveUnit(u, 0, y1 - u.y1); break;
        case 'vcenter': moveUnit(u, 0, (y0 + y1 - u.y0 - u.y1) / 2); break;
      }
    }
    commit();
  }

  // Deja el mismo hueco entre unidades consecutivas sin mover las de los
  // extremos, que son las que marcan el espacio disponible.
  function distributeSelection(axis) {
    const units = selectionUnits();
    if (units.length < 3) return;
    const horiz = axis === 'x';
    units.sort((a, b) => (horiz ? a.x0 - b.x0 : a.y0 - b.y0));
    const first = units[0], last = units[units.length - 1];
    const span = horiz ? last.x1 - first.x0 : last.y1 - first.y0;
    const busy = units.reduce((sum, u) => sum + (horiz ? u.w : u.h), 0);
    const gap = (span - busy) / (units.length - 1);
    checkpoint();
    let cursor = (horiz ? first.x1 : first.y1) + gap;
    for (let i = 1; i < units.length - 1; i++) {
      const u = units[i];
      if (horiz) moveUnit(u, cursor - u.x0, 0); else moveUnit(u, 0, cursor - u.y0);
      cursor += (horiz ? u.w : u.h) + gap;
    }
    commit();
  }

  /* ---------- Agrupar ---------- */

  // Un objeto agrupado se selecciona siempre junto con el resto de su grupo.
  function groupMembers(id) {
    const obj = findObj(id);
    if (!obj || !obj.groupId) return [id];
    return cls().objects.filter(o => o.groupId === obj.groupId).map(o => o.id);
  }

  // Estado de la selección respecto a los grupos: si ya es un único grupo
  // completo no tiene sentido agruparla; si contiene algún grupo, se puede desagrupar.
  function groupState() {
    const sel = selectedObjects();
    const ids = new Set(sel.map(o => o.groupId));
    const single = sel.length > 1 && ids.size === 1 && !ids.has(undefined);
    return { sel, canGroup: sel.length > 1 && !single, canUngroup: sel.some(o => o.groupId), single };
  }

  function groupSelection() {
    const { sel, canGroup } = groupState();
    if (!canGroup) return;
    checkpoint();
    const gid = uid();
    sel.forEach(o => { o.groupId = gid; });
    commit();
  }

  function ungroupSelection() {
    const { sel, canUngroup } = groupState();
    if (!canUngroup) return;
    checkpoint();
    sel.forEach(o => { delete o.groupId; });
    commit();
  }

  // Rectángulo (sin girar) que ocupa un conjunto de objetos, incluidas las
  // sillas y las figuras que sobresalen de las mesas.
  function boundsOf(objs, c, pad = 0) {
    const people = c.showPeople !== false;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const o of objs) {
      let l = -o.w / 2, r = o.w / 2, t = -o.h / 2, b = o.h / 2;
      if (isDesk(o) && people) {
        const chair = 40;
        b += chair;
        if (o.rows > 1) t -= chair;
        if (o.rows > 2) { l -= chair; r += chair; }
      }
      if (o.type === 'teacher' && people) t -= 40;
      const rad = o.rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      for (const [lx, ly] of [[l, t], [r, t], [l, b], [r, b]]) {
        const x = o.x + lx * cos - ly * sin, y = o.y + lx * sin + ly * cos;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  // Medio ancho y medio alto que ocupa un objeto girado.
  function extent(o) {
    const rad = o.rot * Math.PI / 180;
    return {
      halfW: (Math.abs(o.w * Math.cos(rad)) + Math.abs(o.h * Math.sin(rad))) / 2,
      halfH: (Math.abs(o.w * Math.sin(rad)) + Math.abs(o.h * Math.cos(rad))) / 2
    };
  }

  // Orden de dibujo: lo último de la lista queda encima.
  function reorderSelection(toFront) {
    const c = cls();
    const sel = c.objects.filter(o => selection.has(o.id));
    if (!sel.length) return;
    checkpoint();
    const rest = c.objects.filter(o => !selection.has(o.id));
    c.objects = toFront ? [...rest, ...sel] : [...sel, ...rest];
    commit();
  }

  function clearSeatsOfSelection() {
    const desks = selectedObjects().filter(isDesk);
    if (!desks.some(o => o.seats.some(Boolean))) return;
    checkpoint();
    desks.forEach(o => { o.seats = o.seats.map(() => null); });
    commit();
  }

  // Gira la selección alrededor de su centro: un solo objeto gira sobre sí mismo.
  function rotateSelection(deg) {
    const sel = selectedObjects();
    if (!sel.length) return;
    checkpoint();
    const cx = sel.reduce((a, o) => a + o.x, 0) / sel.length;
    const cy = sel.reduce((a, o) => a + o.y, 0) / sel.length;
    const rad = deg * Math.PI / 180;
    for (const o of sel) {
      const dx = o.x - cx, dy = o.y - cy;
      o.x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
      o.y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
      o.rot = normAngle(o.rot + deg);
    }
    commit();
  }

  function moveSelection(dx, dy) {
    const sel = selectedObjects();
    if (!sel.length) return;
    checkpoint();
    sel.forEach(o => { o.x += dx; o.y += dy; });
    commit();
  }

  /* ---------- Ratón y pantalla táctil ---------- */

  let drag = null;
  let marquee = null;

  function clientToSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = clientToSvg(e.clientX, e.clientY);
    const c = cls();

    if (mode === 'students') {
      const seat = e.target.closest('[data-seat]');
      const obj = seat && findObj(seat.dataset.obj);
      const studentId = obj && obj.seats[+seat.dataset.seat];
      if (studentId) startStudentDrag(e, studentId, { obj: obj.id, seat: +seat.dataset.seat });
      else startPan(e);
      return;
    }

    const wall = e.target.closest('[data-wall]');
    if (wall) {
      startWallDrag(e, wall.dataset.wall);
      return;
    }

    const handle = e.target.closest('[data-handle]');
    if (handle && handle.dataset.handle === 'rotate-group') {
      const sel = selectedObjects();
      const b = boundsOf(sel, c);
      const center = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
      drag = {
        kind: 'rotate-group', center, before: JSON.stringify(c), moved: false,
        startAngle: Math.atan2(p.y - center.y, p.x - center.x) * 180 / Math.PI,
        origins: sel.map(o => ({ o, x: o.x, y: o.y, rot: o.rot }))
      };
      e.preventDefault();
      return;
    }
    if (handle && selection.size === 1) {
      const obj = findObj([...selection][0]);
      drag = { kind: handle.dataset.handle, obj, before: JSON.stringify(c), moved: false };
      e.preventDefault();
      return;
    }

    const g = e.target.closest('.obj');
    if (g) {
      const id = g.dataset.id;
      const members = groupMembers(id);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const remove = selection.has(id);
        members.forEach(m => (remove ? selection.delete(m) : selection.add(m)));
        render();
        if (remove) return;
      } else if (!selection.has(id)) {
        selection = new Set(members);
        render();
      }
      drag = {
        kind: 'move', start: p, before: JSON.stringify(c), moved: false,
        origins: selectedObjects().map(o => ({ o, x: o.x, y: o.y }))
      };
      e.preventDefault();
      return;
    }

    // En una zona vacía: con Mayús (o Ctrl) se selecciona con un recuadro;
    // sin tecla, se desplaza el plano.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: new Set(selection) };
      render();
    } else {
      startPan(e, true);
    }
    e.preventDefault();
  });

  /* ---------- Menú del botón derecho ---------- */

  const menu = document.getElementById('context-menu');

  function hideMenu() { menu.hidden = true; }

  function showMenu(x, y, items) {
    menu.innerHTML = '';
    for (const item of items) {
      if (item === '-') {
        menu.appendChild(document.createElement('hr'));
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = item.danger ? 'danger' : '';
      b.disabled = !!item.disabled;
      const label = document.createElement('span');
      label.textContent = item.label;
      b.appendChild(label);
      if (item.keys) {
        const keys = document.createElement('kbd');
        keys.textContent = item.keys;
        b.appendChild(keys);
      }
      b.addEventListener('click', () => { hideMenu(); item.action(); });
      menu.appendChild(b);
    }
    menu.hidden = false;
    // Que no se salga de la ventana.
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
  }

  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const g = e.target.closest('.obj');
    if (mode === 'students') {
      const seat = e.target.closest('[data-seat]');
      const obj = seat && findObj(seat.dataset.obj);
      const index = seat ? +seat.dataset.seat : -1;
      if (!obj || !obj.seats[index]) { hideMenu(); return; }
      showMenu(e.clientX, e.clientY, [{
        label: t('menu_free_seat'),
        action: () => { checkpoint(); obj.seats[index] = null; commit(); }
      }]);
      return;
    }
    if (!g) {
      showMenu(e.clientX, e.clientY, [{
        label: t('menu_select_all'), keys: 'Ctrl+A', disabled: !cls().objects.length,
        action: () => { selection = new Set(cls().objects.map(o => o.id)); render(); }
      }]);
      return;
    }
    if (!selection.has(g.dataset.id)) {
      selection = new Set(groupMembers(g.dataset.id));
      render();
    }
    const sel = selectedObjects();
    const hasStudents = sel.some(o => isDesk(o) && o.seats.some(Boolean));
    const gs = groupState();
    const items = [
      { label: t('duplicate'), keys: 'Ctrl+D', action: duplicateSelection },
      '-'
    ];
    if (gs.canGroup) items.push({ label: t('group'), keys: 'Ctrl+G', action: groupSelection });
    if (gs.canUngroup) items.push({ label: t('ungroup'), keys: 'Ctrl+Mayús+G', action: ungroupSelection });
    if (gs.canGroup || gs.canUngroup) items.push('-');
    items.push(
      { label: t('rotate_left'), keys: 'Mayús+R', action: () => rotateSelection(-15) },
      { label: t('rotate_right'), keys: 'R', action: () => rotateSelection(15) },
      { label: t('rotate_90'), action: () => rotateSelection(90) },
      '-',
      { label: t('bring_front'), action: () => reorderSelection(true) },
      { label: t('send_back'), action: () => reorderSelection(false) }
    );
    if (sel.some(isDesk)) {
      items.push('-', { label: t('menu_free_desks'), disabled: !hasStudents, action: clearSeatsOfSelection });
    }
    items.push('-', { label: sel.length > 1 ? t('delete_count', { count: sel.length }) : t('delete'), keys: 'Supr', danger: true, action: deleteSelection });
    showMenu(e.clientX, e.clientY, items);
  });

  // Con Mayús o Ctrl, arrastrar en vacío selecciona en lugar de desplazar:
  // el cursor pasa de la mano a la flecha normal.
  function updateSelectCursor(e) {
    svg.classList.toggle('select-cursor', e.shiftKey || e.ctrlKey || e.metaKey);
  }
  document.addEventListener('keydown', updateSelectCursor);
  document.addEventListener('keyup', updateSelectCursor);
  svg.addEventListener('pointermove', updateSelectCursor);
  window.addEventListener('blur', () => svg.classList.remove('select-cursor'));

  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) hideMenu(); }, true);
  window.addEventListener('blur', hideMenu);
  canvas.addEventListener('scroll', hideMenu);

  /* ---------- Desplazar el plano ---------- */

  let pan = null;

  function startPan(e, clearOnClick = false) {
    pan = { x: e.clientX, y: e.clientY, left: canvas.scrollLeft, top: canvas.scrollTop, moved: false, clearOnClick };
    canvas.classList.add('panning');
    e.preventDefault();
  }

  function movePan(e) {
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.hypot(dx, dy) > 3) pan.moved = true;
    canvas.scrollLeft = pan.left - dx;
    canvas.scrollTop = pan.top - dy;
  }

  function endPan() {
    canvas.classList.remove('panning');
    // Un clic sin arrastrar en una zona vacía quita la selección, como antes.
    if (!pan.moved && pan.clearOnClick && selection.size) {
      selection.clear();
      render();
    }
    pan = null;
  }

  // Ctrl + rueda acerca o aleja manteniendo fijo el punto bajo el ratón.
  canvas.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const before = clientToSvg(e.clientX, e.clientY);
    zoom = clamp(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.15, 4);
    render();
    const pt = svg.createSVGPoint();
    pt.x = before.x;
    pt.y = before.y;
    const after = pt.matrixTransform(svg.getScreenCTM());
    canvas.scrollLeft += after.x - e.clientX;
    canvas.scrollTop += after.y - e.clientY;
  }, { passive: false });

  /* ---------- Mover las paredes ---------- */

  const WALL_REACH = 1000; // cm que puede crecer el aula por cada lado en un mismo arrastre
  const ROOM_MIN = 200, ROOM_MAX = 4000;

  function roomOriginOnScreen() {
    const pt = svg.createSVGPoint();
    pt.x = 0;
    pt.y = 0;
    return pt.matrixTransform(svg.getScreenCTM());
  }

  // Lo que está pegado a la pared que se arrastra (pizarra, puerta, un armario…) se mueve con ella.
  function touchesWall(o, wall, room) {
    const { halfW, halfH } = extent(o);
    const near = 15;
    switch (wall) {
      case 'left': return o.x - halfW <= near;
      case 'right': return o.x + halfW >= room.w - near;
      case 'top': return o.y - halfH <= near;
      default: return o.y + halfH >= room.h - near;
    }
  }

  function startWallDrag(e, wall) {
    const c = cls();
    const scrollable = { x: canvas.scrollWidth > canvas.clientWidth, y: canvas.scrollHeight > canvas.clientHeight };
    drag = {
      kind: 'wall', wall, moved: false, before: JSON.stringify(c),
      w0: c.room.w, h0: c.room.h, shiftX: 0, shiftY: 0,
      origins: c.objects.map(o => ({ o, x: o.x, y: o.y, attached: touchesWall(o, wall, c.room) })),
      frame: {
        x: -MARGIN - WALL_REACH, y: -MARGIN - WALL_REACH,
        w: c.room.w + 2 * (MARGIN + WALL_REACH), h: c.room.h + 2 * (MARGIN + WALL_REACH)
      }
    };
    const origin = roomOriginOnScreen();
    render();
    // El marco ampliado crece por igual a los dos lados: si el lienzo ya tenía
    // barras, se compensa el desplazamiento para que el aula no salte.
    const moved = roomOriginOnScreen();
    canvas.scrollLeft += moved.x - origin.x;
    canvas.scrollTop += moved.y - origin.y;
    drag.inverse = svg.getScreenCTM().inverse();
    // Distancia entre el punto donde se ha cogido (la pared o su tirador) y la
    // pared, para que esta no dé un salto al empezar a arrastrar.
    const p0 = wallPoint(e);
    drag.grabX = p0.x - (wall === 'right' ? c.room.w : 0);
    drag.grabY = p0.y - (wall === 'bottom' ? c.room.h : 0);
    e.preventDefault();
  }

  // Coordenadas del ratón respecto al aula tal como estaba al empezar a arrastrar.
  function wallPoint(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(drag.inverse);
  }

  function moveWall(e) {
    const c = cls();
    const raw = wallPoint(e);
    const p = { x: raw.x - drag.grabX, y: raw.y - drag.grabY };
    const limit = (size, base) => clamp(size, Math.max(ROOM_MIN, base - WALL_REACH), Math.min(ROOM_MAX, base + WALL_REACH));
    drag.moved = true;
    if (drag.wall === 'right') c.room.w = limit(snap(p.x) - drag.shiftX, drag.w0);
    if (drag.wall === 'bottom') c.room.h = limit(snap(p.y) - drag.shiftY, drag.h0);
    if (drag.wall === 'left') {
      c.room.w = limit(drag.w0 - snap(p.x), drag.w0);
      drag.shiftX = drag.w0 - c.room.w;
    }
    if (drag.wall === 'top') {
      c.room.h = limit(drag.h0 - snap(p.y), drag.h0);
      drag.shiftY = drag.h0 - c.room.h;
    }
    // Al mover la pared izquierda o la de arriba, el resto del aula no se mueve:
    // cambia el origen de coordenadas, así que se corrigen las posiciones.
    for (const item of drag.origins) {
      item.o.x = item.x - drag.shiftX;
      item.o.y = item.y - drag.shiftY;
      if (!item.attached) continue;
      if (drag.wall === 'left') item.o.x = item.x;
      if (drag.wall === 'top') item.o.y = item.y;
      if (drag.wall === 'right') item.o.x = item.x + c.room.w - drag.w0;
      if (drag.wall === 'bottom') item.o.y = item.y + c.room.h - drag.h0;
    }
    document.getElementById('room-w').value = (c.room.w / 100).toFixed(1);
    document.getElementById('room-h').value = (c.room.h / 100).toFixed(1);
  }

  function endWallDrag() {
    const origin = roomOriginOnScreen();
    const done = drag;
    drag = null;
    render();
    const moved = roomOriginOnScreen();
    canvas.scrollLeft += moved.x - origin.x;
    canvas.scrollTop += moved.y - origin.y;
    if (done.moved) {
      history.undo.push({ classId: state.current, data: done.before });
      history.redo.length = 0;
      saveState();
      renderSidebar();
      updateUndoButtons();
    }
  }

  window.addEventListener('pointermove', (e) => {
    if (studentDrag) { moveStudentDrag(e); return; }
    if (pan) { movePan(e); return; }
    if (!drag && !marquee) return;
    if (drag && drag.kind === 'wall') { moveWall(e); render(); return; }
    const p = clientToSvg(e.clientX, e.clientY);

    if (marquee) {
      marquee.x1 = p.x;
      marquee.y1 = p.y;
      const x0 = Math.min(marquee.x0, p.x), x1 = Math.max(marquee.x0, p.x);
      const y0 = Math.min(marquee.y0, p.y), y1 = Math.max(marquee.y0, p.y);
      selection = new Set(marquee.base);
      cls().objects.forEach(o => {
        if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) groupMembers(o.id).forEach(m => selection.add(m));
      });
      render();
      return;
    }

    drag.moved = true;
    if (drag.kind === 'move') {
      const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      for (const item of drag.origins) {
        item.o.x = e.altKey ? item.x + dx : snap(item.x + dx);
        item.o.y = e.altKey ? item.y + dy : snap(item.y + dy);
      }
    } else if (drag.kind === 'rotate-group') {
      const { center } = drag;
      const raw = Math.atan2(p.y - center.y, p.x - center.x) * 180 / Math.PI - drag.startAngle;
      const deg = e.altKey ? Math.round(raw) : Math.round(raw / 15) * 15;
      const rad = deg * Math.PI / 180;
      for (const item of drag.origins) {
        const dx = item.x - center.x, dy = item.y - center.y;
        item.o.x = center.x + dx * Math.cos(rad) - dy * Math.sin(rad);
        item.o.y = center.y + dx * Math.sin(rad) + dy * Math.cos(rad);
        item.o.rot = normAngle(item.rot + deg);
      }
    } else if (drag.kind === 'rotate') {
      const o = drag.obj;
      let deg = Math.atan2(p.y - o.y, p.x - o.x) * 180 / Math.PI + 90;
      o.rot = normAngle(e.altKey ? Math.round(deg) : Math.round(deg / 15) * 15);
    } else if (drag.kind === 'resize') {
      const o = drag.obj;
      const rad = -o.rot * Math.PI / 180;
      const dx = p.x - o.x, dy = p.y - o.y;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      o.w = Math.max(10, snap(Math.abs(lx) * 2 - 8));
      o.h = Math.max(5, snap(Math.abs(ly) * 2 - 8));
    }
    render();
  });

  window.addEventListener('pointerup', (e) => {
    if (studentDrag) { endStudentDrag(e); return; }
    if (pan) { endPan(); return; }
    if (marquee) { marquee = null; render(); return; }
    if (!drag) return;
    if (drag.kind === 'wall') { endWallDrag(); return; }
    if (drag.moved) {
      history.undo.push({ classId: state.current, data: drag.before });
      history.redo.length = 0;
      saveState();
    }
    drag = null;
    render();
  });

  /* ---------- Arrastrar alumnado ---------- */

  let studentDrag = null;
  const ghost = document.getElementById('drag-ghost');
  const studentList = document.getElementById('student-list');

  function startStudentDrag(e, studentId, from) {
    const student = findStudent(studentId);
    if (!student) return;
    studentDrag = { studentId, from, startX: e.clientX, startY: e.clientY, active: false, hover: null };
    ghost.textContent = formatName(student.name, cls().nameFormat);
    e.preventDefault();
  }

  function dropTargetAt(x, y) {
    const target = document.elementFromPoint(x, y);
    if (!target) return null;
    const seat = target.closest('[data-seat]');
    if (seat) return { kind: 'seat', obj: seat.dataset.obj, seat: +seat.dataset.seat, node: seat.querySelector('.seat') };
    if (target.closest('#student-list')) return { kind: 'list' };
    return null;
  }

  function moveStudentDrag(e) {
    const d = studentDrag;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.active = true;
    ghost.hidden = false;
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    svg.querySelectorAll('.drop-hover').forEach(n => n.classList.remove('drop-hover'));
    studentList.classList.remove('drop-target');
    const target = dropTargetAt(e.clientX, e.clientY);
    if (target?.kind === 'seat') target.node.classList.add('drop-hover');
    if (target?.kind === 'list' && d.from) studentList.classList.add('drop-target');
  }

  function endStudentDrag(e) {
    const d = studentDrag;
    studentDrag = null;
    ghost.hidden = true;
    studentList.classList.remove('drop-target');
    if (!d.active) { render(); return; }
    const target = dropTargetAt(e.clientX, e.clientY);
    if (!target) { render(); return; }
    const c = cls();
    if (target.kind === 'seat') {
      const dest = findObj(target.obj);
      const occupant = dest.seats[target.seat];
      if (occupant === d.studentId) { render(); return; }
      checkpoint();
      // Quita al alumno de donde estuviera y, si la mesa de destino estaba ocupada,
      // pasa a quien la ocupaba al sitio que queda libre.
      let freed = null;
      c.objects.forEach(o => {
        if (!isDesk(o)) return;
        const i = o.seats.indexOf(d.studentId);
        if (i >= 0) { o.seats[i] = null; freed = { o, i }; }
      });
      dest.seats[target.seat] = d.studentId;
      if (occupant && freed) freed.o.seats[freed.i] = occupant;
      commit();
    } else if (target.kind === 'list' && d.from) {
      checkpoint();
      findObj(d.from.obj).seats[d.from.seat] = null;
      commit();
    } else {
      render();
    }
  }

  studentList.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.handle');
    if (!handle || e.button !== 0) return;
    startStudentDrag(e, handle.dataset.student, null);
  });

  /* ---------- Teclado ---------- */

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select') || document.querySelector('dialog[open]');
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) restoreSnapshot(history.redo, history.undo);
      else restoreSnapshot(history.undo, history.redo);
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      restoreSnapshot(history.redo, history.undo);
      return;
    }
    if (e.key === 'Escape' && !menu.hidden) { hideMenu(); return; }
    if (typing || mode !== 'room') return;
    const step = e.shiftKey ? 1 : SNAP;
    switch (e.key) {
      case 'Delete':
      case 'Backspace': e.preventDefault(); deleteSelection(); break;
      case 'Escape': selection.clear(); render(); break;
      case 'ArrowLeft': e.preventDefault(); moveSelection(-step, 0); break;
      case 'ArrowRight': e.preventDefault(); moveSelection(step, 0); break;
      case 'ArrowUp': e.preventDefault(); moveSelection(0, -step); break;
      case 'ArrowDown': e.preventDefault(); moveSelection(0, step); break;
      case 'r': case 'R': rotateSelection(e.shiftKey ? -15 : 15); break;
      case 'd': case 'D': if (ctrl) { e.preventDefault(); duplicateSelection(); } break;
      case 'g': case 'G': if (ctrl) { e.preventDefault(); if (e.shiftKey) ungroupSelection(); else groupSelection(); } break;
      case 'a': case 'A': if (ctrl) { e.preventDefault(); selection = new Set(cls().objects.map(o => o.id)); render(); } break;
    }
  });

  /* ---------- Bloque de mesas ---------- */

  function createBlock(type, rows, cols, gapX, gapY, angle) {
    const def = DESK_TYPES[type];
    const c = cls();
    const totalW = cols * def.w + (cols - 1) * gapX;
    const totalH = rows * def.h + (rows - 1) * gapY;
    const center = visibleCenter();
    const rad = angle * Math.PI / 180;
    const created = [];
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const lx = -totalW / 2 + def.w / 2 + col * (def.w + gapX);
        const ly = -totalH / 2 + def.h / 2 + r * (def.h + gapY);
        const obj = makeObject(type,
          center.x + lx * Math.cos(rad) - ly * Math.sin(rad),
          center.y + lx * Math.sin(rad) + ly * Math.cos(rad));
        obj.rot = normAngle(angle);
        created.push(obj);
      }
    }
    checkpoint();
    c.objects.push(...created);
    selection = new Set(created.map(o => o.id));
    commit();
  }

  document.getElementById('btn-block').addEventListener('click', () => document.getElementById('dlg-block').showModal());
  document.getElementById('dlg-block').addEventListener('close', (e) => {
    const dlg = e.target;
    if (dlg.returnValue !== 'ok') return;
    const num = (id, min, max, def) => clamp(parseFloat(document.getElementById(id).value) || def, min, max);
    createBlock(
      document.getElementById('block-type').value,
      Math.round(num('block-rows', 1, 20, 1)),
      Math.round(num('block-cols', 1, 20, 1)),
      num('block-gap-x', 0, 500, 0),
      num('block-gap-y', 0, 500, 0),
      parseFloat(document.getElementById('block-angle').value) || 0
    );
  });

  /* ---------- Clases ---------- */

  document.getElementById('class-select').addEventListener('change', (e) => {
    state.current = e.target.value;
    selection.clear();
    saveState();
    renderAll();
    fitZoom();
  });

  document.getElementById('btn-class-new').addEventListener('click', () => {
    const base = document.getElementById('new-class-base');
    base.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = t('new_class_base_empty');
    base.appendChild(empty);
    for (const c of state.classes) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = t('new_class_base_copy', { name: c.name });
      base.appendChild(opt);
    }
    base.value = state.current;
    document.getElementById('new-class-name').value = '';
    document.getElementById('dlg-class').showModal();
  });

  document.getElementById('dlg-class').addEventListener('close', (e) => {
    if (e.target.returnValue !== 'ok') return;
    const name = document.getElementById('new-class-name').value.trim() || t('class_default_name');
    const baseId = document.getElementById('new-class-base').value;
    let created;
    const source = state.classes.find(c => c.id === baseId);
    if (source) {
      created = JSON.parse(JSON.stringify(source));
      created.id = uid();
      created.name = name;
      created.students = [];
      created.objects.forEach(o => { o.id = uid(); if (o.seats) o.seats = o.seats.map(() => null); });
    } else {
      created = newClass(name);
    }
    state.classes.push(created);
    state.current = created.id;
    selection.clear();
    saveState();
    renderAll();
    fitZoom();
  });

  document.getElementById('btn-class-rename').addEventListener('click', () => {
    document.getElementById('rename-input').value = cls().name;
    document.getElementById('dlg-rename').showModal();
  });
  document.getElementById('dlg-rename').addEventListener('close', (e) => {
    if (e.target.returnValue !== 'ok') return;
    const name = document.getElementById('rename-input').value.trim();
    if (!name) return;
    cls().name = name;
    saveState();
    renderClassSelect();
  });

  document.getElementById('btn-class-delete').addEventListener('click', () => {
    if (state.classes.length < 2) { alert(t('cannot_delete_last')); return; }
    if (!confirm(t('confirm_delete_class', { name: cls().name }))) return;
    state.classes = state.classes.filter(c => c.id !== state.current);
    state.current = state.classes[0].id;
    history.undo.length = 0;
    history.redo.length = 0;
    selection.clear();
    saveState();
    renderAll();
    fitZoom();
  });

  /* ---------- Aula ---------- */

  function onRoomSize() {
    const c = cls();
    const w = clamp(parseFloat(document.getElementById('room-w').value) * 100, 200, 4000);
    const h = clamp(parseFloat(document.getElementById('room-h').value) * 100, 200, 4000);
    checkpoint();
    c.room.w = Math.round(w);
    c.room.h = Math.round(h);
    commit();
    fitZoom();
  }
  document.getElementById('room-w').addEventListener('change', onRoomSize);
  document.getElementById('room-h').addEventListener('change', onRoomSize);

  /* ---------- Alumnado ---------- */

  document.getElementById('btn-students-add').addEventListener('click', () => {
    const area = document.getElementById('students-paste');
    const names = area.value.split(/\r?\n/)
      .map(line => line.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!names.length) return;
    checkpoint();
    cls().students.push(...names.map(name => ({ id: uid(), name })));
    area.value = '';
    commit();
  });

  document.querySelectorAll('select.name-format').forEach(select => {
    select.addEventListener('change', () => {
      cls().nameFormat = select.value;
      saveState();
      renderSidebar();
      render();
    });
  });

  document.getElementById('show-people').addEventListener('change', (e) => {
    cls().showPeople = e.target.checked;
    saveState();
    render();
  });

  function emptySeats() {
    const seats = [];
    cls().objects.forEach(o => { if (isDesk(o)) o.seats.forEach((s, i) => { if (!s) seats.push({ o, i }); }); });
    return seats;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  document.getElementById('btn-random').addEventListener('click', () => {
    const c = cls();
    const seated = new Set();
    c.objects.forEach(o => { if (isDesk(o)) o.seats.forEach(s => s && seated.add(s)); });
    const waiting = shuffle(c.students.filter(s => !seated.has(s.id)));
    if (!waiting.length) return;
    const free = shuffle(emptySeats());
    checkpoint();
    waiting.forEach((s, k) => { if (free[k]) free[k].o.seats[free[k].i] = s.id; });
    commit();
    if (waiting.length > free.length) alert(t('random_no_seats', { count: waiting.length - free.length }));
  });

  document.getElementById('btn-clear-seats').addEventListener('click', () => {
    if (!confirm(t('confirm_clear_seats'))) return;
    checkpoint();
    cls().objects.forEach(o => { if (isDesk(o)) o.seats = o.seats.map(() => null); });
    commit();
  });

  document.getElementById('btn-sort').addEventListener('click', () => {
    checkpoint();
    const key = s => { const { given, surnames } = splitName(s.name); return (surnames + ' ' + given).trim(); };
    cls().students.sort((a, b) => key(a).localeCompare(key(b), window.i18n.lang));
    commit();
  });

  document.getElementById('btn-delete-students').addEventListener('click', () => {
    if (!cls().students.length || !confirm(t('confirm_delete_students'))) return;
    checkpoint();
    const c = cls();
    c.students = [];
    c.objects.forEach(o => { if (isDesk(o)) o.seats = o.seats.map(() => null); });
    commit();
  });

  /* ---------- Modos ---------- */

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.mode;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === tab));
      document.getElementById('panel-room').hidden = mode !== 'room';
      document.getElementById('panel-students').hidden = mode !== 'students';
      if (mode === 'students') selection.clear();
      render();
    });
  });

  /* ---------- Deshacer, zoom ---------- */

  document.getElementById('btn-undo').addEventListener('click', () => restoreSnapshot(history.undo, history.redo));
  document.getElementById('btn-redo').addEventListener('click', () => restoreSnapshot(history.redo, history.undo));
  document.getElementById('btn-zoom-in').addEventListener('click', () => { zoom = Math.min(4, zoom * 1.2); render(); });
  document.getElementById('btn-zoom-out').addEventListener('click', () => { zoom = Math.max(0.15, zoom / 1.2); render(); });
  document.getElementById('btn-zoom-fit').addEventListener('click', fitZoom);

  /* ---------- Exportar e importar ---------- */

  // Clases utilizables de un archivo o de un enlace.
  function validClasses(data) {
    return (data && Array.isArray(data.classes) ? data.classes : [])
      .filter(c => c && c.room && Array.isArray(c.objects));
  }

  // Las añade a las que ya hay, con identificadores nuevos para no chocar.
  function addClasses(classes) {
    for (const c of classes) {
      const studentIds = new Map();
      c.students = (c.students || []).map(s => { const id = uid(); studentIds.set(s.id, id); return { id, name: String(s.name || '') }; });
      c.objects.forEach(o => {
        o.id = uid();
        if (o.seats) o.seats = o.seats.map(s => studentIds.get(s) || null);
      });
      c.id = uid();
      c.name = String(c.name || t('class_default_name'));
      c.nameFormat = NAME_FORMATS.includes(c.nameFormat) ? c.nameFormat : 'first1';
      state.classes.push(c);
    }
    state.current = classes[0].id;
    selection.clear();
    saveState();
    renderAll();
    fitZoom();
  }

  document.getElementById('btn-export').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'classe', version: 1, classes: state.classes }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `plano-de-clase-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const classes = validClasses(JSON.parse(await file.text()));
      if (!classes.length) throw new Error('sin clases');
      addClasses(classes);
      alert(t('import_done', { count: classes.length }));
    } catch (err) {
      console.warn(err);
      alert(t('import_error'));
    }
  });

  /* ---------- Compartir por enlace ---------- */

  // Los datos viajan detrás de la almohadilla del enlace, así que no se envían
  // a ningún servidor: se quedan en el navegador de quien lo abre.
  const SHARE_LIMIT = 8000; // caracteres; por encima, mejor el archivo

  function toBase64url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64url(text) {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Marca «z»: comprimido; «j»: JSON en claro, para los navegadores sin
  // CompressionStream (Safari anterior al 16.4).
  async function packClasses(classes) {
    const bytes = new TextEncoder().encode(JSON.stringify({ app: 'classe', version: 1, classes }));
    if (!window.CompressionStream) return 'j' + toBase64url(bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + toBase64url(new Uint8Array(await new Response(stream).arrayBuffer()));
  }

  async function unpackClasses(text) {
    const bytes = fromBase64url(text.slice(1));
    if (text[0] !== 'z') return JSON.parse(new TextDecoder().decode(bytes));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(new TextDecoder().decode(await new Response(stream).arrayBuffer()));
  }

  // Copia de la clase lista para enviar; sin alumnado deja las mesas vacías.
  function shareCopy(c, withoutStudents) {
    const copy = JSON.parse(JSON.stringify(c));
    if (withoutStudents) {
      copy.students = [];
      copy.objects.forEach(o => { if (o.seats) o.seats = o.seats.map(() => null); });
    }
    return copy;
  }

  const dlgShare = document.getElementById('dlg-share');
  const shareUrl = document.getElementById('share-url');
  const shareInfo = document.getElementById('share-info');
  const shareCopyBtn = document.getElementById('btn-share-copy');
  const shareNoStudents = document.getElementById('share-no-students');

  async function updateShareLink() {
    const ids = [...dlgShare.querySelectorAll('#share-classes input:checked')].map(i => i.value);
    const withoutStudents = shareNoStudents.checked;
    if (!ids.length) {
      shareUrl.value = '';
      shareInfo.textContent = t('share_pick');
      shareInfo.classList.remove('warn');
      shareCopyBtn.disabled = true;
      return;
    }
    const classes = state.classes.filter(c => ids.includes(c.id)).map(c => shareCopy(c, withoutStudents));
    const url = location.href.split('#')[0] + '#c=' + await packClasses(classes);
    const names = !withoutStudents && classes.some(c => c.students.length);
    shareUrl.value = url;
    shareCopyBtn.disabled = false;
    shareInfo.textContent = url.length > SHARE_LIMIT ? t('share_too_long', { count: url.length })
      : t(names ? 'share_length_names' : 'share_length', { count: url.length });
    shareInfo.classList.toggle('warn', url.length > SHARE_LIMIT);
  }

  document.getElementById('btn-share').addEventListener('click', () => {
    const list = document.getElementById('share-classes');
    list.innerHTML = '';
    for (const c of state.classes) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = c.id;
      check.checked = c.id === state.current;
      check.addEventListener('change', updateShareLink);
      const span = document.createElement('span');
      span.textContent = c.name;
      label.append(check, span);
      li.appendChild(label);
      list.appendChild(li);
    }
    shareCopyBtn.textContent = t('share_copy');
    updateShareLink();
    dlgShare.showModal();
  });

  shareNoStudents.addEventListener('change', updateShareLink);

  shareCopyBtn.addEventListener('click', async () => {
    if (!shareUrl.value) return;
    try {
      await navigator.clipboard.writeText(shareUrl.value);
    } catch (e) {
      // Sin permiso para el portapapeles: al menos queda seleccionado.
      shareUrl.focus();
      shareUrl.select();
      return;
    }
    shareCopyBtn.textContent = t('share_copied');
    setTimeout(() => { shareCopyBtn.textContent = t('share_copy'); }, 1800);
  });

  // Al abrir un enlace compartido: se pregunta antes de añadir nada y se
  // limpia la barra de direcciones para no reenviarlo sin querer.
  async function readSharedLink() {
    const match = location.hash.match(/^#c=(.+)$/);
    if (!match) return;
    window.history.replaceState(null, '', location.href.split('#')[0]);
    try {
      const classes = validClasses(await unpackClasses(decodeURIComponent(match[1])));
      if (!classes.length) throw new Error('sin clases');
      const dlg = document.getElementById('dlg-receive');
      document.getElementById('receive-text').textContent =
        t('receive_text', { names: classes.map(c => c.name).join(', ') });
      dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') addClasses(classes); }, { once: true });
      dlg.showModal();
    } catch (err) {
      console.warn(err);
      alert(t('share_error'));
    }
  }

  /* ---------- Imprimir ---------- */

  document.getElementById('btn-print').addEventListener('click', () => {
    const c = cls();
    document.getElementById('print-heading').value = c.name;
    document.getElementById('print-name-format').value = c.nameFormat;
    document.getElementById('print-people').checked = c.showPeople !== false;
    document.getElementById('dlg-print').showModal();
  });

  document.getElementById('dlg-print').addEventListener('close', (e) => {
    if (e.target.returnValue !== 'ok') return;
    const c = cls();
    const area = document.getElementById('print-area');
    area.innerHTML = '';
    const h1 = document.createElement('h1');
    h1.textContent = document.getElementById('print-heading').value;
    area.appendChild(h1);
    if (document.getElementById('print-date').checked) {
      const p = document.createElement('p');
      p.className = 'print-date';
      p.textContent = new Date().toLocaleDateString(window.i18n.lang, { day: 'numeric', month: 'long', year: 'numeric' });
      area.appendChild(p);
    }
    const printSvg = document.createElementNS(SVG_NS, 'svg');
    area.appendChild(printSvg);
    drawRoom(printSvg, c, {
      viewRot: +document.getElementById('print-orientation').value,
      nameFormat: document.getElementById('print-name-format').value,
      showPeople: document.getElementById('print-people').checked,
      print: true
    });
    if (document.getElementById('print-unseated').checked) {
      const seated = new Set();
      c.objects.forEach(o => { if (isDesk(o)) o.seats.forEach(s => s && seated.add(s)); });
      const rest = c.students.filter(s => !seated.has(s.id));
      if (rest.length) {
        const p = document.createElement('p');
        p.className = 'unseated';
        p.textContent = `${t('print_unseated')}: ${rest.map(s => s.name).join(', ')}`;
        area.appendChild(p);
      }
    }
    setTimeout(() => window.print(), 50);
  });

  /* ---------- Idioma y apariencia ---------- */

  const langSelect = document.getElementById('lang-select');
  const themeSelect = document.getElementById('theme-select');

  langSelect.value = window.i18n.preference;
  themeSelect.value = window.theme.preference;

  langSelect.addEventListener('change', () => window.i18n.setPreference(langSelect.value));
  themeSelect.addEventListener('change', () => window.theme.setPreference(themeSelect.value));

  // Al cambiar de idioma hay que rehacer también los textos que crea la app
  // (paletas, listas, propiedades y etiquetas del plano).
  window.i18n.onChange(() => {
    buildPalettes();
    renderAll();
  });

  // El plano lleva los colores del tema incrustados en el SVG: se redibuja.
  window.addEventListener('themechange', () => render());

  /* ---------- Arranque ---------- */

  window.i18n.apply();
  buildPalettes();
  renderAll();
  readSharedLink();
  requestAnimationFrame(fitZoom);
  window.addEventListener('resize', () => { if (window.innerWidth > 0) fitZoom(); });
})();
