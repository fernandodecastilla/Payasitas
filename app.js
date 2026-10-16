'use strict';

/* =====================================================================
   PAYASITAS · Control de minutos
   App para seguir minutos jugados, compañeras y parciales por quinteto.
   ===================================================================== */

const PLAYERS = [
  "MOSKITA", "NÚÑEZ", "MANJÓN", "ELENA", "NATALIA", "MERCEDES",
  "PAOLA", "JULIA", "SOFÍA", "LUCÍA", "ROCÍO", "ANA",
  "PAULA", "YUMARA", "EXTRA 1", "EXTRA 2", "EXTRA 3", "EXTRA 4"
];
const COURT_SIZE = 5;
const LS_CURRENT = 'payasitas:current:v1';
const LS_MATCHES = 'payasitas:matches:v1';

const $ = (s) => document.querySelector(s);

/* ---------------------------------------------------------------------
   Estado
   - segments: tramos ya cerrados de alineación constante { lineup, ms }
   - goals: cada gol con el quinteto que estaba en pista { team, ms, lineup }
   El tramo "abierto" (quinteto actual) se calcula al vuelo con openSegment().
--------------------------------------------------------------------- */
function defaultState() {
  const ids = PLAYERS.map((_, i) => i);
  return {
    onCourt: ids.slice(0, COURT_SIZE),
    bench: ids.slice(COURT_SIZE),
    elapsedMs: 0,      // tiempo jugado consolidado
    running: false,
    lastResume: 0,     // Date.now() del último arranque
    matchStarted: false,
    matchEnded: false,
    segStart: 0,       // elapsed en el que empezó el quinteto actual
    segments: [],
    goals: [],
    startedAt: null
  };
}

let state = loadCurrent() || defaultState();
let selected = null;           // ficha seleccionada (para intercambiar tocando)
let currentTab = 'partido';
let filter = {};               // id -> 'inc' | 'exc'
let analysisDataset = 'live';  // 'live' o id de partido del historial

/* ---------------------- Tiempo ---------------------- */
function nowElapsed() {
  return state.running ? state.elapsedMs + (Date.now() - state.lastResume) : state.elapsedMs;
}
function commitElapsed() {
  if (state.running) {
    const n = Date.now();
    state.elapsedMs += n - state.lastResume;
    state.lastResume = n;
  }
}

/* ---------------------- Tramos (segments) ---------------------- */
function openSegment() {
  return { lineup: state.onCourt.slice(), ms: Math.max(0, nowElapsed() - state.segStart) };
}
function allSegments() {
  return state.segments.concat([openSegment()]);
}
function finalizeSegment() {
  const e = nowElapsed();
  const ms = e - state.segStart;
  if (ms > 0) state.segments.push({ lineup: state.onCourt.slice(), ms });
  state.segStart = e;
}

/* ---------------------- Marcador ---------------------- */
function homeScore() { return state.goals.filter(g => g.team === 'home').length; }
function awayScore() { return state.goals.filter(g => g.team === 'away').length; }

/* ---------------------- Cronómetro ---------------------- */
function toggleClock() {
  if (state.matchEnded) { toast('El partido ha finalizado. Pulsa "Iniciar partido".'); return; }
  if (!state.matchStarted) { state.matchStarted = true; state.startedAt = state.startedAt || Date.now(); }
  if (state.running) { commitElapsed(); state.running = false; }
  else { state.lastResume = Date.now(); state.running = true; }
  save(); renderBoard();
}

/* ---------------------- Iniciar partido (reset a 0) ---------------------- */
function startMatch() {
  const hasData = state.matchStarted && (state.segments.length || state.goals.length || nowElapsed() > 0);
  const doReset = () => {
    const onCourt = state.onCourt.slice();
    const bench = state.bench.slice();
    state = defaultState();
    state.onCourt = onCourt;
    state.bench = bench;
    state.matchStarted = true;
    state.startedAt = Date.now();
    analysisDataset = 'live';
    save(); renderAll();
    toast('Partido iniciado · datos a cero');
  };
  if (hasData) {
    confirmModal('¿Iniciar un partido nuevo?',
      'Se pondrán a cero el tiempo y el marcador. El alineado actual se mantiene.', doReset);
  } else {
    doReset();
  }
}

