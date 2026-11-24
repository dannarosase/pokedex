/* =========================================================
   Pokédex PWA — lógica principal
   Flujo: leerQR → validarQR → buscarPokemon → guardarPokemon
          → renderizarPokedex / actualizarProgreso → mostrarToast
   ========================================================= */

const TOTAL = 151;
const STORAGE_KEY = 'pokemonCapturados';
const API_URL = 'https://pokeapi.co/api/v2/pokemon/';

// ---------- Estado ----------
let pokemonCapturados = cargarColeccion();
let filtroActual = 'todos';
let lectorQR = null;
let escanerAbierto = false;
let procesandoQR = false;
let ultimoInvalido = { texto: '', hora: 0 };
let pendiente = null;          // Pokémon consultado, esperando confirmación
let temporizadorToast = null;
let temporizadorAyuda = null;
let eventoInstalacion = null;

// ---------- Utilidades ----------
const $ = (id) => document.getElementById(id);

function esc(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function capitalizar(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
function formatoId(id) { return '#' + String(id).padStart(3, '0'); }
function limpiarNombre(t) { return capitalizar(String(t).replace(/-/g, ' ')); }

const TIPOS = {
  normal:   { color: 'bg-stone-400 text-white',  emoji: '⚪' },
  fire:     { color: 'bg-orange-500 text-white', emoji: '🔥' },
  water:    { color: 'bg-blue-500 text-white',   emoji: '💧' },
  electric: { color: 'bg-yellow-400 text-slate-900', emoji: '⚡' },
  grass:    { color: 'bg-green-500 text-white',  emoji: '🌿' },
  ice:      { color: 'bg-cyan-400 text-slate-900', emoji: '❄️' },
  fighting: { color: 'bg-red-700 text-white',    emoji: '🥊' },
  poison:   { color: 'bg-purple-500 text-white', emoji: '☠️' },
  ground:   { color: 'bg-amber-600 text-white',  emoji: '⛰️' },
  flying:   { color: 'bg-indigo-400 text-white', emoji: '🪽' },
  psychic:  { color: 'bg-pink-500 text-white',   emoji: '🔮' },
  bug:      { color: 'bg-lime-500 text-slate-900', emoji: '🐛' },
  rock:     { color: 'bg-yellow-700 text-white', emoji: '🪨' },
  ghost:    { color: 'bg-violet-700 text-white', emoji: '👻' },
  dragon:   { color: 'bg-indigo-600 text-white', emoji: '🐉' },
  dark:     { color: 'bg-slate-700 text-white',  emoji: '🌑' },
  steel:    { color: 'bg-slate-400 text-slate-900', emoji: '⚙️' },
  fairy:    { color: 'bg-pink-300 text-slate-900', emoji: '✨' }
};
function claseTipo(t) { return (TIPOS[t] || { color: 'bg-slate-500 text-white' }).color; }
function emojiTipo(t) { return (TIPOS[t] || { emoji: '❔' }).emoji; }

const STATS = [
  { clave: 'hp',              etiqueta: 'HP',        color: 'bg-green-500' },
  { clave: 'attack',          etiqueta: 'Ataque',    color: 'bg-red-500' },
  { clave: 'defense',         etiqueta: 'Defensa',   color: 'bg-blue-500' },
  { clave: 'special-attack',  etiqueta: 'At. esp.',  color: 'bg-orange-500' },
  { clave: 'special-defense', etiqueta: 'Def. esp.', color: 'bg-cyan-500' },
  { clave: 'speed',           etiqueta: 'Veloc.',    color: 'bg-yellow-400' }
];

// =========================================================
// localStorage
// =========================================================
function cargarColeccion() {
  try {
    const datos = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(datos)) return [];            // vacío o dañado → []
    const vistos = new Set();
    return datos.filter((p) => {
      const ok = p && Number.isInteger(p.id) && p.id >= 1 && p.id <= TOTAL && !vistos.has(p.id);
      if (ok) vistos.add(p.id);
      return ok;
    });
  } catch (_) {
    return [];
  }
}

function persistirColeccion() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pokemonCapturados));
    return true;
  } catch (_) {
    return false;                                    // cuota llena o almacenamiento bloqueado
  }
}

