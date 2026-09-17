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

  // Casi todas las mesas son una rejilla de cols × rows puestos iguales.
  // «sides» dice en qué lado se sienta cada alumno cuando no es el de siempre
  // («cara a cara»). Un grupo que no es un rectángulo, como el de tres, se
  // describe mesa a mesa en «cells»: centro, tamaño y lado, en centímetros de
  // la medida de serie, que se escalan si se cambia el tamaño del conjunto.
  const DESK_TYPES = {
    desk1: { w: 70, h: 50, cols: 1, rows: 1 },
    desk2: { w: 140, h: 50, cols: 2, rows: 1 },
    // Dos mesas unidas por el lado largo, cada alumno a un lado, de cara.
    facing2: { w: 100, h: 70, cols: 2, rows: 1, sides: ['left', 'right'] },
    // Las dos de «cara a cara» más una tercera perpendicular y centrada.
    group3: {
      w: 100, h: 120,
      cells: [
        { x: -25, y: -25, w: 50, h: 70, side: 'left' },
        { x: 25, y: -25, w: 50, h: 70, side: 'right' },
        { x: 0, y: 35, w: 70, h: 50, side: 'bottom' }
      ]
    },
    group4: { w: 140, h: 100, cols: 2, rows: 2 },
    // El grupo de 3 con una cuarta mesa en el lado libre: en cruz.
    group4b: {
      w: 100, h: 170,
      cells: [
        { x: -25, y: 0, w: 50, h: 70, side: 'left' },
        { x: 25, y: 0, w: 50, h: 70, side: 'right' },
        { x: 0, y: -60, w: 70, h: 50, side: 'top' },
        { x: 0, y: 60, w: 70, h: 50, side: 'bottom' }
      ]
    },
    // El grupo de 4 con una quinta mesa perpendicular y centrada en un extremo.
    group5: {
      w: 190, h: 100,
      cells: [
        { x: -60, y: -25, w: 70, h: 50, side: 'top' },
        { x: 10, y: -25, w: 70, h: 50, side: 'top' },
        { x: -60, y: 25, w: 70, h: 50, side: 'bottom' },
        { x: 10, y: 25, w: 70, h: 50, side: 'bottom' },
        { x: 70, y: 0, w: 50, h: 70, side: 'right' }
      ]
    },
    group6: { w: 210, h: 100, cols: 3, rows: 2 },
    // El grupo de 4 con una mesa perpendicular a cada lado (dos cabeceras).
    group6b: {
      w: 240, h: 100,
      cells: [
        { x: -95, y: 0, w: 50, h: 70, side: 'left' },
        { x: -35, y: -25, w: 70, h: 50, side: 'top' },
        { x: 35, y: -25, w: 70, h: 50, side: 'top' },
        { x: -35, y: 25, w: 70, h: 50, side: 'bottom' },
        { x: 35, y: 25, w: 70, h: 50, side: 'bottom' },
        { x: 95, y: 0, w: 50, h: 70, side: 'right' }
      ]
    }
  };

  // Formas distintas para el mismo número de puestos: con el botón derecho
  // se pasa de una a la siguiente.
  const DESK_SHAPES = [['group4', 'group4b'], ['group6', 'group6b']];
  // Mesas de grupo cuyos puestos dan a la pizarra y a la pared del fondo: al
  // montar el aula se ponen de lado para que nadie quede de espaldas.
  const SIDEWAYS_FOR_BOARD = new Set(['group4', 'group5', 'group6', 'group6b']);
  function shapeFamily(type) { return DESK_SHAPES.find(f => f.includes(type)) || null; }
  // Forma preferida de cada familia (se elige en «Formas por defecto…» y
  // vale para todas las clases): es la que usa «Montar el aula para los equipos».
  function defaultShape(type) {
    const family = shapeFamily(type);
    const pref = state.shapes && state.shapes[family ? family[0] : type];
    return family && family.includes(pref) ? pref : type;
  }
  function nextShape(type) {
    const family = DESK_SHAPES.find(f => f.includes(type));
    return family ? family[(family.indexOf(type) + 1) % family.length] : null;
  }
  function sameShapeFamily(a, b) {
    return a === b || DESK_SHAPES.some(f => f.includes(a) && f.includes(b));
  }

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

  /* ---------- Equipos ---------- */

  // Tonos bien separados para distinguir los equipos en el plano; a partir del
  // duodécimo se repiten. Cada equipo lleva además su número, que es lo que
  // se ve en una impresión en blanco y negro.
  const TEAM_HUES = [210, 25, 140, 300, 55, 185, 350, 90, 260, 5, 165, 320];
  function teamHue(n) { return TEAM_HUES[(n - 1) % TEAM_HUES.length]; }
  function teamFill(n) { return `hsl(${teamHue(n)} 70% 88%)`; }
  function teamInk(n) { return `hsl(${teamHue(n)} 55% 40%)`; }

  // Equipos de la clase, ordenados por número, con sus miembros.
  function teamsOf(c) {
    const map = new Map();
    for (const s of c.students) {
      if (!s.team) continue;
      if (!map.has(s.team)) map.set(s.team, []);
      map.get(s.team).push(s);
    }
    return [...map.keys()].sort((a, b) => a - b).map(n => ({ n, members: map.get(n) }));
  }

  function makeObject(type, x, y) {
    const base = DESK_TYPES[type] || FURNITURE_TYPES[type];
    const obj = { id: uid(), type, x, y, w: base.w, h: base.h, rot: 0 };
    if (isDesk(obj)) {
      obj.cols = base.cols || 1;
      obj.rows = base.rows || 1;
      if (base.sides) obj.sides = [...base.sides];
      obj.seats = new Array(base.cells ? base.cells.length : obj.cols * obj.rows).fill(null);
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

  // Durante unas horas el grupo de 3 tuvo otra forma (mesa doble con la
  // tercera en un extremo, 190 × 70): las guardadas así vuelven a la de siempre.
  function migrate(data) {
    for (const c of data.classes) {
      for (const o of c.objects || []) {
        if (o.type === 'group3' && o.w === 190 && o.h === 70) { o.w = 100; o.h = 120; }
      }
    }
    return data;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.classes) && parsed.classes.length) return migrate(parsed);
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
        return word ? `${given} ${word[0].toLocaleUpperCase()}.` : given;
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
    const turn = opts.rotate != null ? opts.rotate : (opts.flip ? 180 : 0);
    if (turn) text.setAttribute('transform', `rotate(${turn} ${x} ${y})`);
    const lh = size * (opts.lineHeight || 1.15);
    lines.forEach((line, i) => {
      const tspan = el('tspan', { x, y: y + (i - (lines.length - 1) / 2) * lh }, text);
      tspan.textContent = line;
    });
    return text;
  }

  // Los puestos de una mesa: su recuadro y el lado por el que se sienta cada
  // alumno. Vale igual para la rejilla de siempre y para los grupos descritos
  // mesa a mesa.
  function deskCells(obj) {
    const def = DESK_TYPES[obj.type];
    if (def && def.cells) {
      const kx = obj.w / def.w, ky = obj.h / def.h;
      return def.cells.map((cell, i) => ({
        x: cell.x * kx - cell.w * kx / 2, y: cell.y * ky - cell.h * ky / 2,
        w: cell.w * kx, h: cell.h * ky, side: cell.side, i, own: true
      }));
    }
    const sw = obj.w / obj.cols, sh = obj.h / obj.rows;
    const cells = [];
    for (let r = 0; r < obj.rows; r++) {
      for (let col = 0; col < obj.cols; col++) {
        cells.push({
          x: -obj.w / 2 + col * sw, y: -obj.h / 2 + r * sh, w: sw, h: sh,
          side: seatSide(obj, r, col, cells.length), r, col, i: cells.length, own: false
        });
      }
    }
    return cells;
  }

  // Lados por los que hay alguien sentado: es lo que ocupa sitio alrededor.
  function deskSides(obj) {
    return new Set(deskCells(obj).map(cell => cell.side));
  }

  function drawDesk(g, obj, c, opts) {
    const cells = deskCells(obj);
    const propia = cells.length && cells[0].own;   // cada mesa con su contorno
    const flip = uprightFix(obj.rot, opts.viewRot) === 180;
    // Los textos se leen siempre desde el punto de vista del plano: se
    // deshace el giro de la mesa en pasos de un cuarto de vuelta, así quedan
    // horizontales o, en una mesa en diagonal, lo más cerca posible sin
    // salirse de los bordes del puesto.
    const turn = normAngle(-Math.round(normAngle(obj.rot + (opts.viewRot || 0)) / 90) * 90);
    const sideways = Math.abs(turn) === 90;
    // La rejilla de siempre es un tablero único con sus divisiones; un grupo
    // descrito mesa a mesa se dibuja con el contorno de cada mesa.
    if (!propia) {
      el('rect', { x: -obj.w / 2, y: -obj.h / 2, width: obj.w, height: obj.h, rx: 3, fill: '#fbf8f2', stroke: '#8a6d3b', 'stroke-width': 1.5 }, g);
    }
    for (const cell of cells) {
      const studentId = obj.seats[cell.i];
      const student = studentId ? c.students.find(s => s.id === studentId) : null;
      // El tablero va antes que el puesto: si no, taparía el blanco de la
      // mesa ocupada.
      if (propia) {
        el('rect', { x: cell.x, y: cell.y, width: cell.w, height: cell.h, rx: 3, fill: '#fbf8f2', stroke: '#8a6d3b', 'stroke-width': 1.5 }, g);
      }
      const seatG = el('g', { 'data-obj': obj.id, 'data-seat': cell.i }, g);
      const team = student && student.team && opts.showTeams ? student.team : 0;
      el('rect', {
        class: 'seat', x: cell.x + 1.5, y: cell.y + 1.5, width: cell.w - 3, height: cell.h - 3, rx: 2,
        fill: team ? teamFill(team) : (student ? '#ffffff' : '#fbf8f2'), stroke: 'none'
      }, seatG);
      if (opts.showPeople) drawFigureAt(seatG, cell, !!student, team ? teamFill(team) : null);
      if (team) {
        // El número del equipo, en la esquina del puesto que queda arriba
        // según se mire el plano.
        const r = 6.5;
        const bx = cell.x + (flip ? cell.w - r - 2.5 : r + 2.5);
        const by = cell.y + (flip ? cell.h - r - 2.5 : r + 2.5);
        el('circle', { cx: bx, cy: by, r, fill: teamInk(team), stroke: 'none' }, seatG);
        addText(seatG, [String(team)], bx, by + 0.3, 9, { rotate: turn, weight: 700, fill: '#fff' });
      }
      // La tipología (A, B o C), en la otra esquina de arriba.
      if (student && student.type && opts.showTypes) {
        const r = 6.5;
        const bx = cell.x + (flip ? r + 2.5 : cell.w - r - 2.5);
        const by = cell.y + (flip ? cell.h - r - 2.5 : r + 2.5);
        el('rect', { x: bx - r, y: by - r, width: 2 * r, height: 2 * r, rx: 2, fill: '#fff', stroke: '#6b6258', 'stroke-width': 1 }, seatG);
        addText(seatG, [student.type], bx, by + 0.3, 9, { rotate: turn, weight: 700, fill: '#23262b' });
      }
      if (!propia) {
        if (cell.col > 0) el('line', { x1: cell.x, y1: cell.y + 4, x2: cell.x, y2: cell.y + cell.h - 4, stroke: '#c9b894', 'stroke-width': 1 }, g);
        if (cell.r > 0 && cell.col === 0) el('line', { x1: -obj.w / 2 + 4, y1: cell.y, x2: obj.w / 2 - 4, y2: cell.y, stroke: '#c9b894', 'stroke-width': 1 }, g);
      }
      if (student) {
        // Girado un cuarto, el ancho disponible es el alto del puesto y al revés.
        const { lines, size } = fitName(formatName(student.name, opts.nameFormat), (sideways ? cell.h : cell.w) - 10, (sideways ? cell.w : cell.h) - 10);
        addText(g, lines, cell.x + cell.w / 2, cell.y + cell.h / 2, size, { rotate: turn, weight: NAME_WEIGHT, lineHeight: NAME_LINE_GAP });
      }
    }
  }


  // Lado de la mesa en el que se sienta cada puesto: una sola fila mira hacia
  // la pizarra (se sienta abajo); con varias filas, la primera arriba, la última
  // abajo y las intermedias a los lados.
  function seatSide(obj, r, col, seatIndex) {
    if (obj.sides && obj.sides[seatIndex]) return obj.sides[seatIndex];
    if (obj.rows === 1 || r === obj.rows - 1) return 'bottom';
    if (r === 0) return 'top';
    if (col === 0) return 'left';
    if (col === obj.cols - 1) return 'right';
    return 'bottom';
  }

  // Figura esquemática vista desde arriba: silla, cuerpo, cabeza y brazos sobre
  // la mesa. Sin nombre asignado solo se dibuja la silla vacía.
  // Coloca la figura en el borde del puesto por el que se sienta.
  function drawFigureAt(parent, cell, seated, tint) {
    const pos = {
      bottom: [cell.x + cell.w / 2, cell.y + cell.h, 0, cell.w],
      top: [cell.x + cell.w / 2, cell.y, 180, cell.w],
      left: [cell.x, cell.y + cell.h / 2, 90, cell.h],
      right: [cell.x + cell.w, cell.y + cell.h / 2, -90, cell.h]
    }[cell.side] || [cell.x + cell.w / 2, cell.y + cell.h, 0, cell.w];
    drawFigure(parent, ...pos, seated, tint);
  }


  // (px, py) es el punto medio del borde de la mesa; la figura queda fuera,
  // mirando hacia la mesa. angle 0 = sentada abajo; 180 = arriba.
  function drawFigure(parent, px, py, angle, edge, seated, tint) {
    const W = Math.min(46, edge * 0.8);
    const k = W / 46;
    const fig = el('g', { class: seated ? 'person seated' : 'person', transform: `translate(${px} ${py}) rotate(${angle}) scale(${k})` }, parent);
    const line = { stroke: '#6b6258', 'stroke-width': 1.4 };
    el('rect', { x: -21, y: 30, width: 42, height: 8, rx: 3, fill: '#e6e0d5', ...line }, fig);
    if (!seated) return fig;
    const body = tint || '#fff';
    el('rect', { x: -21, y: -6, width: 8, height: 26, rx: 4, fill: body, ...line }, fig);
    el('rect', { x: 13, y: -6, width: 8, height: 26, rx: 4, fill: body, ...line }, fig);
    el('ellipse', { cx: 0, cy: 21, rx: 20, ry: 9, fill: body, ...line }, fig);
    el('circle', { cx: 0, cy: 17, r: 9, fill: '#fff', ...line }, fig);
    return fig;
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

  function objTransform(obj) {
    return `translate(${obj.x} ${obj.y}) rotate(${obj.rot})`;
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
        if (opts.showPeople) {
          const fig = drawFigure(g, 0, -h / 2, 180, w, true);
          fig.querySelector('circle').setAttribute('data-teacher-head', '');
        }
        break;
      default:
        el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: obj.type === 'board' ? 1 : 3, ...common }, g);
    }
    const label = labelOf(obj);
    if (label) {
      // El texto corre siempre por el lado más largo: en un elemento más alto
      // que ancho (una ventana en vertical, por ejemplo) se gira 90° en vez de
      // quedarse horizontal y diminuto.
      const upright = h > w;
      const along = upright ? h : w;
      const across = upright ? w : h;
      const thin = across < 25;
      const weight = obj.type === 'text' ? 600 : 'normal';
      const maxSize = obj.type === 'text' ? across * 0.6 : 15;
      const size = Math.max(NAME_MIN_SIZE, Math.min(maxSize, (along - 6) / textWidth(label, weight)));
      const labelInside = !thin || obj.type === 'board';
      addText(g, clipText(label, (along - 6) / size, weight), 0, 0, size, {
        rotate: upright ? (flip ? 90 : -90) : (flip ? 180 : 0),
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
      const g = el('g', { class: 'obj', 'data-id': obj.id, transform: objTransform(obj) }, root);
      if (isDesk(obj)) drawDesk(g, obj, c, opts);
      else drawFurniture(g, obj, opts);
    }

    if (!opts.print && mode === 'room') drawSelection(root, c);
    return root;
  }

  function drawSelection(root, c) {
    const sel = c.objects.filter(o => selection.has(o.id));
    for (const obj of sel) {
      const g = el('g', { transform: objTransform(obj) }, root);
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
    drawRoom(svg, c, { viewRot: 0, nameFormat: c.nameFormat, showPeople: c.showPeople !== false, showTeams: c.showTeams !== false, showTypes: c.showTypes !== false, print: false, viewBox });
    svg.setAttribute('width', (frame ? frame.w : c.room.w + 2 * MARGIN) * zoom);
    svg.setAttribute('height', (frame ? frame.h : c.room.h + 2 * MARGIN) * zoom);
    svg.classList.toggle('students-mode', mode !== 'room');
    renderSeatCount();
    renderProps();
    updateUndoButtons();
  }

  // Cuántos puestos hay en el aula y cuántos están ocupados. Se ve siempre,
  // se esté en la pestaña del aula o en la del alumnado.
  function renderSeatCount() {
    const desks = cls().objects.filter(isDesk);
    const total = desks.reduce((n, o) => n + o.seats.length, 0);
    const taken = desks.reduce((n, o) => n + o.seats.filter(Boolean).length, 0);
    document.getElementById('seat-count').textContent =
      total ? t('seats_summary', { total, taken, free: total - taken }) : '';
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
    document.getElementById('show-teams').checked = c.showTeams !== false;
    document.getElementById('show-types').checked = c.showTypes !== false;
    document.getElementById('team-size').value = c.teamSize || 4;
    document.getElementById('team-kind').value = c.teamKind || 'heterogeneos';
    document.getElementById('team-leftovers').value = c.teamLeftovers || 'agregar';
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
    const seated = new Set();
    c.objects.forEach(o => { if (isDesk(o)) o.seats.forEach(s => s && seated.add(s)); });
    const teams = teamsOf(c);
    const withTypes = (c.teamKind || 'heterogeneos') !== 'esporadicos';
    const sets = (c.incompatible || []).length;
    document.getElementById('students-count').textContent = t('students_list', { assigned: seated.size, total: c.students.length });
    document.getElementById('teams-count').textContent = teams.length ? t('teams_list', { teams: teams.length, total: c.students.length }) : t('teams_list_none');
    document.getElementById('btn-incompat').textContent = sets ? t('teams_incompat_count', { count: sets }) : t('teams_incompat');
    document.getElementById('btn-incompat').title = t('teams_incompat_title');
    document.getElementById('hint-teams').textContent = t(withTypes ? 'hint_teams_types' : 'hint_teams');
    document.getElementById('btn-teams-seat').disabled = !teams.length;
    document.getElementById('btn-teams-clear').disabled = !teams.length;
    document.getElementById('btn-teams-room').disabled = !teams.length;
    const list = document.getElementById('student-list');
    const tl = document.getElementById('team-list');
    list.innerHTML = '';
    tl.innerHTML = '';
    if (!c.students.length) {
      for (const ul of [list, tl]) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = t('students_empty');
        ul.appendChild(li);
      }
      return;
    }
    const rowStart = (s) => {
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
      li.append(handle, mark);
      return li;
    };
    for (const s of c.students) {
      // Pestaña Alumnado: el nombre, editable, y quitarlo de la lista.
      const li = rowStart(s);
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
        c.incompatible = cleanIncompatible(c);
        syncTeamDesks(c);
        commit();
      });
      li.append(input, del);
      list.appendChild(li);

      // Pestaña Equipos: el mismo nombre con su equipo y, si cuenta, su tipología.
      const tr = rowStart(s);
      // El equipo: un desplegable con el color del equipo. Sirve para hacer
      // los equipos a mano desde cero («Nuevo» crea el siguiente) o para
      // cambiar a alguien de equipo después de formarlos.
      const pick = document.createElement('select');
      pick.className = 'team-pick';
      pick.title = t('team_pick_title');
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '–';
      pick.appendChild(none);
      const last = teams.length ? teams[teams.length - 1].n : 0;
      for (let n = 1; n <= last + 1; n++) {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n <= last ? n : t('team_new');
        pick.appendChild(opt);
      }
      pick.value = s.team ? String(s.team) : '';
      if (s.team) { pick.style.background = teamFill(s.team); pick.style.color = teamInk(s.team); }
      pick.addEventListener('change', () => {
        checkpoint();
        s.team = pick.value ? +pick.value : undefined;
        if (!s.team) delete s.team;
        syncTeamDesks(c);
        commit();
      });
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.name;
      name.title = s.name;
      tr.append(pick, name);
      // La tipología solo se pide cuando los equipos la van a tener en cuenta.
      if (withTypes) {
        const types = document.createElement('span');
        types.className = 'type-pick';
        for (const type of ['A', 'B', 'C']) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = type;
          b.title = t('type_' + type);
          if (s.type === type) b.classList.add('on');
          b.addEventListener('click', () => {
            checkpoint();
            if (s.type === type) delete s.type; else s.type = type;
            commit();
          });
          types.appendChild(b);
        }
        tr.appendChild(types);
      }
      tl.appendChild(tr);
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
    disty: '<rect x="3" y="1.5" width="10" height="2.5"/><rect x="3" y="6.8" width="10" height="2.5"/><rect x="3" y="12" width="10" height="2.5"/>',
    // El recuadro es el aula y las flechas, el hueco igual a cada lado: así la
    // dirección de la flecha coincide con lo que dice el rótulo.
    roomx: '<rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none"/><rect x="5.6" y="6" width="4.8" height="4" rx=".6"/>'
      + '<path d="M3.1 8h2.1M10.8 8h2.1M4.2 6.9 3.1 8l1.1 1.1M11.7 6.9 12.8 8l-1.1 1.1" fill="none"/>',
    roomy: '<rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none"/><rect x="6" y="6.1" width="4" height="3.8" rx=".6"/>'
      + '<path d="M8 3.3v2.1M8 10.6v2.1M6.9 4.4 8 3.3l1.1 1.1M6.9 11.6 8 12.7l1.1-1.1" fill="none"/>'
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
    add('roomx', () => centerInRoom('x'), units > 0);
    add('roomy', () => centerInRoom('y'), units > 0);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = t(units > 2 ? 'align_hint' : units > 1 ? 'align_hint_three' : 'align_hint_one');
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
    if (isDesk(obj) && shapeFamily(obj.type)) {
      const lab = document.createElement('label');
      lab.className = 'full';
      const span = document.createElement('span');
      span.textContent = t('prop_shape');
      const select = document.createElement('select');
      for (const type of shapeFamily(obj.type)) {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = t('type_' + type);
        if (type === obj.type) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', update(() => {
        const seats = obj.seats.slice();
        setDeskType(obj, select.value);
        seats.forEach((id, i) => { if (i < obj.seats.length) obj.seats[i] = id; });
      }));
      lab.append(span, select);
      grid.append(lab);
    }
    if (isDesk(obj) && !DESK_TYPES[obj.type].cells) {
      grid.append(
        numberInput(t('prop_cols'), obj.cols, update(v => resizeSeats(obj, clamp(Math.round(+v), 1, 8), obj.rows)), { min: 1, max: 8 }),
        numberInput(t('prop_rows'), obj.rows, update(v => resizeSeats(obj, obj.cols, clamp(Math.round(+v), 1, 8))), { min: 1, max: 8 })
      );
    }
    body.append(title, grid, alignTools(), actions);
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
      // El icono se saca de la misma geometría que la mesa, encogida al hueco.
      const muestra = { type, w: def.w, h: def.h, cols: def.cols || 1, rows: def.rows || 1, sides: def.sides };
      const k = Math.min(22 / def.w, 16 / def.h);
      for (const cell of deskCells(muestra)) {
        el('rect', {
          x: 13 + cell.x * k + .4, y: 10 + cell.y * k + .4,
          width: cell.w * k - .8, height: cell.h * k - .8, rx: .8,
          fill: '#fbf8f2', stroke: '#8a6d3b', 'stroke-width': .8
        }, icon);
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

  // Centra en el aula todo lo seleccionado, moviéndolo en bloque: lo que está
  // junto sigue junto, solo se desplaza el conjunto.
  function centerInRoom(axis) {
    const sel = selectedObjects();
    const units = selectionUnits();
    if (!sel.length) return;
    const room = cls().room;
    const x0 = Math.min(...units.map(u => u.x0)), x1 = Math.max(...units.map(u => u.x1));
    const y0 = Math.min(...units.map(u => u.y0)), y1 = Math.max(...units.map(u => u.y1));
    const dx = axis === 'x' ? room.w / 2 - (x0 + x1) / 2 : 0;
    const dy = axis === 'y' ? room.h / 2 - (y0 + y1) / 2 : 0;
    if (!dx && !dy) return;
    checkpoint();
    sel.forEach(o => { o.x += dx; o.y += dy; });
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
        // Las sillas ocupan sitio por los lados donde de verdad se sienta
        // alguien, que en «cara a cara» o en el grupo de tres no son los de siempre.
        const sides = deskSides(o);
        if (sides.has('bottom')) b += chair;
        if (sides.has('top')) t -= chair;
        if (sides.has('left')) l -= chair;
        if (sides.has('right')) r += chair;
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

  // Una mesa de grupo pasa a ser mesas individuales sueltas, cada una en el
  // sitio de su puesto, con su silla al mismo lado y con quien estuviera
  // sentado. Así el profesor puede recolocarlas como quiera.
  function splitSelection() {
    const c = cls();
    const desks = selectedObjects().filter(o => isDesk(o) && o.seats.length > 1);
    if (!desks.length) return;
    checkpoint();
    const turn = { bottom: 0, top: 180, left: 90, right: -90 };
    const created = [];
    for (const desk of desks) {
      const a = desk.rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      for (const cell of deskCells(desk)) {
        const lx = cell.x + cell.w / 2, ly = cell.y + cell.h / 2;
        const one = makeObject('desk1', Math.round(desk.x + lx * cos - ly * sin), Math.round(desk.y + lx * sin + ly * cos));
        one.rot = desk.rot + (turn[cell.side] || 0);
        one.seats[0] = desk.seats[cell.i] || null;
        created.push(one);
      }
      c.objects.splice(c.objects.indexOf(desk), 1, ...created.splice(0));
      created.length = 0;
    }
    selection.clear();
    commit();
  }

  // Cambia las mesas seleccionadas a la otra forma con los mismos puestos,
  // sin mover a nadie de su número de puesto.
  function changeShapeOfSelection() {
    const desks = selectedObjects().filter(o => isDesk(o) && nextShape(o.type));
    if (!desks.length) return;
    checkpoint();
    for (const desk of desks) {
      const seats = desk.seats.slice();
      setDeskType(desk, nextShape(desk.type));
      seats.forEach((id, i) => { if (i < desk.seats.length) desk.seats[i] = id; });
    }
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
    if (e.button !== 0 || leavingClass) return;
    if (onTeacherHead(e) && tapTeacher()) return;
    const p = clientToSvg(e.clientX, e.clientY);
    const c = cls();

    if (mode !== 'room') {
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

  // Iconos del menú del botón derecho, de trazo, como los de la barra de arriba.
  const MENU_ICONS = {
    duplicate: '<rect x="2.3" y="2.3" width="8" height="8" rx="1.4"/><rect x="5.7" y="5.7" width="8" height="8" rx="1.4"/>',
    group: '<path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/>',
    ungroup: '<path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3"/><path d="M3.6 12.4 12.4 3.6"/>',
    shape: '<rect x="2" y="4.5" width="7" height="7" rx="1"/><path d="M11 2.5h3v3M14 2.5 9.5 7"/>',
    split: '<rect x="1.8" y="2.5" width="5.2" height="4.6" rx="1"/><rect x="9" y="2.5" width="5.2" height="4.6" rx="1"/><rect x="5.4" y="9" width="5.2" height="4.6" rx="1"/>',
    rotate_left: '<path d="M3.4 7A5 5 0 1 1 3.2 9.8"/><path d="M6.6 6.8H3.2V3.4"/>',
    rotate_right: '<path d="M12.6 7A5 5 0 1 0 12.8 9.8"/><path d="M9.4 6.8h3.4V3.4"/>',
    rotate_90: '<rect x="2.4" y="8" width="6.2" height="5.6" rx="1"/><path d="M11.2 13.2a2.6 2.6 0 0 0 2.6-2.6V5.4"/><path d="M11.9 7.1 13.8 5.2l1.9 1.9"/>',
    bring_front: '<rect x="3" y="6" width="10" height="7.5" rx="1"/><path d="M8 4.6V1.8M6.4 3.4 8 1.8l1.6 1.6"/>',
    send_back: '<rect x="3" y="2.5" width="10" height="7.5" rx="1"/><path d="M8 11.4v2.8M6.4 12.6 8 14.2l1.6-1.6"/>',
    free_seat: '<circle cx="8" cy="5.4" r="2.3"/><path d="M4 12.8a4 4 0 0 1 8 0"/><path d="M2.6 13.4 13.4 2.6"/>',
    select_all: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.2" stroke-dasharray="2.4 1.7"/><rect x="6" y="6" width="4" height="4" rx=".6"/>',
    delete: '<path d="M3.2 4.4h9.6M6.4 4.4V2.8h3.2v1.6M4.8 4.4l.7 9h5l.7-9"/>'
  };

  // Devuelve el icono listo para meter en un botón. «solid» es para los de
  // ordenación, que son siluetas rellenas; el resto van de trazo.
  function svgIcon(markup, solid) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', solid ? 'currentColor' : 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', solid ? 1.2 : 1.4);
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = markup;
    return svg;
  }

  function menuButton(item) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = item.danger ? 'danger' : '';
    b.disabled = !!item.disabled;
    if (item.icon) b.appendChild(svgIcon(item.icon, item.solid));
    const label = document.createElement('span');
    label.textContent = item.label;
    b.appendChild(label);
    if (item.keys || item.items) {
      const keys = document.createElement('kbd');
      keys.textContent = item.items ? '▸' : item.keys;
      b.appendChild(keys);
    }
    if (item.action) b.addEventListener('click', () => { hideMenu(); item.action(); });
    return b;
  }

  // Un elemento con «items» abre un submenú al pasar por encima.
  function fillMenu(container, items) {
    for (const item of items) {
      if (item === '-') { container.appendChild(document.createElement('hr')); continue; }
      if (!item.items) { container.appendChild(menuButton(item)); continue; }
      const wrap = document.createElement('div');
      wrap.className = 'has-sub' + (item.disabled ? ' disabled' : '');
      const sub = document.createElement('div');
      sub.className = 'submenu';
      fillMenu(sub, item.items);
      wrap.append(menuButton(item), sub);
      container.appendChild(wrap);
    }
  }

  function showMenu(x, y, items) {
    menu.innerHTML = '';
    fillMenu(menu, items);
    menu.hidden = false;
    // Que no se salga de la ventana, ni el menú ni sus submenús.
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    menu.classList.toggle('flip', menu.getBoundingClientRect().right + 230 > window.innerWidth);
  }


  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const g = e.target.closest('.obj');
    if (mode !== 'room') {
      const seat = e.target.closest('[data-seat]');
      const obj = seat && findObj(seat.dataset.obj);
      const index = seat ? +seat.dataset.seat : -1;
      if (!obj || !obj.seats[index]) { hideMenu(); return; }
      showMenu(e.clientX, e.clientY, [{
        label: t('menu_free_seat'), icon: MENU_ICONS.free_seat,
        action: () => { checkpoint(); obj.seats[index] = null; commit(); }
      }]);
      return;
    }
    if (!g) {
      showMenu(e.clientX, e.clientY, [{
        label: t('menu_select_all'), icon: MENU_ICONS.select_all, keys: 'Ctrl+A', disabled: !cls().objects.length,
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
      { label: t('duplicate'), icon: MENU_ICONS.duplicate, keys: 'Ctrl+D', action: duplicateSelection },
      '-'
    ];
    if (gs.canGroup) items.push({ label: t('group'), icon: MENU_ICONS.group, keys: 'Ctrl+G', action: groupSelection });
    if (gs.canUngroup) items.push({ label: t('ungroup'), icon: MENU_ICONS.ungroup, keys: 'Ctrl+Mayús+G', action: ungroupSelection });
    if (gs.canGroup || gs.canUngroup) items.push('-');
    const units = selectionUnits().length;
    items.push(
      {
        label: t('align_title_menu'), icon: ALIGN_ICONS.left, solid: true, disabled: units < 2,
        items: [
          { label: t('align_left'), icon: ALIGN_ICONS.left, solid: true, action: () => alignSelection('left') },
          { label: t('align_hcenter'), icon: ALIGN_ICONS.hcenter, solid: true, action: () => alignSelection('hcenter') },
          { label: t('align_right'), icon: ALIGN_ICONS.right, solid: true, action: () => alignSelection('right') },
          '-',
          { label: t('align_top'), icon: ALIGN_ICONS.top, solid: true, action: () => alignSelection('top') },
          { label: t('align_vcenter'), icon: ALIGN_ICONS.vcenter, solid: true, action: () => alignSelection('vcenter') },
          { label: t('align_bottom'), icon: ALIGN_ICONS.bottom, solid: true, action: () => alignSelection('bottom') }
        ]
      },
      {
        label: t('menu_distribute'), icon: ALIGN_ICONS.distx, solid: true, disabled: units < 3,
        items: [
          { label: t('align_distx'), icon: ALIGN_ICONS.distx, solid: true, action: () => distributeSelection('x') },
          { label: t('align_disty'), icon: ALIGN_ICONS.disty, solid: true, action: () => distributeSelection('y') }
        ]
      },
      {
        label: t('menu_center_room'), icon: ALIGN_ICONS.roomx, solid: true,
        items: [
          { label: t('align_roomx'), icon: ALIGN_ICONS.roomx, solid: true, action: () => centerInRoom('x') },
          { label: t('align_roomy'), icon: ALIGN_ICONS.roomy, solid: true, action: () => centerInRoom('y') }
        ]
      },
      '-'
    );
    items.push(
      { label: t('rotate_left'), icon: MENU_ICONS.rotate_left, keys: 'Mayús+R', action: () => rotateSelection(-15) },
      { label: t('rotate_right'), icon: MENU_ICONS.rotate_right, keys: 'R', action: () => rotateSelection(15) },
      { label: t('rotate_90'), icon: MENU_ICONS.rotate_90, action: () => rotateSelection(90) },
      '-',
      { label: t('bring_front'), icon: MENU_ICONS.bring_front, action: () => reorderSelection(true) },
      { label: t('send_back'), icon: MENU_ICONS.send_back, action: () => reorderSelection(false) }
    );
    if (sel.some(isDesk)) {
      items.push('-', { label: t('menu_free_desks'), icon: MENU_ICONS.free_seat, disabled: !hasStudents, action: clearSeatsOfSelection });
      if (sel.some(o => isDesk(o) && nextShape(o.type))) {
        items.push({ label: t('menu_change_shape'), icon: MENU_ICONS.shape, action: changeShapeOfSelection });
      }
      if (sel.some(o => isDesk(o) && o.seats.length > 1)) {
        items.push({ label: t('menu_split_desk'), icon: MENU_ICONS.split, action: splitSelection });
      }
    }
    items.push('-', { label: sel.length > 1 ? t('delete_count', { count: sel.length }) : t('delete'), icon: MENU_ICONS.delete, keys: 'Supr', danger: true, action: deleteSelection });
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
  const teamList = document.getElementById('team-list');
  // La lista que recibe a quien se arrastra desde el plano es la de la pestaña abierta.
  const activeList = () => (mode === 'teams' ? teamList : studentList);

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
    if (target.closest('#student-list, #team-list')) return { kind: 'list' };
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
    teamList.classList.remove('drop-target');
    const target = dropTargetAt(e.clientX, e.clientY);
    if (target?.kind === 'seat') target.node.classList.add('drop-hover');
    if (target?.kind === 'list' && d.from) activeList().classList.add('drop-target');
  }

  function endStudentDrag(e) {
    const d = studentDrag;
    studentDrag = null;
    ghost.hidden = true;
    studentList.classList.remove('drop-target');
    teamList.classList.remove('drop-target');
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
      syncTeamsAfterDrag(c, [d.studentId, occupant]);
      commit();
    } else if (target.kind === 'list' && d.from) {
      checkpoint();
      findObj(d.from.obj).seats[d.from.seat] = null;
      syncTeamsAfterDrag(c, [d.studentId]);
      commit();
    } else {
      render();
    }
  }

  for (const list of [studentList, teamList]) {
    list.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.handle');
      if (!handle || e.button !== 0) return;
      startStudentDrag(e, handle.dataset.student, null);
    });
  }

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
  // Formas por defecto: para cada familia con más de una forma, un botón por
  // forma con su icono; la marcada es la que se usa al montar el aula.
  const dlgShapes = document.getElementById('dlg-shapes');
  document.getElementById('btn-shapes').addEventListener('click', () => {
    const box = document.getElementById('shapes-list');
    box.innerHTML = '';
    for (const family of DESK_SHAPES) {
      const row = document.createElement('div');
      row.className = 'shapes-row';
      const h = document.createElement('h3');
      h.textContent = t('type_' + family[0]);
      const opts = document.createElement('div');
      opts.className = 'shapes-options';
      for (const type of family) {
        const b = document.createElement('button');
        b.type = 'button';
        b.classList.toggle('on', defaultShape(family[0]) === type);
        const span = document.createElement('span');
        span.textContent = t('type_' + type);
        b.append(paletteIcon(type), span);
        b.addEventListener('click', () => {
          state.shapes = { ...(state.shapes || {}), [family[0]]: type };
          saveState();
          [...opts.children].forEach(x => x.classList.toggle('on', x === b));
        });
        opts.appendChild(b);
      }
      row.append(h, opts);
      box.appendChild(row);
    }
    dlgShapes.showModal();
  });

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
    // De partida, el aula vacía: copiar el plano de otra clase se elige a mano.
    base.value = '';
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

  // Gira el aula entera un cuarto de vuelta, con todo lo que hay dentro: el
  // ancho y el fondo se intercambian y cada elemento acompaña el giro.
  function rotateRoom(dir) {
    const c = cls();
    const { w: RW, h: RH } = c.room;
    checkpoint();
    for (const o of c.objects) {
      const { x, y } = o;
      if (dir > 0) { o.x = RH - y; o.y = x; }
      else { o.x = y; o.y = RW - x; }
      o.rot = normAngle(o.rot + 90 * dir);
    }
    c.room = { w: RH, h: RW };
    commit();
    fitZoom();
  }

  // Los botones para colocar el plano: girarlo a un lado o al otro.
  const ROOM_TOOLS = [
    ['room_rot_left', 'rotate_left', () => rotateRoom(-1)],
    ['room_rot_right', 'rotate_right', () => rotateRoom(1)]
  ];

  function renderRoomTools() {
    const box = document.getElementById('room-tools');
    box.innerHTML = '';
    for (const [key, icon, action] of ROOM_TOOLS) {
      const b = button('', action, 'icon');
      b.appendChild(svgIcon(MENU_ICONS[icon], false));
      b.title = t(key);
      b.setAttribute('aria-label', b.title);
      box.appendChild(b);
    }
  }

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

  // El «?» de «Mesas (opcional)»: la explicación sale al pasar el ratón o al
  // pulsarlo (en pantallas táctiles no hay ratón que pasar).
  {
    const btn = document.getElementById('btn-desks-help');
    const tip = document.getElementById('desks-tip');
    let pinned = false;
    const show = () => {
      tip.hidden = false;
      // Debajo del botón, nunca encima: si lo tapara, en una pantalla táctil
      // el toque acabaría en el propio rótulo.
      const r = btn.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8)) + 'px';
      tip.style.top = Math.min(r.bottom + 8, window.innerHeight - tip.offsetHeight - 8) + 'px';
    };
    const hide = () => { if (!pinned) tip.hidden = true; };
    btn.addEventListener('mouseenter', show);
    btn.addEventListener('mouseleave', hide);
    btn.addEventListener('focus', show);
    btn.addEventListener('blur', () => { pinned = false; tip.hidden = true; });
    btn.addEventListener('click', () => { pinned = !pinned; if (pinned) show(); else tip.hidden = true; });
    document.addEventListener('pointerdown', (e) => { if (!btn.contains(e.target) && !tip.contains(e.target)) { pinned = false; tip.hidden = true; } });
  }

  /* ---------- Alumnado ---------- */

  // Con texto pegado, el botón de añadir se pone en verde para que se vea
  // que falta pulsarlo.
  document.getElementById('students-paste').addEventListener('input', (e) => {
    document.getElementById('btn-students-add').classList.toggle('primary', !!e.target.value.trim());
  });

  document.getElementById('btn-students-add').addEventListener('click', () => {
    const area = document.getElementById('students-paste');
    const names = area.value.split(/\r?\n/)
      .map(line => line.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!names.length) return;
    checkpoint();
    cls().students.push(...names.map(name => ({ id: uid(), name })));
    area.value = '';
    document.getElementById('btn-students-add').classList.remove('primary');
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

  for (const [id, key] of [['show-people', 'showPeople'], ['show-teams', 'showTeams'], ['show-types', 'showTypes']]) {
    document.getElementById(id).addEventListener('change', (e) => {
      cls()[key] = e.target.checked;
      saveState();
      render();
    });
  }

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
    c.incompatible = [];
    c.objects.forEach(o => { if (isDesk(o)) o.seats = o.seats.map(() => null); delete o.team; });
    commit();
  });

  /* ---------- Equipos: formar, sentar, incompatibles ---------- */

  // Quita de los grupos de incompatibles a quien ya no está en la lista y
  // descarta los grupos que se quedan con una sola persona.
  function cleanIncompatible(c) {
    const ids = new Set(c.students.map(s => s.id));
    return (c.incompatible || []).map(g => g.filter(id => ids.has(id))).filter(g => g.length >= 2);
  }

  for (const [id, key] of [['team-size', 'teamSize'], ['team-kind', 'teamKind'], ['team-leftovers', 'teamLeftovers']]) {
    document.getElementById(id).addEventListener('change', (e) => {
      cls()[key] = key === 'teamSize' ? clamp(Math.round(+e.target.value) || 4, 2, 12) : e.target.value;
      saveState();
      renderSidebar();
    });
  }

  // Los equipos los hace el motor de GeCo, que recibe las listas por
  // tipología (quien no tiene tipología cuenta como B, la mayoría) y las
  // incompatibilidades. Se le pasan los identificadores en vez de los nombres
  // para que dos alumnos que se llamen igual no se confundan.
  function makeTeams() {
    const c = cls();
    if (!c.students.length) return;
    const by = { A: [], B: [], C: [] };
    c.students.forEach(s => by[by[s.type] ? s.type : 'B'].push(s.id));
    const result = window.GecoTeamEngine.generateTeams({
      grupoA: by.A, grupoB: by.B, grupoC: by.C,
      numAlumnos: c.teamSize || 4,
      tipoGrupo: c.teamKind || 'heterogeneos',
      opcionSobrantes: c.teamLeftovers || 'agregar',
      incompatibleGroups: cleanIncompatible(c)
    });
    checkpoint();
    c.students.forEach(s => { delete s.team; });
    result.teams.forEach((team, i) => team.forEach(a => { const s = findStudent(a.nombre); if (s) s.team = i + 1; }));
    const seated = c.objects.some(o => isDesk(o) && o.seats.length) ? seatTeams(c) : null;
    commit();
    if (seated) reportSeating(seated);
  }

  // Centro de cada puesto en coordenadas del aula, con el giro de la mesa.
  function seatPositions(c) {
    const seats = [];
    for (const o of c.objects) {
      if (!isDesk(o)) continue;
      const a = o.rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      for (const cell of deskCells(o)) {
        const lx = cell.x + cell.w / 2, ly = cell.y + cell.h / 2;
        seats.push({ o, i: cell.i, x: o.x + lx * cos - ly * sin, y: o.y + lx * sin + ly * cos });
      }
    }
    return seats;
  }

  // Sienta cada equipo en los puestos libres más juntos que encuentre: se
  // prueba cada puesto como semilla, se cogen los más cercanos a él (los de la
  // misma mesa, antes) y se queda con la semilla que deja el equipo más
  // recogido. Los equipos grandes van primero, que son los que peor caben.
  function seatTeams(c) {
    c.objects.forEach(o => { if (isDesk(o)) o.seats = o.seats.map(() => null); });
    const fixed = syncTeamDesks(c);
    const free = seatPositions(c).filter(p => !p.o.seats[p.i]).sort((p, q) => (p.y - q.y) || (p.x - q.x));
    const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) + (p.o === q.o ? 0 : 40);
    const teams = teamsOf(c).filter(team => !fixed.has(team.n)).sort((a, b) => b.members.length - a.members.length || a.n - b.n);
    const split = [], unseated = [];
    for (const team of teams) {
      const n = team.members.length;
      let best = null;
      for (const seed of free) {
        const near = free.filter(p => p !== seed).map(p => [dist(seed, p), p]).sort((a, b) => a[0] - b[0]).slice(0, n - 1);
        if (near.length < n - 1) continue;
        const radius = near.length ? near[near.length - 1][0] : 0;
        const sum = near.reduce((k, [d]) => k + d, 0);
        if (!best || radius < best.radius - 1e-6 || (Math.abs(radius - best.radius) < 1e-6 && sum < best.sum)) {
          best = { radius, sum, seats: [seed, ...near.map(x => x[1])] };
        }
      }
      if (!best) {
        // No quedan puestos para todo el equipo: se sienta a quien quepa.
        const rest = free.splice(0, n);
        team.members.forEach((s, k) => { if (rest[k]) rest[k].o.seats[rest[k].i] = s.id; else unseated.push(s); });
        continue;
      }
      team.members.forEach((s, k) => { best.seats[k].o.seats[best.seats[k].i] = s.id; });
      best.seats.forEach(p => free.splice(free.indexOf(p), 1));
      if (best.radius > 250) split.push(team.n);
    }
    return { split: split.sort((a, b) => a - b), unseated };
  }

  function reportSeating({ split, unseated }) {
    const msgs = [];
    if (unseated.length) msgs.push(t('random_no_seats', { count: unseated.length }));
    if (split.length) msgs.push(t('teams_split', { list: split.join(', ') }));
    if (msgs.length) alert(msgs.join('\n'));
  }

  document.getElementById('btn-teams-make').addEventListener('click', makeTeams);

  document.getElementById('btn-teams-seat').addEventListener('click', () => {
    const c = cls();
    if (!teamsOf(c).length) return;
    checkpoint();
    const result = seatTeams(c);
    commit();
    reportSeating(result);
  });

  // Mesas para un equipo según cuántos son: hasta seis, una sola mesa de
  // grupo; más, una de seis y otra al lado con el resto.
  function teamDeskTypes(n) {
    const one = k => (k <= 1 ? 'desk1' : k === 2 ? 'facing2' : k === 3 ? 'group3' : k === 4 ? 'group4' : k === 5 ? 'group5' : 'group6');
    const types = [];
    while (n > 6) { types.push('group6'); n -= 6; }
    types.push(one(n));
    return types.map(defaultShape);
  }

  // Hueco que ocupa una mesa con sus sillas, para separar los equipos de verdad.
  function deskFootprint(obj) {
    const sides = deskSides(obj), chair = 40;
    return {
      l: sides.has('left') ? chair : 0, r: sides.has('right') ? chair : 0,
      t: sides.has('top') ? chair : 0, b: sides.has('bottom') ? chair : 0
    };
  }

  // Cambia el tipo de una mesa sin moverla: mismo sitio, mismo giro.
  function setDeskType(obj, type) {
    const base = DESK_TYPES[type];
    obj.type = type;
    obj.w = base.w; obj.h = base.h;
    obj.cols = base.cols || 1; obj.rows = base.rows || 1;
    if (base.sides) obj.sides = [...base.sides]; else delete obj.sides;
    obj.seats = new Array(base.cells ? base.cells.length : obj.cols * obj.rows).fill(null);
  }

  // Las mesas que se montaron para un equipo (obj.team) siguen a su equipo:
  // si entra o sale alguien cambian de tipo (de 6 a 5, de 4 a 3…) y sientan
  // a sus miembros; si el equipo se queda vacío, la mesa desaparece.
  // Devuelve los equipos que han quedado sentados así.
  function syncTeamDesks(c) {
    const done = new Set();
    for (const desk of [...c.objects]) {
      if (!isDesk(desk) || !desk.team) continue;
      const members = c.students.filter(s => s.team === desk.team);
      if (!members.length) { c.objects.splice(c.objects.indexOf(desk), 1); continue; }
      if (members.length > 6 || done.has(desk.team)) continue;
      const type = teamDeskTypes(members.length)[0];
      const before = desk.seats.slice();
      if (!sameShapeFamily(desk.type, type)) setDeskType(desk, type);
      // Quien ya estaba en esta mesa conserva su puesto si sigue existiendo.
      const ids = new Set(members.map(m => m.id));
      const seats = new Array(desk.seats.length).fill(null);
      before.forEach((id, i) => { if (id && ids.has(id) && i < seats.length) seats[i] = id; });
      const rest = members.filter(m => !seats.includes(m.id));
      seats.forEach((id, i) => { if (!id && rest.length) seats[i] = rest.shift().id; });
      desk.seats = seats;
      for (const o of c.objects) {
        if (o !== desk && isDesk(o)) o.seats = o.seats.map(id => (id && ids.has(id) ? null : id));
      }
      done.add(desk.team);
    }
    return done;
  }

  // Tras arrastrar a alguien: quien cae en una mesa de equipo pasa a ese
  // equipo, y quien sale de una hacia la lista o una mesa normal lo deja.
  function syncTeamsAfterDrag(c, ids) {
    for (const id of ids) {
      const s = id && findStudent(id);
      if (!s) continue;
      const desk = seatOf(id);
      if (desk && desk.team) s.team = desk.team;
      else if (s.team && c.objects.some(o => isDesk(o) && o.team === s.team)) delete s.team;
    }
    syncTeamDesks(c);
  }

  // Sustituye las mesas del aula por una por equipo, en rejilla y de cara a
  // la pizarra, dejando el mobiliario donde está. Después sienta a los equipos.
  function buildTeamRoom() {
    const c = cls();
    const teams = teamsOf(c);
    if (!teams.length) return;
    if (!confirm(t('confirm_teams_room'))) return;
    checkpoint();
    c.objects = c.objects.filter(o => !isDesk(o));
    // Zona libre: por debajo de lo que hay pegado a la pared de la pizarra
    // (pizarra, mesa del docente) y con aire hasta las demás paredes.
    const margin = 60;
    let top = 100;
    for (const o of c.objects) {
      if (o.y < c.room.h / 2) top = Math.max(top, boundsOf([o], c).y1 + 90);
    }
    const left = margin, right = c.room.w - margin, bottom = c.room.h - 100;
    // Cada equipo es un conjunto de mesas pegadas en fila.
    const clusters = teams.map(team => {
      const desks = teamDeskTypes(team.members.length).map(type => makeObject(type, 0, 0));
      // Entre dos mesas de un mismo equipo se deja sitio para las sillas
      // que dan a ese lado, para que no se monten unas sobre otras.
      let x = 0, l = 0, r = 0, t = 0, b = 0;
      desks.forEach((d, i) => {
        const f = deskFootprint(d);
        if (i === 0) l = f.l; else x += r + f.l;
        d.x = x + d.w / 2; d.y = 0;
        x += d.w;
        r = f.r; t = Math.max(t, d.h / 2 + f.t); b = Math.max(b, d.h / 2 + f.b);
      });
      // Las mesas de grupo en rejilla (2 × 2, 3 × 2…) se giran un cuarto de
      // vuelta: así los puestos quedan a los lados y nadie da la espalda a la
      // pizarra. Para colocarlas, el hueco que ocupan se mide ya girado.
      const turned = SIDEWAYS_FOR_BOARD.has(desks[0].type);
      const fw = l + x + r, fh = t + b;
      return {
        team, desks, turned,
        w: turned ? fh : fw, h: turned ? fw : fh,
        // Desplazamiento de cada mesa respecto al centro del conjunto, sin girar.
        offsets: desks.map(d => [l + d.x - fw / 2, t - fh / 2])
      };
    });
    // Se van colocando por filas, de izquierda a derecha, y cada fila se
    // centra en el aula. Si no caben con el hueco normal se aprietan y, si
    // ni así, se alarga el aula lo justo y se baja lo que hay pegado a la
    // pared del fondo (la puerta, por ejemplo).
    const availW = right - left;
    const layout = (gapX, gapY) => {
      const rows = [[]];
      let x = 0;
      for (const k of clusters) {
        const row = rows[rows.length - 1];
        if (row.length && x + gapX + k.w > availW) { rows.push([k]); x = k.w; continue; }
        x += (row.length ? gapX : 0) + k.w;
        row.push(k);
      }
      let y = top;
      for (const row of rows) {
        const rowW = row.reduce((n, k) => n + k.w, 0) + (row.length - 1) * gapX;
        const rowH = Math.max(...row.map(k => k.h));
        let cx = left + (availW - rowW) / 2;
        for (const k of row) {
          k.cx = cx + k.w / 2;
          k.cy = y + rowH / 2;
          cx += k.w + gapX;
        }
        y += rowH + gapY;
      }
      return y - gapY;   // hasta dónde llega la última fila
    };
    let end = layout(60, 60);
    if (end > bottom) end = layout(30, 30);
    if (end > bottom) {
      const extra = Math.ceil((end - bottom) / 10) * 10;
      const oldH = c.room.h;
      c.room.h = Math.min(4000, oldH + extra);
      const delta = c.room.h - oldH;
      c.objects.forEach(o => { if (o.y > oldH - 60) o.y += delta; });
    }
    // Cada conjunto se inclina un poco hacia el centro de la pizarra, en
    // abanico, para que todo el equipo la vea bien: hasta 15° en los extremos.
    clusters.forEach(k => {
      const tilt = Math.round(15 * (c.room.w / 2 - k.cx) / (c.room.w / 2));
      const rot = (k.turned ? 90 : 0) + clamp(tilt, -15, 15);
      const a = rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      k.desks.forEach((d, i) => {
        const [ox, oy] = k.offsets[i];
        d.x = Math.round(k.cx + ox * cos - oy * sin);
        d.y = Math.round(k.cy + ox * sin + oy * cos);
        d.rot = rot;
        if (k.desks.length === 1) d.team = k.team.n;
        c.objects.push(d);
      });
    });
    const result = seatTeams(c);
    selection.clear();
    commit();
    fitZoom();
    reportSeating(result);
  }

  document.getElementById('btn-teams-room').addEventListener('click', buildTeamRoom);

  document.getElementById('btn-teams-clear').addEventListener('click', () => {
    const c = cls();
    if (!teamsOf(c).length || !confirm(t('confirm_clear_teams'))) return;
    checkpoint();
    c.students.forEach(s => { delete s.team; });
    c.objects.forEach(o => { delete o.team; });
    commit();
  });

  // Diálogo de incompatibles: arriba, los grupos que ya hay; abajo, la lista
  // para marcar a dos o más y añadirlos como grupo nuevo.
  const dlgIncompat = document.getElementById('dlg-incompat');

  function renderIncompat() {
    const c = cls();
    c.incompatible = cleanIncompatible(c);
    const groups = document.getElementById('incompat-list');
    groups.innerHTML = '';
    if (!c.incompatible.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = t('incompat_empty');
      groups.appendChild(li);
    }
    c.incompatible.forEach((g, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = g.map(id => (findStudent(id) || {}).name).join(' · ');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '×';
      del.title = t('incompat_remove');
      del.addEventListener('click', () => {
        checkpoint();
        c.incompatible.splice(i, 1);
        commit();
        renderIncompat();
      });
      li.append(span, del);
      groups.appendChild(li);
    });
    const list = document.getElementById('incompat-students');
    list.innerHTML = '';
    const addBtn = document.getElementById('btn-incompat-add');
    addBtn.disabled = true;
    for (const s of c.students) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.value = s.id;
      check.addEventListener('change', () => {
        addBtn.disabled = list.querySelectorAll('input:checked').length < 2;
      });
      const span = document.createElement('span');
      span.textContent = s.name;
      label.append(check, span);
      li.appendChild(label);
      list.appendChild(li);
    }
  }

  document.getElementById('btn-incompat').addEventListener('click', () => {
    if (!cls().students.length) { alert(t('students_empty')); return; }
    renderIncompat();
    dlgIncompat.showModal();
  });

  document.getElementById('btn-incompat-add').addEventListener('click', () => {
    const ids = [...document.querySelectorAll('#incompat-students input:checked')].map(i => i.value);
    if (ids.length < 2) return;
    checkpoint();
    const c = cls();
    c.incompatible = [...cleanIncompatible(c), ids];
    commit();
    renderIncompat();
  });

  /* ---------- Un guiño ---------- */

  // Tres toques seguidos en la cabeza del docente y la clase entera se levanta
  // y se va por la puerta. Es solo una broma: no toca el plano, que se vuelve a
  // dibujar tal cual al terminar.
  let teacherTaps = [];
  let leavingClass = false;

  // Se mira por posición y no por el elemento pulsado: al primer toque la mesa
  // queda seleccionada y su tirador de girar tapa justo la cabeza.
  function onTeacherHead(e) {
    return [...svg.querySelectorAll('[data-teacher-head]')].some(head => {
      const r = head.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
  }

  function tapTeacher() {
    const now = Date.now();
    teacherTaps = teacherTaps.filter(t => now - t < 1200);
    teacherTaps.push(now);
    if (teacherTaps.length < 3) return false;
    teacherTaps = [];
    return leaveClass();
  }

  function leaveClass() {
    const c = cls();
    const root = svg.querySelector(':scope > g');
    const people = [...svg.querySelectorAll('.person.seated')].filter(f => !f.querySelector('[data-teacher-head]'));
    if (!root || !people.length) return false;
    leavingClass = true;
    drag = null;

    // Salen por la puerta; si el aula no tiene, por el centro de la pared de abajo.
    const door = c.objects.find(o => o.type === 'door');
    const exit = door ? { x: door.x, y: door.y } : { x: c.room.w / 2, y: c.room.h };
    const toRoot = root.getCTM().inverse();

    // Cada figura pasa a colgar del plano para llevarla hasta la puerta en
    // coordenadas del aula. Conserva su propio transform, así que el grupo que
    // la recoge lleva solo el de su padre; su posición real mide el camino.
    const walkers = people.map(fig => {
      const parent = toRoot.multiply(fig.parentNode.getCTM());
      const at = toRoot.multiply(fig.getCTM());
      return { fig, parent, from: { x: at.e, y: at.f }, dist: Math.hypot(exit.x - at.e, exit.y - at.f) };
    }).sort((a, b) => a.dist - b.dist);

    const gap = Math.min(90, 2200 / walkers.length);
    const walk = 1300;
    walkers.forEach(({ fig, parent: m, from }, i) => {
      // La silla se queda en su sitio: solo se levanta quien estaba sentado.
      const chair = fig.cloneNode(false);
      chair.setAttribute('class', 'person');
      chair.appendChild(fig.firstElementChild);
      fig.parentNode.insertBefore(chair, fig);

      const outer = el('g', {}, root);
      const inner = el('g', { transform: `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})` }, outer);
      inner.appendChild(fig);
      const delay = i * gap;
      outer.style.transition = `transform ${walk}ms cubic-bezier(.5,0,.7,1) ${delay}ms, opacity 350ms ease-in ${delay + walk - 350}ms`;
      outer.getBoundingClientRect();   // fija el punto de partida antes de moverla
      outer.style.transform = `translate(${exit.x - from.x}px, ${exit.y - from.y}px)`;
      outer.style.opacity = '0';
    });

    // Un momento con el aula vacía y todo vuelve a su sitio.
    setTimeout(() => {
      leavingClass = false;
      render();
    }, (walkers.length - 1) * gap + walk + 900);
    return true;
  }

  /* ---------- Modos ---------- */

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.mode;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === tab));
      document.getElementById('panel-room').hidden = mode !== 'room';
      document.getElementById('panel-students').hidden = mode !== 'students';
      document.getElementById('panel-teams').hidden = mode !== 'teams';
      // El tamaño del aula y la colocación del plano solo se tocan en «Aula»;
      // las opciones de vista se ven siempre.
      document.getElementById('room-size').hidden = mode !== 'room';
      if (mode !== 'room') selection.clear();
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
    migrate({ classes });
    for (const c of classes) {
      const studentIds = new Map();
      c.students = (c.students || []).map(s => {
        const id = uid();
        studentIds.set(s.id, id);
        const copy = { id, name: String(s.name || '') };
        if (['A', 'B', 'C'].includes(s.type)) copy.type = s.type;
        if (Number.isInteger(s.team) && s.team > 0) copy.team = s.team;
        return copy;
      });
      c.incompatible = (Array.isArray(c.incompatible) ? c.incompatible : [])
        .map(g => (Array.isArray(g) ? g.map(id => studentIds.get(id)).filter(Boolean) : []))
        .filter(g => g.length >= 2);
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

  // Un archivo exportado desde GeCo trae el alumnado con su tipología, las
  // incompatibilidades y, si se generaron, los equipos. Se vuelca en la clase
  // actual: quien ya está en la lista (mismo nombre) no se repite.
  function gecoData(parsed) {
    const d = parsed && parsed.data ? parsed.data : parsed;
    return d && Array.isArray(d.students) ? d : null;
  }
  function isGecoFile(parsed) { return !!gecoData(parsed); }

  function importGeco(parsed) {
    const d = gecoData(parsed);
    const c = cls();
    const names = d.students.map(s => ({ name: String(s.nombre || s.name || '').trim(), type: s.tipo || s.type })).filter(s => s.name);
    if (!names.length) { alert(t('import_error')); return; }
    if (!confirm(t('import_geco_confirm', { count: names.length, name: c.name }))) return;
    checkpoint();
    const key = n => n.toLowerCase().replace(/\s+/g, ' ').trim();
    const byName = new Map(c.students.map(s => [key(s.name), s]));
    const idOf = name => {
      const found = byName.get(key(name));
      if (found) return found.id;
      const s = { id: uid(), name };
      c.students.push(s);
      byName.set(key(name), s);
      return s.id;
    };
    for (const { name, type } of names) {
      const s = findStudent(idOf(name));
      if (['A', 'B', 'C'].includes(type)) s.type = type; else delete s.type;
    }
    const groups = Array.isArray(d.incompatibleGroups) ? d.incompatibleGroups : [];
    c.incompatible = [...cleanIncompatible(c), ...groups.map(g => (Array.isArray(g) ? g.map(n => idOf(String(n))) : []))].filter(g => g.length >= 2);
    if (Array.isArray(d.teams) && d.teams.length) {
      c.students.forEach(s => { delete s.team; });
      d.teams.forEach((team, i) => team.forEach(a => { const s = findStudent(idOf(String(a.nombre || a.name || ''))); if (s) s.team = i + 1; }));
      if (c.teamKind === 'esporadicos') c.teamKind = 'heterogeneos';
    } else if (names.some(s => ['A', 'B', 'C'].includes(s.type))) {
      c.teamKind = c.teamKind === 'esporadicos' ? 'heterogeneos' : c.teamKind;
    }
    commit();
    alert(t('import_geco_done', { count: names.length }));
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
      const parsed = JSON.parse(await file.text());
      if (isGecoFile(parsed)) { importGeco(parsed); return; }
      const classes = validClasses(parsed);
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
      copy.incompatible = [];
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
    const teamsRow = document.getElementById('print-teams').closest('label');
    teamsRow.hidden = !teamsOf(c).length;
    document.getElementById('print-teams').checked = !teamsRow.hidden;
    document.getElementById('print-paper').value = lastPaper;
    document.getElementById('print-margin').value = lastMargin;
    document.getElementById('dlg-print').showModal();
  });

  // La orientación del papel no se puede cambiar desde una clase CSS: hay que
  // reescribir la regla @page antes de imprimir.
  let lastPaper = 'portrait';   // las aulas suelen ser más largas que anchas
  let lastMargin = 10;
  function setPaper(paper, margin) {
    lastPaper = paper === 'portrait' ? 'portrait' : 'landscape';
    lastMargin = clamp(Math.round(+margin), 0, 30);
    let style = document.getElementById('page-size');
    if (!style) {
      style = document.createElement('style');
      style.id = 'page-size';
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: A4 ${lastPaper}; margin: ${lastMargin}mm; }`;
  }

  // Alto que le queda al plano en la hoja. El título, la fecha y la lista se
  // miden de verdad en vez de estimarlos. Para los márgenes se toma el mayor
  // entre los elegidos y 10 mm, porque el navegador puede imponer los suyos
  // (Chrome usa 10 mm si no acepta los de la página) y, si nos quedamos
  // cortos, el plano se va a una segunda hoja.
  function printHeight(area) {
    const page = lastPaper === 'portrait' ? 297 : 210;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:100mm';
    document.body.appendChild(probe);
    const pxPerMm = probe.getBoundingClientRect().width / 100;
    probe.remove();
    // Se mide el bloque de texto con el ancho que tendrá en el papel.
    const width = (lastPaper === 'portrait' ? 210 : 297) - 2 * Math.max(lastMargin, 10);
    const before = area.style.cssText;
    area.style.cssText = `display:block;position:absolute;left:-9999px;top:0;width:${width}mm`;
    let used = 0;
    area.querySelectorAll('h1, .print-date, .unseated, .print-teams').forEach(el => {
      const st = getComputedStyle(el);
      used += el.getBoundingClientRect().height + parseFloat(st.marginTop) + parseFloat(st.marginBottom);
    });
    area.style.cssText = before;
    // 13 mm es el margen más ancho que suelen imponer los navegadores cuando
    // no aceptan el de la página (media pulgada); con ese suelo, la clase cabe
    // en una hoja aunque el navegador no haga caso de los márgenes pedidos.
    return Math.max(60, page - 2 * Math.max(lastMargin, 13) - used / pxPerMm - 2);
  }

  document.getElementById('dlg-print').addEventListener('close', (e) => {
    if (e.target.returnValue !== 'ok') return;
    setPaper(document.getElementById('print-paper').value, document.getElementById('print-margin').value);
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
    // En papel el plano se ciñe al contorno del aula, no al aire que se deja en
    // pantalla. Si algo sobresale de las paredes (una silla pegada a la pared,
    // el barrido de la puerta), el encuadre crece solo lo justo para que no se
    // corte: el espacio vacío no cuenta.
    const pad = 5;
    // Se imprime tal como se ve el plano: mismas opciones de vista.
    const showPeople = c.showPeople !== false;
    const b = boundsOf(c.objects, { showPeople }, 0);
    const x0 = Math.min(0, b.x0) - pad, y0 = Math.min(0, b.y0) - pad;
    const x1 = Math.max(c.room.w, b.x1) + pad, y1 = Math.max(c.room.h, b.y1) + pad;
    drawRoom(printSvg, c, {
      viewRot: 0,   // el plano se imprime tal como se ve en pantalla
      nameFormat: c.nameFormat,
      showPeople,
      showTeams: c.showTeams !== false,
      showTypes: c.showTypes !== false,
      viewBox: [x0, y0, x1 - x0, y1 - y0],
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
    if (document.getElementById('print-teams').checked) {
      const teams = teamsOf(c);
      if (teams.length) {
        const ul = document.createElement('ul');
        ul.className = 'print-teams';
        for (const team of teams) {
          const li = document.createElement('li');
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.style.background = teamInk(team.n);
          dot.textContent = team.n;
          li.append(dot, document.createTextNode(team.members.map(s => s.name).join(', ')));
          ul.appendChild(li);
        }
        area.appendChild(ul);
      }
    }
    printSvg.style.maxHeight = printHeight(area) + 'mm';
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
    renderRoomTools();
    renderAll();
  });

  // El plano lleva los colores del tema incrustados en el SVG: se redibuja.
  window.addEventListener('themechange', () => render());

  /* ---------- Arranque ---------- */

  window.i18n.apply();
  buildPalettes();
  renderRoomTools();
  renderAll();
  readSharedLink();
  requestAnimationFrame(fitZoom);
  window.addEventListener('resize', () => { if (window.innerWidth > 0) fitZoom(); });
})();