/* ---------------------- Finalizar partido ---------------------- */
function endMatch() {
  if (!state.matchStarted || state.matchEnded) { toast('No hay partido en curso.'); return; }
  confirmModal('¿Finalizar el partido?',
    'Se detendrá el cronómetro y se guardarán los datos en el historial.', () => {
      commitElapsed();
      state.running = false;
      finalizeSegment();
      const match = {
        id: Date.now(),
        date: state.startedAt || Date.now(),
        endedAt: Date.now(),
        totalMs: state.elapsedMs,
        home: homeScore(),
        away: awayScore(),
        segments: state.segments.map(s => ({ lineup: s.lineup.slice(), ms: s.ms })),
        goals: state.goals.map(g => ({ team: g.team, ms: g.ms, lineup: g.lineup.slice() })),
        players: PLAYERS.slice()
      };
      saveMatch(match);
      state.matchEnded = true;
      save(); renderAll();
      toast('Partido guardado en el historial ✓');
    });
}

/* ---------------------- Goles ---------------------- */
function addGoal(team) {
  if (state.matchEnded) { toast('El partido ha finalizado.'); return; }
  if (!state.matchStarted) { state.matchStarted = true; state.startedAt = state.startedAt || Date.now(); }
  state.goals.push({ team, ms: nowElapsed(), lineup: state.onCourt.slice() });
  save(); renderBoard(); renderAnalysisIfActive();
}
function removeGoal(team) {
  for (let i = state.goals.length - 1; i >= 0; i--) {
    if (state.goals[i].team === team) { state.goals.splice(i, 1); break; }
  }
  save(); renderBoard(); renderAnalysisIfActive();
}

/* ---------------------- Intercambios de fichas ---------------------- */
function zoneOf(id) { return state.onCourt.includes(id) ? 'court' : 'bench'; }

function swapOrMove(srcId, dstId) {
  if (srcId === dstId) return;
  const zs = zoneOf(srcId), zd = zoneOf(dstId);
  if (zs === zd) {
    // reordenar dentro de la misma zona (solo visual)
    const arr = zs === 'court' ? state.onCourt : state.bench;
    const si = arr.indexOf(srcId), di = arr.indexOf(dstId);
    arr.splice(si, 1);
    arr.splice(di, 0, srcId);
  } else {
    // intercambio pista <-> banquillo: cambia el quinteto -> cerramos tramo
    finalizeSegment();
    if (zs === 'court') {
      const ci = state.onCourt.indexOf(srcId), bi = state.bench.indexOf(dstId);
      state.onCourt[ci] = dstId;
      state.bench[bi] = srcId;
    } else {
      const bi = state.bench.indexOf(srcId), ci = state.onCourt.indexOf(dstId);
      state.bench[bi] = dstId;
      state.onCourt[ci] = srcId;
    }
  }
  save(); renderBoard(); renderAnalysisIfActive();
}

function onChipTap(id) {
  if (selected == null) { selected = id; renderBoard(); return; }
  if (selected === id) { selected = null; renderBoard(); return; }
  const prev = selected;
  selected = null;
  swapOrMove(prev, id);
}

/* ---------------------- Arrastrar fichas (pointer) ---------------------- */
function attachDrag(el, id) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    const startX = e.clientX, startY = e.clientY;
    let ghost = null, dragging = false, curTarget = null;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}

    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > 9) {
        dragging = true;
        ghost = el.cloneNode(true);
        ghost.classList.add('ghost');
        ghost.classList.remove('selected');
        document.body.appendChild(ghost);
        el.classList.add('dragging-src');
      }
      if (dragging) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const chip = under && under.closest ? under.closest('.chip') : null;
        if (curTarget && curTarget !== chip) curTarget.classList.remove('drop-target');
        if (chip && chip !== el) { chip.classList.add('drop-target'); curTarget = chip; }
        else curTarget = null;
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('dragging-src');
      if (ghost) ghost.remove();
      if (dragging) {
        if (curTarget) {
          curTarget.classList.remove('drop-target');
          const tid = parseInt(curTarget.dataset.id, 10);
          swapOrMove(id, tid);
        }
      } else {
        onChipTap(id);
      }
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