function obtenerCapturado(id) { return pokemonCapturados.find((p) => p.id === id); }
function yaCapturado(id) { return Boolean(obtenerCapturado(id)); }

function guardarPokemon(pokemon) {
  if (yaCapturado(pokemon.id)) return false;         // nunca duplicar
  pokemonCapturados.push({ ...pokemon, capturedAt: new Date().toISOString() });
  pokemonCapturados.sort((a, b) => a.id - b.id);
  if (!persistirColeccion()) {
    pokemonCapturados = pokemonCapturados.filter((p) => p.id !== pokemon.id);
    throw new Error('storage');
  }
  return true;
}

// =========================================================
// Toast
// =========================================================
function mostrarToast(mensaje) {
  const t = $('toast');
  t.textContent = mensaje;
  t.classList.remove('-translate-y-32');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.add('-translate-y-32'), 2800);
}

// =========================================================
// Navegación
// =========================================================
const titulos = { pokedex: 'MI POKÉDEX', progreso: 'PROGRESO', acerca: 'ACERCA DE' };

function mostrarVista(nombre) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.add('hidden'));
  $('vista-' + nombre).classList.remove('hidden');
  $('titulo').textContent = titulos[nombre];
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const activo = b.dataset.nav === nombre;
    b.classList.toggle('text-yellow-300', activo);
    b.classList.toggle('text-slate-300', !activo);
  });
  $('fab').classList.toggle('hidden', nombre === 'acerca');
  document.querySelector('main').scrollTo({ top: 0 });
  if (nombre === 'progreso') actualizarProgreso();
}

// =========================================================
// Render: Pokédex
// =========================================================
function tarjetaCapturado(p) {
  const tipos = (p.types || []).map((t) =>
    `<span class="rounded-full px-2 py-0.5 text-[10px] font-bold ${claseTipo(t)}">${emojiTipo(t)} ${esc(t)}</span>`
  ).join('');
  return `
    <button data-detalle="${p.id}" class="rounded-lg border-2 border-dex-ink/30 bg-white p-3 text-left shadow active:scale-95">
      <p class="text-xs font-bold text-slate-500">${formatoId(p.id)}</p>
      <img class="mx-auto h-24 w-24 object-contain" crossorigin="anonymous" loading="lazy" alt="${esc(p.name)}" src="${esc(p.image || '')}" onerror="this.style.visibility='hidden'" />
      <p class="font-bold capitalize text-dex-ink">${esc(p.name)}</p>
      <div class="mt-1 flex flex-wrap gap-1">${tipos}</div>
    </button>`;
}

function tarjetaBloqueada(id) {
  return `
    <div class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-dex-ink/40 bg-slate-300/70 p-3 text-center">
      <p class="self-start text-xs font-bold text-slate-500">${formatoId(id)}</p>
      <div class="my-2 flex h-20 w-20 items-center justify-center rounded-full bg-slate-400 text-4xl font-black text-white">?</div>
      <p class="text-xs font-semibold text-slate-600">Pokémon no descubierto</p>
    </div>`;
}

function renderizarPokedex() {
  const total = pokemonCapturados.length;
  $('contador').textContent = `${total} / ${TOTAL} Pokémon`;

  // Estado vacío
  $('estado-vacio').classList.toggle('hidden', total !== 0);

  // Filtros activos
  document.querySelectorAll('.filtro-btn').forEach((b) => {
    const activo = b.dataset.filtro === filtroActual;
    b.classList.toggle('bg-dex-ink', activo);
    b.classList.toggle('text-white', activo);
    b.classList.toggle('bg-white', !activo);
    b.classList.toggle('text-dex-ink', !activo);
  });

  // Contenido
  let html = '';
  let mostrados = 0;
  for (let id = 1; id <= TOTAL; id++) {
    const p = obtenerCapturado(id);
    if (p && filtroActual !== 'faltantes') { html += tarjetaCapturado(p); mostrados++; }
    else if (!p && filtroActual !== 'capturados') { html += tarjetaBloqueada(id); mostrados++; }
  }
  $('grid').innerHTML = html;

  // Filtro sin resultados (ej. "Capturados" con colección vacía, o "Faltantes" al completar los 151)
  const vacioFiltro = mostrados === 0;
  $('estado-filtro-vacio').classList.toggle('hidden', !vacioFiltro);
  if (vacioFiltro) {
    $('texto-filtro-vacio').textContent = filtroActual === 'faltantes'
      ? '¡Los tienes todos! 🏆' : 'Aún no has capturado ninguno';
  }
}

// =========================================================
// Render: Progreso
// =========================================================
function actualizarProgreso() {
  const n = pokemonCapturados.length;
  const pct = (n / TOTAL) * 100;
  const pctTexto = (Number.isInteger(pct) ? pct.toString() : pct.toFixed(1)) + ' %';
  $('prog-cantidad').textContent = n;
  $('prog-porcentaje').textContent = pctTexto;
  $('prog-barra').style.width = pct + '%';

  const ultimo = [...pokemonCapturados].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt))[0];
  const cajaUltimo = $('prog-ultimo');
  if (ultimo) {
    cajaUltimo.classList.remove('hidden');
    cajaUltimo.innerHTML = `Último capturado: <b class="capitalize">${esc(ultimo.name)}</b> ${formatoId(ultimo.id)}`;
  } else {
    cajaUltimo.classList.add('hidden');
  }
  $('prog-mensaje').textContent = n === 0
    ? 'Escanea tu primer código QR para empezar.'
    : n === TOTAL ? '¡Completaste la Pokédex! 🏆' : `Te faltan ${TOTAL - n} Pokémon por descubrir.`;
}

function actualizarInterfaz() {
  renderizarPokedex();
  actualizarProgreso();
}

// =========================================================
// Bottom Sheet
// =========================================================
function abrirSheet(html) {
  $('sheet-contenido').innerHTML = html;
  $('sheet-fondo').classList.remove('hidden');
  $('sheet').classList.remove('translate-y-full');
  $('sheet').scrollTop = 0;
}
function cerrarSheet() {
  $('sheet-fondo').classList.add('hidden');
  $('sheet').classList.add('translate-y-full');
  pendiente = null;
}

function sheetCargando() {
  return `
    <div class="py-10 text-center">
      <div class="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-4 border-dex-ink/20 border-t-dex-red"></div>
      <p class="font-bold">Consultando Pokédex...</p>
    </div>`;
}

function sheetError(mensaje) {
  return `
    <div class="py-6 text-center">
      <p class="text-4xl">⚠️</p>
      <p class="mt-2 font-bold">${esc(mensaje)}</p>
      <div class="mt-4 flex gap-2">
        <button data-accion="cerrar" class="flex-1 rounded-full bg-white px-4 py-3 font-bold shadow active:scale-95">Cerrar</button>
        <button data-accion="reintentar" class="flex-1 rounded-full bg-blue-600 px-4 py-3 font-bold text-white shadow active:scale-95">Reintentar</button>
      </div>
    </div>`;
}