/* ---------------------- Render tablero ---------------------- */
function chipEl(id) {
  const el = document.createElement('div');
  el.className = 'chip' + (selected === id ? ' selected' : '');
  el.dataset.id = id;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', PLAYERS[id]);
  el.innerHTML = `<span class="chip-name">${PLAYERS[id]}</span>`;
  attachDrag(el, id);
  return el;
}

function updateTimerUI() { $('#timer').textContent = mmss(nowElapsed()); }

function renderBoard() {
  const cc = $('#courtChips'); cc.innerHTML = '';
  state.onCourt.forEach(id => cc.appendChild(chipEl(id)));
  const bc = $('#benchChips'); bc.innerHTML = '';
  state.bench.forEach(id => bc.appendChild(chipEl(id)));
  $('#courtCount').textContent = state.onCourt.length;
  $('#benchCount').textContent = state.bench.length;

  $('#homeScore').textContent = homeScore();
  $('#awayScore').textContent = awayScore();
  updateTimerUI();

  const btn = $('#btnClock');
  btn.textContent = state.running ? 'Pausar' : (state.elapsedMs > 0 ? 'Reanudar' : 'Iniciar');
  btn.classList.toggle('running', state.running);

  let st = 'Listo';
  if (state.matchEnded) st = 'Finalizado';
  else if (state.running) st = 'En juego';
  else if (state.matchStarted && state.elapsedMs > 0) st = 'En pausa';
  else if (state.matchStarted) st = 'Preparado';
  $('#status').textContent = st;

  document.body.classList.toggle('ended', state.matchEnded);
}

/* ---------------------- Formatos ---------------------- */
function mmss(ms) {
  const t = Math.floor(ms / 1000);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/* ---------------------- Consultas / filtros ---------------------- */
function matchesFilter(lineup, inc, exc) {
  for (const id of inc) if (!lineup.includes(id)) return false;
  for (const id of exc) if (lineup.includes(id)) return false;
  return true;
}
function query(ds, inc, exc) {
  let ms = 0, gf = 0, ga = 0;
  for (const s of ds.segments) if (matchesFilter(s.lineup, inc, exc)) ms += s.ms;
  for (const g of ds.goals) if (matchesFilter(g.lineup, inc, exc)) { if (g.team === 'home') gf++; else ga++; }
  return { ms, gf, ga };
}
function incList() { return Object.keys(filter).filter(k => filter[k] === 'inc').map(Number); }
function excList() { return Object.keys(filter).filter(k => filter[k] === 'exc').map(Number); }

function datasetFor() {
  if (analysisDataset === 'live') {
    return { segments: allSegments(), goals: state.goals, totalMs: nowElapsed(), live: true };
  }
  const m = getMatches().find(x => x.id === analysisDataset);
  if (!m) { analysisDataset = 'live'; return datasetFor(); }
  return { segments: m.segments, goals: m.goals, totalMs: m.totalMs, match: m, players: m.players };
}

/* ---------------------- Render análisis ---------------------- */
function cycleFilter(id) {
  const cur = filter[id];
  if (!cur) filter[id] = 'inc';
  else if (cur === 'inc') filter[id] = 'exc';
  else delete filter[id];
  renderAnalysis();
}

function diffClass(n) { return n > 0 ? 'pos' : (n < 0 ? 'neg' : 'zero'); }
function signed(n) { return (n > 0 ? '+' : '') + n; }

function renderAnalysisIfActive() { if (currentTab === 'analisis') renderAnalysis(); }

function renderAnalysis() {
  const ds = datasetFor();
  const names = ds.players || PLAYERS;

  // Banner si estamos viendo un partido del historial
  const banner = $('#analysisBanner');
  if (analysisDataset !== 'live' && ds.match) {
    banner.hidden = false;
    banner.innerHTML = `<span>Viendo partido del <b>${fmtDate(ds.match.date)}</b> · ${ds.match.home}-${ds.match.away}</span>`;
    const back = document.createElement('button');
    back.className = 'btn btn-ghost small';
    back.textContent = 'Volver al partido actual';
    back.onclick = () => { analysisDataset = 'live'; renderAnalysis(); };
    banner.appendChild(back);
  } else {
    banner.hidden = true;
  }

  // Rejilla de filtro
  const grid = $('#filterGrid');
  grid.innerHTML = '';
  names.forEach((name, id) => {
    const b = document.createElement('button');
    b.className = 'fchip' + (filter[id] ? ' ' + filter[id] : '');
    b.textContent = name;
    b.type = 'button';
    b.onclick = () => cycleFilter(id);
    grid.appendChild(b);
  });

  const inc = incList(), exc = excList();
  const parts = [];
  if (inc.length) parts.push('incluir: ' + inc.map(i => names[i]).join(', '));
  if (exc.length) parts.push('excluir: ' + exc.map(i => names[i]).join(', '));
  $('#filterSummary').textContent = parts.length ? parts.join(' · ') : 'sin filtro (partido completo)';

  // Tarjeta de resultado
  const r = query(ds, inc, exc);
  const total = ds.totalMs || 0;
  const pct = total > 0 ? Math.round((r.ms / total) * 100) : 0;
  const diff = r.gf - r.ga;

  let title;
  if (!inc.length && !exc.length) title = 'Partido completo';
  else if (inc.length >= 2 && !exc.length) title = `Minutos de <b>${inc.map(i => names[i]).join(' + ')}</b> juntas en pista`;
  else if (inc.length === 1 && !exc.length) title = `Minutos de <b>${names[inc[0]]}</b> en pista`;
  else {
    const incTxt = inc.length ? `con <b>${inc.map(i => names[i]).join(' + ')}</b>` : '';
    const excTxt = exc.length ? ` sin <b>${exc.map(i => names[i]).join(' + ')}</b>` : '';
    title = `Minutos ${incTxt}${excTxt}`.trim();
  }

  $('#resultCard').innerHTML = `
    <p class="result-title">${title}</p>
    <div class="result-grid">
      <div class="metric time"><div class="m-val">${mmss(r.ms)}</div><div class="m-lab">Tiempo</div></div>
      <div class="metric gf"><div class="m-val">${r.gf}</div><div class="m-lab">A favor</div></div>
      <div class="metric ga"><div class="m-val">${r.ga}</div><div class="m-lab">En contra</div></div>
      <div class="metric diff"><div class="m-val ${diffClass(diff)}">${signed(diff)}</div><div class="m-lab">Parcial +/−</div></div>
    </div>
    <p class="result-note">${pct}% del tiempo total de juego (${mmss(total)}).</p>`;

  // Tabla por jugadora
  const rows = names.map((name, id) => {
    const q = query(ds, [id], []);
    return { id, name, ms: q.ms, gf: q.gf, ga: q.ga, diff: q.gf - q.ga };
  }).sort((a, b) => b.ms - a.ms);

  const tbody = $('#playerTableBody');
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (analysisDataset === 'live' && state.onCourt.includes(row.id)) tr.classList.add('oncourt');
    tr.innerHTML = `
      <td class="l nm">${row.name}</td>
      <td class="mono">${mmss(row.ms)}</td>
      <td class="pos">${row.gf}</td>
      <td class="neg">${row.ga}</td>
      <td class="mono ${diffClass(row.diff)}">${signed(row.diff)}</td>`;
    tr.onclick = () => { filter = {}; filter[row.id] = 'inc'; renderAnalysis(); };
    tbody.appendChild(tr);
  });
}