function sheetDetalle(p, modoCaptura) {
  const tipos = (p.types || []).map((t) =>
    `<span class="mr-1 mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-bold ${claseTipo(t)}">${emojiTipo(t)} ${esc(t)}</span>`
  ).join('');

  const stats = STATS.map((s) => {
    const valor = (p.stats && p.stats[s.clave]) || 0;
    const ancho = Math.min(100, Math.round((valor / 160) * 100));
    return `
      <div class="flex items-center gap-2">
        <span class="w-16">${s.etiqueta}</span>
        <div class="h-2 flex-1 rounded bg-slate-200"><div class="h-2 rounded ${s.color}" style="width:${ancho}%"></div></div>
        <span class="w-7 text-right">${valor}</span>
      </div>`;
  }).join('');

  const habilidades = (p.abilities || []).map(limpiarNombre).join(', ') || '—';
  const altura = p.height != null ? `${p.height} m` : '—';
  const peso = p.weight != null ? `${p.weight} kg` : '—';

  const botones = modoCaptura ? `
    <div class="mt-4 flex gap-2">
      <button data-accion="cerrar" class="flex-1 rounded-full bg-white px-4 py-3 font-bold shadow active:scale-95">Cancelar</button>
      <button data-accion="capturar" class="flex-1 rounded-full bg-dex-red px-4 py-3 font-extrabold text-white shadow active:scale-95">¡Capturar!</button>
    </div>` : '';

  return `
    <div class="flex items-start justify-between">
      <div>
        <p class="text-sm font-bold text-slate-500">${formatoId(p.id)}</p>
        <h2 class="text-2xl font-black capitalize">${esc(p.name)}</h2>
        <div>${tipos}</div>
      </div>
      <button data-accion="cerrar" aria-label="Cerrar" class="h-10 w-10 rounded-full bg-white text-lg font-bold shadow">✕</button>
    </div>
    ${modoCaptura ? '<p class="mt-2 rounded-lg bg-yellow-300 px-3 py-1 text-center text-xs font-extrabold">¡Pokémon encontrado! ¿Quieres capturarlo?</p>' : ''}
    <img class="mx-auto my-2 h-44 w-44 object-contain" crossorigin="anonymous" alt="${esc(p.name)}" src="${esc(p.image || '')}" onerror="this.style.visibility='hidden'" />
    <div class="grid grid-cols-2 gap-2 text-center text-sm">
      <div class="rounded-lg bg-white p-2 shadow"><p class="text-xs text-slate-500">Altura</p><p class="font-bold">${altura}</p></div>
      <div class="rounded-lg bg-white p-2 shadow"><p class="text-xs text-slate-500">Peso</p><p class="font-bold">${peso}</p></div>
    </div>
    <div class="mt-2 rounded-lg bg-white p-3 text-sm shadow">
      <p class="text-xs text-slate-500">Habilidades</p>
      <p class="font-bold">${esc(habilidades)}</p>
    </div>
    <div class="mt-2 space-y-2 rounded-lg bg-white p-3 text-xs shadow">
      <p class="text-xs text-slate-500">Estadísticas</p>
      ${stats}
    </div>
    ${botones}`;
}

function abrirDetalle(id) {
  const p = obtenerCapturado(id);
  if (!p) return;
  pendiente = null;
  abrirSheet(sheetDetalle(p, false));
}

// =========================================================
// PokéAPI
// =========================================================
async function buscarPokemon(id) {
  if (!navigator.onLine) throw new Error('offline');

  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 10000);
  try {
    const res = await fetch(API_URL + id, { signal: control.signal });
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();

    const stats = {};
    (d.stats || []).forEach((s) => { stats[s.stat.name] = s.base_stat; });

    return {
      id: d.id,
      name: d.name,
      image: (d.sprites && d.sprites.other && d.sprites.other['official-artwork'] && d.sprites.other['official-artwork'].front_default)
        || (d.sprites && d.sprites.front_default) || '',
      types: (d.types || []).map((t) => t.type.name),
      height: d.height / 10,       // decímetros → metros
      weight: d.weight / 10,       // hectogramos → kg
      abilities: (d.abilities || []).map((a) => a.ability.name),
      stats
    };
  } finally {
    clearTimeout(limite);
  }
}

// =========================================================
// Lectura y validación de QR
// =========================================================
function validarQR(texto) {
  const limpio = String(texto || '').trim();
  const m = /^pokemon:(\d+)$/i.exec(limpio);
  if (!m) return { ok: false, motivo: 'formato' };
  const id = parseInt(m[1], 10);
  if (id < 1 || id > TOTAL) return { ok: false, motivo: 'rango' };
  return { ok: true, id };
}

function mostrarErrorLector(mensaje) {
  $('lector-error-texto').textContent = mensaje;
  $('lector-error').classList.remove('hidden');
  $('lector-estado').classList.add('hidden');
  $('linea-escaner').classList.add('hidden');
}
function ocultarErrorLector() {
  $('lector-error').classList.add('hidden');
  $('lector-estado').classList.remove('hidden');
  $('linea-escaner').classList.remove('hidden');
}

async function leerQR() {
  ocultarErrorLector();
  $('lector-estado').textContent = 'Apunta la cámara al código QR de un Pokémon.';

  if (typeof Html5Qrcode === 'undefined') {
    mostrarErrorLector('No se pudo cargar el lector QR. Conéctate a Internet una vez y vuelve a intentarlo.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarErrorLector('Este navegador no permite usar la cámara (se requiere HTTPS).');
    return;
  }

  const lector = new Html5Qrcode('lector', {
    formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    verbose: false
  });
  lectorQR = lector;

  const config = {
    fps: 10,
    aspectRatio: 1,
    qrbox: (w, h) => { const l = Math.floor(Math.min(w, h) * 0.8); return { width: l, height: l }; }
  };
  const alLeer = (texto) => procesarCodigo(texto);

  try {
    try {
      await lector.start({ facingMode: 'environment' }, config, alLeer, () => {});
    } catch (e1) {
      if (e1 && e1.name === 'NotAllowedError') throw e1;           // permiso denegado: no reintentar
      const camaras = await Html5Qrcode.getCameras();
      if (!camaras.length) throw e1;
      await lector.start(camaras[camaras.length - 1].id, config, alLeer, () => {});
    }

    // Si el usuario cerró el escáner mientras arrancaba, apaga la cámara
    if (lectorQR !== lector) { try { await lector.stop(); } catch (_) {} return; }

    clearTimeout(temporizadorAyuda);
    temporizadorAyuda = setTimeout(() => {
      $('lector-estado').textContent = '¿Código ilegible? Acércalo, mejora la iluminación y evita reflejos.';
    }, 20000);
  } catch (err) {
    if (lectorQR === lector) lectorQR = null;
    const nombre = (err && err.name) || '';
    const texto = String(err && (err.message || err));
    if (nombre === 'NotAllowedError' || /permission|denied|allowed/i.test(texto)) {
      mostrarErrorLector('Permiso de cámara rechazado. Actívalo en los ajustes del navegador y presiona Reintentar.');
    } else if (nombre === 'NotFoundError' || /requested device not found|no camera/i.test(texto)) {
      mostrarErrorLector('No se encontró ninguna cámara en este dispositivo.');
    } else {
      console.error('Error del lector QR:', err);
      mostrarErrorLector('No se pudo iniciar la cámara. Inténtalo de nuevo.');
    }
  }
}
async function detenerLector() {
  clearTimeout(temporizadorAyuda);
  const lector = lectorQR;
  lectorQR = null;
  if (!lector) return;
  try { if (lector.isScanning) await lector.stop(); } catch (_) {}
  try { lector.clear(); } catch (_) {}
}

function abrirEscaner() {
  if (escanerAbierto) return;
  escanerAbierto = true;
  procesandoQR = false;
  const e = $('escaner');
  e.classList.remove('hidden');
  e.classList.add('flex');
  $('qr-manual').value = '';
  leerQR();
}

async function cerrarEscaner() {
  escanerAbierto = false;
  const e = $('escaner');
  e.classList.add('hidden');
  e.classList.remove('flex');
  await detenerLector();
}

// Recibe el texto del QR (cámara o entrada manual)
async function procesarCodigo(texto) {
  if (procesandoQR) return;

  const r = validarQR(texto);

  if (!r.ok) {
    // Evita repetir el mismo aviso mientras el QR inválido sigue frente a la cámara
    const ahora = Date.now();
    if (texto === ultimoInvalido.texto && ahora - ultimoInvalido.hora < 3000) return;
    ultimoInvalido = { texto, hora: ahora };
    mostrarToast(r.motivo === 'rango'
      ? 'Ese Pokémon no es de la primera generación (1–151).'
      : 'Este código QR no pertenece a la Pokédex.');
    return;
  }

  procesandoQR = true;
  await cerrarEscaner();

  // ¿Ya está capturado?
  const existente = obtenerCapturado(r.id);
  if (existente) {
    mostrarToast(`${capitalizar(existente.name)} ya se encuentra registrado en tu Pokédex.`);
    procesandoQR = false;
    return;
  }

  await consultarYConfirmar(r.id);
  procesandoQR = false;
}

async function consultarYConfirmar(id) {
  abrirSheet(sheetCargando());
  try {
    const pokemon = await buscarPokemon(id);
    pendiente = pokemon;
    $('sheet-contenido').innerHTML = sheetDetalle(pokemon, true);
  } catch (err) {
    pendiente = { reintentarId: id };
    const sinRed = !navigator.onLine || (err && err.message === 'offline');
    $('sheet-contenido').innerHTML = sheetError(
      sinRed ? 'Sin conexión a Internet. Conéctate para capturar nuevos Pokémon.'
             : 'No fue posible consultar la información del Pokémon.'
    );
    mostrarToast('No fue posible consultar la información del Pokémon.');
  }
}

function confirmarCaptura() {
  if (!pendiente || !pendiente.id) return;
  const pokemon = pendiente;

  try {
    const guardado = guardarPokemon(pokemon);
    if (!guardado) {
      cerrarSheet();
      mostrarToast('Este Pokémon ya había sido capturado.');
      return;
    }
  } catch (_) {
    mostrarToast('No se pudo guardar en el dispositivo (almacenamiento lleno o bloqueado).');
    return;
  }

  cerrarSheet();
  filtroActual = 'todos';
  actualizarInterfaz();
  mostrarToast(`¡${capitalizar(pokemon.name)} fue agregado a tu Pokédex! ${emojiTipo(pokemon.types[0])}`);

  // Animación de la tarjeta nueva
  const tarjeta = document.querySelector(`[data-detalle="${pokemon.id}"]`);
  if (tarjeta) {
    tarjeta.classList.add('carta-nueva');
    tarjeta.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

// =========================================================
// Conexión, instalación y Service Worker
// =========================================================
function actualizarConexion() {
  const online = navigator.onLine;
  $('banner-offline').classList.toggle('hidden', online);
  $('luz-estado').classList.toggle('bg-green-400', online);
  $('luz-estado').classList.toggle('bg-slate-500', !online);
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((e) => {
      console.warn('No se pudo registrar el Service Worker:', e);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalacion = e;
  $('btn-instalar').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  eventoInstalacion = null;
  $('btn-instalar').classList.add('hidden');
  mostrarToast('¡Pokédex instalada! 🎉');
});

// =========================================================
// Eventos
// =========================================================
function iniciarEventos() {
  document.querySelectorAll('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => mostrarVista(b.dataset.nav)));

  document.querySelectorAll('.filtro-btn').forEach((b) =>
    b.addEventListener('click', () => { filtroActual = b.dataset.filtro; renderizarPokedex(); }));

  // Delegación: tarjetas del grid
  $('grid').addEventListener('click', (e) => {
    const t = e.target.closest('[data-detalle]');
    if (t) abrirDetalle(parseInt(t.dataset.detalle, 10));
  });

  // Delegación: botones dentro del sheet
  $('sheet').addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'cerrar') cerrarSheet();
    else if (accion === 'capturar') confirmarCaptura();
    else if (accion === 'reintentar') {
      const id = pendiente && pendiente.reintentarId;
      if (id) consultarYConfirmar(id); else cerrarSheet();
    }
  });
  $('sheet-fondo').addEventListener('click', cerrarSheet);

  $('fab').addEventListener('click', abrirEscaner);
  $('escaner-cerrar').addEventListener('click', cerrarEscaner);
  $('lector-reintentar').addEventListener('click', async () => { await detenerLector(); leerQR(); });

  const enviarManual = () => {
    const v = $('qr-manual').value;
    if (!v.trim()) { mostrarToast('Escribe el contenido del QR, por ejemplo pokemon:25'); return; }
    procesarCodigo(v);
  };
  $('qr-manual-btn').addEventListener('click', enviarManual);
  $('qr-manual').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarManual(); });

  $('btn-instalar').addEventListener('click', async () => {
    if (!eventoInstalacion) return;
    eventoInstalacion.prompt();
    await eventoInstalacion.userChoice;
    eventoInstalacion = null;
    $('btn-instalar').classList.add('hidden');
  });

  window.addEventListener('online', actualizarConexion);
  window.addEventListener('offline', actualizarConexion);
}

// =========================================================
// Inicio
// =========================================================
function iniciar() {
  iniciarEventos();
  actualizarConexion();
  actualizarInterfaz();
  mostrarVista('pokedex');
  if (window.lucide) lucide.createIcons();
  registrarServiceWorker();
}

iniciar();