/* ---------------------- Historial ---------------------- */
function renderHistory() {
  const list = $('#historyList');
  const matches = getMatches();
  list.innerHTML = '';
  if (!matches.length) {
    list.innerHTML = '<div class="empty">Aún no hay partidos guardados.<br>Finaliza un partido para guardarlo aquí.</div>';
    return;
  }
  matches.forEach(m => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="hc-main">
        <div class="hc-score">${m.home} <span style="color:var(--muted)">-</span> ${m.away}</div>
        <div class="hc-meta">${fmtDate(m.date)} · duración ${mmss(m.totalMs)}</div>
      </div>
      <div class="hc-actions"></div>`;
    const actions = card.querySelector('.hc-actions');

    const view = document.createElement('button');
    view.className = 'btn btn-ghost small';
    view.textContent = 'Ver análisis';
    view.onclick = () => { analysisDataset = m.id; filter = {}; switchTab('analisis'); };

    const del = document.createElement('button');
    del.className = 'btn btn-danger small';
    del.textContent = 'Borrar';
    del.onclick = () => confirmModal('¿Borrar este partido?', 'Esta acción no se puede deshacer.', () => {
      deleteMatch(m.id);
      if (analysisDataset === m.id) analysisDataset = 'live';
      renderHistory();
      toast('Partido borrado');
    });

    actions.appendChild(view);
    actions.appendChild(del);
    list.appendChild(card);
  });
}

/* ---------------------- Persistencia ---------------------- */
function save() { try { localStorage.setItem(LS_CURRENT, JSON.stringify(state)); } catch (_) {} }
let lastSave = 0;
function throttledSave() { const n = Date.now(); if (n - lastSave > 1000) { lastSave = n; save(); } }
function loadCurrent() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_CURRENT));
    if (s && Array.isArray(s.onCourt)) { if (s.running) s.lastResume = Date.now(); return s; }
  } catch (_) {}
  return null;
}
function getMatches() { try { return JSON.parse(localStorage.getItem(LS_MATCHES)) || []; } catch (_) { return []; } }
function saveMatch(m) { const arr = getMatches(); arr.unshift(m); try { localStorage.setItem(LS_MATCHES, JSON.stringify(arr)); } catch (_) {} }
function deleteMatch(id) { try { localStorage.setItem(LS_MATCHES, JSON.stringify(getMatches().filter(m => m.id !== id))); } catch (_) {} }

function exportData() {
  const data = { app: 'payasitas', version: 1, exportedAt: Date.now(), matches: getMatches(), current: state };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'payasitas-datos-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Datos exportados');
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.matches)) throw new Error('formato');
      const existing = getMatches();
      const ids = new Set(existing.map(m => m.id));
      const merged = existing.concat(data.matches.filter(m => !ids.has(m.id)));
      merged.sort((a, b) => b.date - a.date);
      localStorage.setItem(LS_MATCHES, JSON.stringify(merged));
      renderHistory();
      toast('Datos importados (' + data.matches.length + ' partidos)');
    } catch (_) { toast('Archivo no válido'); }
  };
  reader.readAsText(file);
}

/* ---------------------- Navegación ---------------------- */
function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'analisis') renderAnalysis();
  if (name === 'historial') renderHistory();
}

/* ---------------------- Modal / Toast ---------------------- */
let modalCb = null;
function confirmModal(title, msg, onYes) {
  $('#modalTitle').textContent = title;
  $('#modalMsg').textContent = msg;
  modalCb = onYes;
  $('#modal').hidden = false;
}
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------------------- Render global ---------------------- */
function renderAll() {
  renderBoard();
  if (currentTab === 'analisis') renderAnalysis();
  if (currentTab === 'historial') renderHistory();
}

/* ---------------------- Eventos ---------------------- */
function wire() {
  $('#btnClock').addEventListener('click', toggleClock);
  $('#btnReset').addEventListener('click', startMatch);
  $('#btnEnd').addEventListener('click', endMatch);

  document.querySelectorAll('.goal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = btn.dataset.team;
      const delta = parseInt(btn.dataset.delta, 10);
      if (delta > 0) addGoal(team); else removeGoal(team);
    });
  });

  document.querySelectorAll('.tabbar button').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  $('#btnClearFilter').addEventListener('click', () => { filter = {}; renderAnalysis(); });

  $('#btnExport').addEventListener('click', exportData);
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

  $('#modalCancel').addEventListener('click', () => { $('#modal').hidden = true; modalCb = null; });
  $('#modalOk').addEventListener('click', () => { $('#modal').hidden = true; const cb = modalCb; modalCb = null; if (cb) cb(); });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') { $('#modal').hidden = true; modalCb = null; } });

  // Ticker: consolida tiempo y refresca
  setInterval(() => {
    if (state.running) {
      commitElapsed();
      updateTimerUI();
      renderAnalysisIfActive();
      throttledSave();
    }
  }, 250);

  // Guardar al salir / ocultar
  window.addEventListener('beforeunload', () => { commitElapsed(); save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { commitElapsed(); save(); } });
}

/* ---------------------- Service worker ---------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---------------------- Arranque ---------------------- */
wire();
renderAll();
switchTab('partido');
