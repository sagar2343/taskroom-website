/* ═══════════════════════════════════════════════════════════════
   TASKROOM — TASKS
   Create · Edit · Recreate · Details · Live location · Route history

   Mirrors the Flutter app (features/task + features/location_tracking):
     POST   /tasks                     create
     POST   /tasks/detail              details
     PUT    /tasks/edit                edit task fields
     POST   /tasks/steps/add           add step      (edit mode)
     PUT    /tasks/steps/edit          edit step     (edit mode)
     DELETE /tasks/steps/remove        remove step   (edit mode)
     PATCH  /tasks/cancel              cancel
     POST   /tasks/live-location       live seed position
     POST   /tasks/location-trace      route history
     POST   /upload/task-voice-note    voice note upload
     Socket.IO  watch_task_location  → employee_location (live updates)

   Depends on core.js (BASE, api, esc, $, toast, fmt*, avatarHTML, openM/closeM)
   and dashboard.js (loadTasks, loadTaskDashboard, openLightbox, openSigViewer).
═══════════════════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════════════════════ */
const TK_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TK_STEP_COLORS = ['#F59E0B','#6366F1','#8B5CF6','#EC4899','#14B8A6','#EF4444']; // same palette as Flutter map sheet
const tkStepColor = i => TK_STEP_COLORS[i % TK_STEP_COLORS.length];
const TK_SOCKET_SRC  = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js';

function tkFmtDate(d)  { if (!d) return '--'; const t = new Date(d); return `${t.getDate()} ${TK_MONTHS[t.getMonth()]}`; }
function tkFmtTime(d)  { if (!d) return '--'; const t = new Date(d); const h = t.getHours() % 12 || 12; return `${h}:${String(t.getMinutes()).padStart(2,'0')} ${t.getHours() >= 12 ? 'PM' : 'AM'}`; }
function tkFmtDT(d)    { return d ? `${tkFmtDate(d)}, ${tkFmtTime(d)}` : '--'; }
function tkFmtSet(d)   { if (!d) return 'Set'; const t = new Date(d); const h = t.getHours() % 12 || 12; return `${t.getDate()} ${TK_MONTHS[t.getMonth()]} · ${h}:${String(t.getMinutes()).padStart(2,'0')} ${t.getHours() >= 12 ? 'PM' : 'AM'}`; }
function tkCap(s)      { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function tkLocal(d)    { // Date|ISO → "YYYY-MM-DDTHH:mm" in LOCAL time (datetime-local value)
  if (!d) return '';
  const t = new Date(d); if (isNaN(t)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
}
const tkDate  = v => (v ? new Date(v) : null);                // datetime-local → Date (local)
const tkISO   = v => new Date(v).toISOString();               // datetime-local → UTC ISO
const tkAttr  = s => esc(String(s ?? '')).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const tkUid   = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function tkStatusLabel(s) { return ({ in_progress:'In Progress', completed:'Completed', overdue:'Overdue', cancelled:'Cancelled', expired:'Missed (Expired)' })[s] || 'Pending'; }
function tkStatusColor(s) { return ({ in_progress:'var(--primary)', completed:'var(--green)', overdue:'var(--red)', cancelled:'#64748b', expired:'#a855f7' })[s] || 'var(--amber)'; }
function tkStatusBadge(s) { return ({ pending:'badge-pending', in_progress:'badge-in-progress', completed:'badge-completed', cancelled:'badge-cancelled', overdue:'badge-overdue', expired:'badge-expired' })[s] || 'badge-pending'; }
function tkStepColorByStatus(s) { return ({ completed:'var(--green)', in_progress:'var(--primary)', reached:'var(--primary)' })[s] || 'var(--text3)'; }
function tkStepStatusLabel(s) { return ({ completed:'Done', in_progress:'Active', reached:'Reached', skipped:'Skipped', travelling:'Travelling' })[s] || 'Pending'; }
const tkCanModify = t => !['completed', 'cancelled', 'expired'].includes(t?.status);   // Flutter: canCancel / canEditTask

/** Great-circle distance in metres (same result as Geolocator.distanceBetween). */
function tkHaversine(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function tkDistLabel(pts) {
  let d = 0; for (let i = 1; i < pts.length; i++) d += tkHaversine(pts[i-1], pts[i]);
  return d >= 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d) + 'm';
}
function tkDurLabel(s, e) {
  if (!s || !e) return '--';
  const m = Math.floor((new Date(e) - new Date(s)) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Lazy script / stylesheet loaders (one load per URL). */
const _tkLoaded = {};
function tkLoadScript(src, isReady) {
  if (isReady && isReady()) return Promise.resolve();
  if (_tkLoaded[src]) return _tkLoaded[src];
  return (_tkLoaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = () => res();
    s.onerror = () => { delete _tkLoaded[src]; rej(new Error('Failed to load ' + src)); };
    document.head.appendChild(s);
  }));
}
function tkLoadCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
}
/* ── Google Maps JS API (same Google Maps as the Flutter app) ──────────────
   The API key is NEVER hard-coded. Resolution order:
     1. window.TASKROOM_GOOGLE_MAPS_KEY   (optional manual override)
     2. GET /api/config  → { googleMapsApiKey }   (Vercel function reading the
        GOOGLE_MAPS_API_KEY environment variable — see api/config.js)
   Restrict the key by HTTP referrer in Google Cloud and enable:
   Maps JavaScript API, Places API (New), Geocoding API.                       */
let _tkKeyP = null, _tkGmapsP = null;
function tkGoogleKey() {
  if (window.TASKROOM_GOOGLE_MAPS_KEY) return Promise.resolve(window.TASKROOM_GOOGLE_MAPS_KEY);
  if (!_tkKeyP) _tkKeyP = fetch('/api/config', { cache: 'no-store' }).then(r => r.json()).then(j => j.googleMapsApiKey || '').catch(() => '');
  return _tkKeyP.then(k => { if (!k) _tkKeyP = null; return k; });
}
function tkGoogle() {
  if (window.google?.maps?.importLibrary && window.google.maps.Map) return Promise.resolve();
  if (!_tkGmapsP) _tkGmapsP = (async () => {
    const key = await tkGoogleKey();
    if (!key) throw new Error('NO_KEY');
    await new Promise((res, rej) => {
      window.__tkGmapsReady = res;
      window.gm_authFailure = () => { window.__tkGmapsAuthFailed = true; try { toast('Google Maps rejected the API key. Check the key restrictions and enabled APIs.', 'error'); } catch (e) {} };
      const sc = document.createElement('script');
      sc.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__tkGmapsReady`;
      sc.async = true; sc.onerror = () => rej(new Error('LOAD'));
      document.head.appendChild(sc);
    });
    await Promise.all(['maps', 'places', 'geocoding'].map(l => google.maps.importLibrary(l)));
  })().catch(e => { _tkGmapsP = null; throw e; });
  return _tkGmapsP;
}
function tkMapsError(e) {
  return e?.message === 'NO_KEY'
    ? 'Google Maps is not configured. Add the GOOGLE_MAPS_API_KEY environment variable to your hosting project and redeploy.'
    : 'Could not load Google Maps. Check your connection and the API key settings.';
}
/** SVG string → Google Marker icon */
function tkSvgIcon(svg, w, h, ax, ay) {
  return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new google.maps.Size(w, h), anchor: new google.maps.Point(ax, ay) };
}

/** Multipart upload (api() forces JSON content-type, so uploads use their own fetch). */
async function tkUpload(path, formData) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { Authorization: 'Bearer ' + _token }, body: formData });
  if (r.status === 401) { clearStorage(); showLanding(); toast('Session expired — please sign in again.', 'error'); throw new Error('Unauthorized'); }
  const txt = await r.text();
  try { return JSON.parse(txt); } catch (e) { return { success: false, message: 'Unexpected server response (HTTP ' + r.status + ')' }; }
}

/** Safe wrapper: api() that never throws (returns null on network failure) — Flutter datasource behaviour. */
async function tkApi(method, path, body) {
  try { return await api(method, path, body); } catch (e) { if (e.message !== 'Unauthorized') console.warn('[tasks]', method, path, e); return null; }
}

/* ══════════════════════════════════════════════════════════════
   DOM SHELL (injected once — keeps index.html small)
══════════════════════════════════════════════════════════════ */
function tkEnsureDom() {
  if ($('tk-form-view')) return;
  const el = document.createElement('div');
  el.id = 'tk-root';
  el.innerHTML = `
  <div class="tk-view" id="tk-form-view" role="dialog" aria-modal="true" aria-label="Task form">
    <div class="tk-view-hdr">
      <button class="tk-fbtn" style="width:38px;height:38px;border-radius:11px;box-shadow:none;border:1px solid var(--border)" onclick="tkCloseForm()" aria-label="Close">✕</button>
      <div class="tk-ttl"><h3 id="tkf-title">Create Task</h3><p id="tkf-sub"></p></div>
      <div style="width:38px"></div>
    </div>
    <div class="tk-view-body"><div class="tk-wrap" id="tkf-body"></div></div>
    <div class="tk-view-ftr" id="tkf-ftr"><button class="btn btn-primary" id="tkf-submit" onclick="tkSubmit()"></button></div>
  </div>

  <div class="tk-sheet-ov" id="tk-step-ov" onclick="if(event.target===this)tkCloseStepSheet()">
    <div class="tk-sheet" id="tk-step-sheet" role="dialog" aria-modal="true" aria-label="Configure step"></div>
  </div>

  <div class="tk-sheet-ov" id="tk-room-ov" onclick="if(event.target===this)tkCloseRoomPicker()" style="z-index:630">
    <div class="tk-sheet" style="max-width:480px">
      <div class="tk-sheet-hdr"><div class="ico">🏠</div><div style="flex:1"><h4>Select a room</h4><small style="color:var(--text3)">Tasks are created inside a room</small></div><button class="tk-ibtn grey" onclick="tkCloseRoomPicker()">✕</button></div>
      <div class="tk-sheet-body"><div class="tk-room-list" id="tk-room-list"><div class="loading"><div class="spinner"></div></div></div></div>
    </div>
  </div>

  <div class="tk-view tk-loc" id="tk-loc-view" role="dialog" aria-modal="true" aria-label="Pick destination">
    <div class="tk-loc-map" id="tk-loc-map"></div>
    <div class="tk-loc-top">
      <button class="tk-fbtn" onclick="tkLocCancel()" aria-label="Back">←</button>
      <div class="tk-search">
        <input type="text" id="tk-loc-q" placeholder="Search location or address..." autocomplete="off" oninput="tkLocSearchInput(this.value)">
        <button class="x" id="tk-loc-x" style="display:none" onclick="tkLocClearSearch()" aria-label="Clear">✕</button>
        <div class="tk-sugg" id="tk-loc-sugg" style="display:none"></div>
      </div>
    </div>
    <div class="tk-loc-hint" id="tk-loc-hint">Tap the map to pin destination</div>
    <div class="tk-loc-ctl">
      <button class="tk-fbtn acc" id="tk-loc-me" onclick="tkLocMyLocation()" aria-label="My location">◎</button>
      <button class="tk-fbtn" onclick="tkLocZoom(1)" aria-label="Zoom in">+</button>
      <button class="tk-fbtn" onclick="tkLocZoom(-1)" aria-label="Zoom out">−</button>
    </div>
    <div class="tk-loc-panel" id="tk-loc-panel"><div class="wrap">
      <div class="cap">SELECTED DESTINATION</div>
      <div class="addr" id="tk-loc-addr">Getting address...</div>
      <div class="co" id="tk-loc-co"></div>
      <button class="btn btn-primary" style="width:100%;padding:14px;justify-content:center" onclick="tkLocConfirm()">✓ Confirm Destination</button>
    </div></div>
  </div>

  <div class="tk-view tk-map-view" id="tk-map-view" role="dialog" aria-modal="true" aria-label="Employee location">
    <div class="tk-view-hdr">
      <button class="tk-fbtn" style="width:38px;height:38px;border-radius:11px;box-shadow:none;border:1px solid var(--border)" onclick="tkCloseMap()" aria-label="Close">✕</button>
      <div class="tk-ttl"><h3 id="tkm-title">Employee Location</h3><p id="tkm-sub"></p></div>
      <div class="tk-tabs" id="tkm-tabs">
        <button id="tkm-tab-live" class="live" onclick="tkMapSwitch(true)">● Live Location</button>
        <button id="tkm-tab-route" onclick="tkMapSwitch(false)">Route History</button>
      </div>
    </div>
    <div class="tk-map-status" id="tkm-status"></div>
    <div class="tk-map-wrap">
      <div id="tk-map"></div>
      <div class="tk-map-msg" id="tkm-msg"></div>
      <div class="tk-map-chip" id="tkm-chips"></div>
      <div class="tk-map-ctl">
        <button onclick="tkMapFit()">⊞ Fit</button>
        <button onclick="tkMapSat()">🛰️ Satellite</button>
        <button id="tkm-refresh" onclick="tkMapRefresh()" style="display:none">⟳ Refresh</button>
      </div>
      <div class="tk-legend" id="tkm-legend"></div>
    </div>
    <div class="tk-map-bottom" id="tkm-bottom"></div>
  </div>`;
  document.body.appendChild(el);
}

/* Escape closes the top-most task overlay first */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('tk-loc-view')?.classList.contains('open'))      return tkLocCancel();
  if ($('tk-step-ov')?.classList.contains('open'))       return tkCloseStepSheet();
  if ($('tk-room-ov')?.classList.contains('open'))       return tkCloseRoomPicker();
  if ($('tk-map-view')?.classList.contains('open'))      return tkCloseMap();
  if ($('tk-form-view')?.classList.contains('open'))     return tkCloseForm();
});

/* ══════════════════════════════════════════════════════════════
   FORM MODEL  (TaskFormStep equivalent)
══════════════════════════════════════════════════════════════ */
function tkNewStep(p = {}) {
  return Object.assign({
    localId: tkUid(), title: '', description: '', start: '', end: '',
    lat: null, lng: null, address: null, radius: 100,
    requirePhoto: false, requireSignature: false, signatureFrom: null,
    requireLocationCheck: false, requireLocationTrace: false,
  }, p);
}
const tkHasLoc  = s => s.lat != null && s.lng != null;
const tkIsField = s => !!s.requireLocationCheck && tkHasLoc(s);

/** Same rules, same order and same messages as TaskFormStep.validationError. */
function tkStepError(s) {
  if (!s.title.trim()) return 'Step title is required';
  if (!s.start) return 'Start time is required';
  if (!s.end)   return 'End time is required';
  if (tkDate(s.end) < tkDate(s.start)) return 'End must be after start';
  if (s.requireLocationCheck && !tkHasLoc(s)) return 'Pin a destination for the location check';
  if (s.requireSignature && !s.signatureFrom) return 'Select who must sign';
  return null;
}

/** Same JSON as TaskFormStep.toApiJson (GeoJSON order = [lng, lat]). */
function tkStepToApi(s) {
  const field = tkIsField(s);
  const o = {
    title: s.title.trim(),
    startDatetime: tkISO(s.start),
    endDatetime: tkISO(s.end),
    isFieldWorkStep: field,
    locationRadiusMeters: s.radius,
    validations: {
      requirePhoto: s.requirePhoto,
      requireSignature: s.requireSignature,
      requireLocationCheck: s.requireLocationCheck,
      requireLocationTrace: s.requireLocationTrace,
    },
  };
  if (s.description.trim()) o.description = s.description.trim();
  if (field) { o.destinationLocation = { coordinates: [s.lng, s.lat] }; if (s.address != null) o.destinationLocation.address = s.address; }
  if (s.requireSignature && s.signatureFrom) o.validations.signatureFrom = s.signatureFrom;
  return o;
}

/** Existing server step → form step (EditTaskController.openStepSheet "preloaded"). */
function tkStepFromServer(o, localId) {
  const c = o.destinationLocation?.coordinates, v = o.validations || {};
  return tkNewStep({
    localId: localId || o.stepId || tkUid(),
    title: o.title || '', description: o.description || '',
    start: tkLocal(o.startDatetime), end: tkLocal(o.endDatetime),
    lat: c && c.length > 1 ? c[1] : null, lng: c && c.length > 0 ? c[0] : null,
    address: o.destinationLocation?.address ?? null,
    radius: o.locationRadiusMeters ?? 100,
    requirePhoto: !!v.requirePhoto, requireSignature: !!v.requireSignature, signatureFrom: v.signatureFrom ?? null,
    requireLocationCheck: !!v.requireLocationCheck, requireLocationTrace: !!v.requireLocationTrace,
  });
}

/** completed/skipped → locked · in_progress/travelling/reached → limited · else full */
function tkEditability(orig) {
  const s = orig.status || 'pending';
  if (s === 'completed' || s === 'skipped') return 'locked';
  if (['in_progress', 'travelling', 'reached'].includes(s)) return 'limited';
  return 'full';
}

/* ══════════════════════════════════════════════════════════════
   FORM STATE + ENTRY POINTS
══════════════════════════════════════════════════════════════ */
let TF = null;           // current form state
let _tkRec = null;       // active MediaRecorder session

function tkBlankForm(o) {
  return Object.assign({
    mode: 'create', roomId: null, roomName: '', taskId: null, task: null, recreateFrom: null,
    title: '', note: '', priority: 'medium', track: false, start: '', end: '',
    steps: [],                       // create / recreate
    states: [], newSteps: [],        // edit
    members: [], selected: new Set(), loadingMembers: false,
    voice: { existing: null, removed: false, blob: null, mime: '', duration: 0, url: '', recording: false, elapsed: 0, uploaded: null },
    submitting: false,
  }, o);
}

/** Entry: from the room modal ("+ Create Task"). */
function openCreateTaskForRoom() {
  const rid = _currentRoomId, rname = $('rd-name')?.textContent || '';
  closeM('modal-room-detail');
  tkOpenForm({ mode: 'create', roomId: rid, roomName: rname });
}

/** Entry: from the Tasks page / overview — pick a room first (tasks always live inside a room). */
async function openCreateTask() {
  tkEnsureDom();
  $('tk-room-ov').classList.add('open');
  const list = $('tk-room-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const d = await tkApi('GET', '/rooms?page=1&limit=100');
  const rooms = (d?.data?.rooms || []).filter(r => !r.isArchived);
  if (!d?.success) { list.innerHTML = `<div class="tbl-empty">${esc(d?.message || 'Could not load rooms')}</div>`; return; }
  if (!rooms.length) { list.innerHTML = '<div class="tbl-empty">No active rooms. Create a room first.</div>'; return; }
  list.innerHTML = rooms.map(r => `<div class="tk-room-item" onclick="tkPickRoom('${tkAttr(r._id)}','${tkAttr(r.name)}')"><div><b style="font-size:13px">${esc(r.name)}</b><div style="font-size:11px;color:var(--text3)">${esc(r.roomCode || '')}</div></div><span class="badge badge-active" style="font-size:10px">${r.stats?.totalMembers || 0} members</span></div>`).join('');
}
function tkCloseRoomPicker() { $('tk-room-ov')?.classList.remove('open'); }
function tkPickRoom(id, name) { tkCloseRoomPicker(); tkOpenForm({ mode: 'create', roomId: id, roomName: name }); }

/** Entry: task panel → Edit. */
function openEditTask(taskId) { tkOpenForm({ mode: 'edit', taskId: taskId || _currentTaskId }); }

/** Entry: task panel → Recreate (fetches the task, then pre-fills a create form). */
async function openRecreateTask(taskId) {
  const id = taskId || _currentTaskId; if (!id) return;
  const d = await tkApi('POST', '/tasks/detail', { taskId: id });
  const t = d?.data?.task;
  if (!d?.success || !t) { toast(d?.message || 'Could not load task', 'error'); return; }
  tkOpenForm({ mode: 'create', roomId: t.room?._id || t.room?.id || '', roomName: t.room?.name || '', recreateFrom: t });
}

async function tkOpenForm(opts) {
  tkEnsureDom();
  tkDiscardVoice();
  TF = tkBlankForm(opts);
  $('tk-form-view').classList.add('open');
  document.body.style.overflow = 'hidden';
  const isEdit = TF.mode === 'edit';
  $('tkf-title').textContent = isEdit ? 'Edit Task' : TF.recreateFrom ? 'Recreate Task' : 'Create Task';
  $('tkf-sub').textContent = isEdit ? '' : TF.roomName;
  $('tkf-ftr').style.display = 'none';
  $('tkf-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  if (isEdit) {
    const d = await tkApi('POST', '/tasks/detail', { taskId: TF.taskId });
    const t = d?.data?.task;
    if (!d?.success || !t) {
      $('tkf-body').innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>${esc(d?.message || 'Task not found')}</h3><button class="btn btn-ghost btn-sm" onclick="tkOpenForm({mode:'edit',taskId:'${tkAttr(TF.taskId)}'})">Retry</button></div>`;
      return;
    }
    TF.task = t; TF.roomName = t.room?.name || ''; $('tkf-sub').textContent = TF.roomName;
    if (!tkCanModify(t)) {
      $('tkf-body').innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><h3>Task is ${esc(t.status)}</h3><p>Completed, cancelled, and expired tasks cannot be edited.</p></div>`;
      return;
    }
    tkPopulateEdit(t);
  } else {
    if (TF.recreateFrom) tkPrefillRecreate();   // fields first so the form never flashes empty
  }
  tkBuildShell();
  if (!isEdit) tkLoadMembers(true);
}

function tkCloseForm() {
  if (!$('tk-form-view')?.classList.contains('open')) return;
  tkStopRecording(true);
  tkDiscardVoice();
  $('tk-form-view').classList.remove('open');
  document.body.style.overflow = '';
  TF = null;
}

/* ── Populate: edit ───────────────────────────────────────────── */
function tkPopulateEdit(t) {
  TF.title = t.title || ''; TF.note = t.note || ''; TF.priority = t.priority || 'medium';
  TF.track = !!t.isFieldWork; TF.start = tkLocal(t.startDatetime); TF.end = tkLocal(t.endDatetime);
  TF.voice.existing = t.voiceNote?.url ? t.voiceNote : null;
  TF.states = (t.steps || []).map(s => ({ original: s, draft: null, localId: s.stepId || tkUid() }));
  TF.newSteps = [];
}

/* ── Populate: recreate (same rules as CreateTaskController._applyRecreateData) ── */
function tkPrefillRecreate() {
  const o = TF.recreateFrom;
  TF.title = o.title || ''; TF.note = o.note || ''; TF.priority = o.priority || 'medium';
  TF.track = !!o.isFieldWork;
  TF.voice.existing = o.voiceNote?.url ? o.voiceNote : null;

  let shift = 0;
  const os = o.startDatetime && new Date(o.startDatetime), oe = o.endDatetime && new Date(o.endDatetime);
  if (os && oe) {
    const dur = oe - os, now = new Date();
    let ns = new Date(now.getFullYear(), now.getMonth(), now.getDate(), os.getHours(), os.getMinutes());
    if (!(ns > now)) ns = new Date(ns.getTime() + 86400000);   // slot already passed → same time tomorrow
    TF.start = tkLocal(ns); TF.end = tkLocal(new Date(ns.getTime() + dur));
    shift = ns - os;
  }
  TF.steps = (o.steps || []).map(s => {
    const c = s.destinationLocation?.coordinates, v = s.validations || {};
    return tkNewStep({
      title: s.title || '', description: s.description || '',
      start: s.startDatetime ? tkLocal(new Date(s.startDatetime).getTime() + shift) : TF.start,
      end:   s.endDatetime   ? tkLocal(new Date(s.endDatetime).getTime() + shift)   : TF.end,
      lat: c ? c[1] : null, lng: c ? c[0] : null, address: s.destinationLocation?.address ?? null,
      radius: s.locationRadiusMeters ?? 100,
      requirePhoto: !!v.requirePhoto, requireSignature: !!v.requireSignature, signatureFrom: v.signatureFrom ?? null,
      requireLocationCheck: !!v.requireLocationCheck,
      requireLocationTrace: v.requireLocationTrace ?? TF.track,
    });
  });
}

/* ── Members ──────────────────────────────────────────────────── */
async function tkLoadMembers(applyRecreateAssignee) {
  if (!TF?.roomId) { tkRenderMembers(); return; }
  TF.loadingMembers = true; tkRenderMembers();
  const form = TF;
  const d = await tkApi('GET', '/rooms/member/' + TF.roomId);
  if (TF !== form) return;                     // form was closed/reopened meanwhile
  TF.members = (d?.data?.members || []).filter(m => m.user && m.status !== 'removed');
  TF.loadingMembers = false;
  if (applyRecreateAssignee && TF.recreateFrom) {
    const id = TF.recreateFrom.assignedTo?._id || TF.recreateFrom.assignedTo?.id;
    // pre-select the original assignee only if still a member of this room
    if (id && TF.members.some(m => (m.user._id || m.user.id) === id)) TF.selected.add(id);
  }
  tkRenderMembers(); tkRenderSubmit();
}

/* ══════════════════════════════════════════════════════════════
   FORM RENDERING
══════════════════════════════════════════════════════════════ */
function tkToggleHTML(id, color, ico, title, desc, on, handler) {
  return `<div class="tk-toggle ${on ? 'on' : ''}" id="${id}" style="--tk-c:${color}" onclick="${handler}"><div class="ico">${ico}</div><div class="tx"><b>${title}</b><span>${desc}</span></div><div class="tk-switch"></div></div>`;
}

function tkBuildShell() {
  const edit = TF.mode === 'edit';
  const startLocked = edit && TF.task?.status !== 'pending';
  const now = new Date(Date.now() - 86400000);
  $('tkf-body').innerHTML = `
    <div id="tkf-banner"></div>
    <div class="tk-card">
      <div class="tk-card-hdr"><div class="tk-card-ico">📋</div><h4>Task Details</h4></div>
      <div class="fg"><label class="tk-lbl" for="tkf-t">Title *</label><input type="text" id="tkf-t" maxlength="120" placeholder="e.g. Deliver Order #204 to Site C" oninput="TF.title=this.value"></div>
      <div class="fg"><label class="tk-lbl" for="tkf-n">Note</label><textarea id="tkf-n" rows="3" style="resize:vertical" placeholder="Extra instructions for the employee..." oninput="TF.note=this.value"></textarea></div>
      <div class="fg"><div id="tkf-voice"></div></div>
      <div class="fg"><span class="tk-lbl">Priority</span><div class="tk-prio" id="tkf-prio">${['low','medium','high'].map(p => `<button type="button" data-p="${p}" onclick="tkSetPriority('${p}')">${tkCap(p)}</button>`).join('')}</div></div>
      <span class="tk-lbl">Schedule ${edit ? '' : '*'}</span>
      <div class="tk-sched" style="margin-bottom:14px">
        <div class="fg"><label class="tk-lbl" for="tkf-s" style="font-size:9px">START</label><input type="datetime-local" id="tkf-s" ${startLocked ? 'disabled' : ''} min="${tkLocal(now)}" onchange="tkOnStart(this.value)">${startLocked ? '<div class="tk-lock-note">🔒 Start time is locked once a task begins</div>' : ''}</div>
        <div class="fg"><label class="tk-lbl" for="tkf-e" style="font-size:9px">END</label><input type="datetime-local" id="tkf-e" onchange="tkOnEnd(this.value)"></div>
      </div>
      <div id="tkf-track"></div>
    </div>
    <div class="tk-card">
      <div class="tk-card-hdr"><div class="tk-card-ico">☑</div><h4>Steps</h4><span class="tk-pill" id="tkf-steps-n" style="display:none"></span></div>
      <div id="tkf-steps"></div>
    </div>
    ${edit ? '' : `<div class="tk-card">
      <div class="tk-card-hdr"><div class="tk-card-ico">👥</div><h4>Assign Employees</h4><span class="tk-pill green" id="tkf-sel-n" style="display:none"></span><button class="tk-ibtn" style="margin-left:auto" onclick="tkLoadMembers(false)" title="Refresh members" aria-label="Refresh members">⟳</button></div>
      <div id="tkf-members"></div>
    </div>`}`;
  $('tkf-t').value = TF.title; $('tkf-n').value = TF.note;
  $('tkf-s').value = TF.start;  $('tkf-e').value = TF.end;
  tkRenderBanner(); tkRenderVoice(); tkRenderPriority(); tkRenderTrack(); tkRenderSteps(); tkRenderMembers(); tkRenderSubmit();
  $('tkf-ftr').style.display = '';
  $('tkf-e').min = TF.start || tkLocal(now);
}

function tkRenderBanner() {
  const el = $('tkf-banner'); if (!el) return;
  if (TF.mode === 'edit') {
    el.innerHTML = TF.task?.status === 'in_progress'
      ? `<div class="tk-banner amber">⚠️ <div><b>Task is in progress</b><br>Completed steps are locked. Active steps allow limited edits (title, description, end time). Start time cannot be changed.</div></div>` : '';
    return;
  }
  const o = TF.recreateFrom;
  el.innerHTML = o ? `<div class="tk-banner">↻ <div>${o.status === 'expired'
    ? 'Recreating from an expired (missed deadline) task. Details are pre-filled — review the schedule and assignees before creating.'
    : o.status === 'cancelled'
      ? 'Recreating from a cancelled task. Details are pre-filled — review the schedule and assignees before creating.'
      : 'Recreating from an existing task. Details are pre-filled — review the schedule and assignees before creating.'}</div></div>` : '';
}

function tkRenderPriority() { document.querySelectorAll('#tkf-prio button').forEach(b => b.classList.toggle('sel', b.dataset.p === TF.priority)); }
function tkSetPriority(p) { TF.priority = p; tkRenderPriority(); }

function tkRenderTrack() {
  $('tkf-track').innerHTML = tkToggleHTML('tkf-track-t', 'var(--info)', '📡', 'Track Employee Location', 'Pings live GPS every 30 seconds for the full task duration', TF.track, 'tkToggleTrack()');
}
/** Task-level toggle propagates requireLocationTrace to steps (create/recreate: all steps; edit: new steps only — same as Flutter). */
function tkToggleTrack() {
  TF.track = !TF.track;
  if (TF.mode === 'edit') TF.newSteps.forEach(s => s.requireLocationTrace = TF.track);
  else TF.steps.forEach(s => s.requireLocationTrace = TF.track);
  tkRenderTrack();
}

function tkOnStart(v) {
  TF.start = v;
  if (TF.end && v && tkDate(TF.end) < tkDate(v)) { TF.end = ''; $('tkf-e').value = ''; }
  $('tkf-e').min = v || '';
}
function tkOnEnd(v) { TF.end = v; }

/* ── Steps list ───────────────────────────────────────────────── */
function tkStepRowHTML(s, i, opt) {
  const field = tkIsField(s), valid = opt.forceValid || !tkStepError(s);   // untouched server steps are never flagged (Flutter: draft?.isValid ?? true)
  const c = field ? 'var(--green)' : 'var(--primary)';
  return `<div class="tk-step-row ${valid ? '' : 'invalid'} ${opt.locked ? 'locked' : ''}" style="--tk-c:${c}" ${opt.drag ? `draggable="true" ondragstart="tkDragStart(event,${i})" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="tkDrop(event,${i})"` : ''}>
    <div class="tk-step-num">${opt.num}</div>
    <div class="tk-step-main"><b ${s.title ? '' : 'style="color:var(--text3)"'}>${esc(s.title || 'Untitled step')}</b><small>${field ? '🛣 Field Work' : '💼 Normal'}</small>${valid ? '' : '<small class="bad">⚠ Incomplete</small>'}${opt.tag || ''}</div>
    <button class="tk-ibtn" ${opt.locked ? 'disabled' : ''} onclick="${opt.edit}" title="Edit step" aria-label="Edit step">✎</button>
    <button class="tk-ibtn red" ${opt.noDelete ? 'disabled' : ''} onclick="${opt.del}" title="${opt.noDelete ? (opt.locked ? 'Locked step' : 'Must keep at least one step') : 'Delete step'}" aria-label="Delete step">🗑</button>
    ${opt.drag ? `<span class="tk-handle" title="Drag to reorder">⋮⋮</span><span style="display:flex;flex-direction:column;gap:2px"><button class="tk-ibtn grey" style="height:14px;width:22px;font-size:9px" ${i === 0 ? 'disabled' : ''} onclick="tkMoveStep(${i},-1)" aria-label="Move up">▲</button><button class="tk-ibtn grey" style="height:14px;width:22px;font-size:9px" ${i === opt.total - 1 ? 'disabled' : ''} onclick="tkMoveStep(${i},1)" aria-label="Move down">▼</button></span>` : ''}
  </div>`;
}

function tkRenderSteps() {
  const el = $('tkf-steps'); if (!el || !TF) return;
  const edit = TF.mode === 'edit';
  const total = edit ? TF.states.length + TF.newSteps.length : TF.steps.length;
  const n = $('tkf-steps-n'); if (n) { n.style.display = total ? '' : 'none'; n.textContent = total; }
  if (!total) {
    el.innerHTML = `<div class="tk-step-empty" onclick="tkAddStep()"><div style="font-size:38px;opacity:.6">＋</div><b>Add First Step</b><span>Click to break the task into steps</span></div>`;
    return;
  }
  let h = '';
  if (!edit) {
    h += TF.steps.map((s, i) => tkStepRowHTML(s, i, { num: i + 1, drag: true, total: TF.steps.length, edit: `tkEditStep('${s.localId}')`, del: `tkDeleteStep('${s.localId}')` })).join('');
  } else {
    h += TF.states.map((ss, i) => {
      const e = tkEditability(ss.original), d = ss.draft;
      const view = d || tkStepFromServer(ss.original, ss.localId);
      const label = { full: '', limited: '<small class="lim"> · Active · Limited edit (title, desc, end time)</small>', locked: `<small class="lock"> · Locked · ${esc(ss.original.status)}</small>` }[e];
      const canRemove = (TF.states.length + TF.newSteps.length) > 1 && e === 'full';
      return tkStepRowHTML(view, i, { num: i + 1, edit: `tkEditExisting('${ss.localId}')`, del: `tkRemoveExisting('${ss.localId}')`, locked: e === 'locked', noDelete: !canRemove, forceValid: !d, tag: label + (d ? '<small class="edited">Edited</small>' : '') });
    }).join('');
    h += TF.newSteps.map((s, i) => tkStepRowHTML(s, TF.states.length + i, { num: TF.states.length + i + 1, edit: `tkEditNew('${s.localId}')`, del: `tkRemoveNew('${s.localId}')`, tag: '<small class="new">NEW</small>' })).join('');
  }
  h += `<button class="tk-add-step" onclick="tkAddStep()">⊕ ${total ? 'Add Another Step' : 'Add Step'}</button>`;
  el.innerHTML = h;
}

/* drag & drop + arrows (create/recreate) */
let _tkDragFrom = null;
function tkDragStart(e, i) { _tkDragFrom = i; e.dataTransfer.effectAllowed = 'move'; }
function tkDrop(e, to) { e.preventDefault(); if (_tkDragFrom == null) return; tkReorder(_tkDragFrom, to); _tkDragFrom = null; }
function tkMoveStep(i, dir) { tkReorder(i, i + dir); }
function tkReorder(from, to) {
  if (to < 0 || to >= TF.steps.length || from === to) { tkRenderSteps(); return; }
  const [s] = TF.steps.splice(from, 1); TF.steps.splice(to, 0, s); tkRenderSteps();
}

function tkAddStep() {
  const s = tkNewStep({ start: TF.start, end: TF.end, requireLocationTrace: TF.track });   // inherits task schedule + track toggle
  if (TF.mode === 'edit') { if (!tkCanModify(TF.task)) return; TF.newSteps.push(s); } else TF.steps.push(s);
  tkRenderSteps();
  tkOpenStepSheet(s, 'full', upd => {
    const list = TF.mode === 'edit' ? TF.newSteps : TF.steps;
    const i = list.findIndex(x => x.localId === upd.localId); if (i !== -1) list[i] = upd; tkRenderSteps();
  });
}
function tkEditStep(id)  { const s = TF.steps.find(x => x.localId === id); if (s) tkOpenStepSheet(s, 'full', upd => { TF.steps[TF.steps.findIndex(x => x.localId === id)] = upd; tkRenderSteps(); }); }
function tkDeleteStep(id){ TF.steps = TF.steps.filter(s => s.localId !== id); tkRenderSteps(); }
function tkEditNew(id)   { const s = TF.newSteps.find(x => x.localId === id); if (s) tkOpenStepSheet(s, 'full', upd => { TF.newSteps[TF.newSteps.findIndex(x => x.localId === id)] = upd; tkRenderSteps(); }); }
function tkRemoveNew(id) { TF.newSteps = TF.newSteps.filter(s => s.localId !== id); tkRenderSteps(); }

function tkEditExisting(id) {
  const ss = TF.states.find(x => x.localId === id); if (!ss) return;
  if (!tkCanModify(TF.task)) return toast(`Task is ${TF.task.status} — edits not allowed`, 'error');
  const e = tkEditability(ss.original);
  if (e === 'locked') return toast(`This step is ${ss.original.status} and cannot be edited`, 'error');
  tkOpenStepSheet(ss.draft || tkStepFromServer(ss.original, ss.localId), e, upd => { ss.draft = upd; tkRenderSteps(); });
}
async function tkRemoveExisting(id) {
  const ss = TF.states.find(x => x.localId === id); if (!ss) return;
  if (!confirm(`Remove "${ss.draft?.title || ss.original.title || 'this step'}"? This cannot be undone.`)) return;
  const res = await tkApi('DELETE', '/tasks/steps/remove', { taskId: TF.taskId, stepId: ss.original.stepId });
  if (res?.success) { TF.states = TF.states.filter(x => x !== ss); tkRenderSteps(); }
  else toast(res?.message || 'Could not remove step', 'error');
}

/* ── Members ──────────────────────────────────────────────────── */
function tkRenderMembers() {
  const el = $('tkf-members'); if (!el) return;
  const n = $('tkf-sel-n'); if (n) { n.style.display = TF.selected.size ? '' : 'none'; n.textContent = TF.selected.size; }
  if (TF.loadingMembers) { el.innerHTML = '<div class="loading"><div class="spinner"></div></div>'; return; }
  if (!TF.members.length) { el.innerHTML = '<div style="padding:16px 0;font-size:13px;color:var(--text3)">No active employees in this room</div>'; return; }
  const all = TF.selected.size === TF.members.length;
  el.innerHTML = `<div class="tk-members-bar"><span>${TF.members.length} member${TF.members.length === 1 ? '' : 's'}</span><button class="tk-chip-btn ${all ? 'red' : ''}" onclick="tkSelectAll(${all})">${all ? 'Deselect all' : 'Select all'}</button></div>
  <div class="tk-members">${TF.members.map(m => { const u = m.user, id = u._id || u.id, sel = TF.selected.has(id);
    return `<div class="member-select-item ${sel ? 'selected' : ''}" onclick="tkToggleMember('${tkAttr(id)}')">${avatarHTML(u, { size: 34 })}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.fullName || u.username || '—')}</div><div style="font-size:11px;color:var(--text3)">@${esc(u.username || '—')}</div></div><div style="font-size:11px;color:${u.isOnline ? 'var(--green)' : 'var(--text3)'}">● ${u.isOnline ? 'Online' : 'Offline'}</div><div class="check">${sel ? '✓' : ''}</div></div>`; }).join('')}</div>`;
}
function tkToggleMember(id) { TF.selected.has(id) ? TF.selected.delete(id) : TF.selected.add(id); tkRenderMembers(); tkRenderSubmit(); }
function tkSelectAll(allSelected) { if (allSelected) TF.selected.clear(); else TF.members.forEach(m => TF.selected.add(m.user._id || m.user.id)); tkRenderMembers(); tkRenderSubmit(); }

function tkRenderSubmit() {
  const b = $('tkf-submit'); if (!b || !TF) return;
  b.disabled = TF.submitting;
  if (TF.submitting) { b.innerHTML = '<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin-right:8px"></span> ' + (TF.mode === 'edit' ? 'Saving…' : 'Creating…'); return; }
  b.innerHTML = TF.mode === 'edit' ? '💾 Save Changes' : (TF.selected.size > 1 ? `🚀 Create Task for ${TF.selected.size} Employees` : '🚀 Create Task');
}

/* ══════════════════════════════════════════════════════════════
   VOICE NOTE  (VoiceNoteRecorder / VoiceNotePlayer equivalent)
   max 120 s · min 1 s · uploaded on submit (cached across retries)
══════════════════════════════════════════════════════════════ */
const TK_VOICE_MAX = 120;
const tkFmtClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function tkRenderVoice() {
  const el = $('tkf-voice'); if (!el || !TF) return;
  const v = TF.voice;
  let h = '<span class="tk-lbl">Voice note (optional)</span>';
  if (v.recording) {
    h += `<div class="tk-voice rec"><span class="tk-rec-dot"></span><span class="grow" id="tkf-rec-t">Recording  ${tkFmtClock(v.elapsed)} / ${tkFmtClock(TK_VOICE_MAX)}</span><button type="button" class="btn btn-danger btn-sm" onclick="tkStopRecording()">■ Stop</button></div>`;
  } else if (v.blob) {
    h += `<div class="tk-voice"><audio controls preload="metadata" src="${tkAttr(v.url)}"></audio><button type="button" class="tk-ibtn red" onclick="tkVoiceDelete()" title="Remove voice note" aria-label="Remove voice note">🗑</button></div>`;
  } else if (v.existing?.url && !v.removed) {
    h += `<div class="tk-voice"><audio controls preload="metadata" src="${tkAttr(v.existing.url)}"></audio><button type="button" class="tk-ibtn red" onclick="tkVoiceRemoveExisting()" title="Remove voice note" aria-label="Remove voice note">🗑</button></div>`;
  } else {
    h += `<div class="tk-voice"><span class="grow">🎙 Record a voice note</span><button type="button" class="btn btn-ghost btn-sm" onclick="tkStartRecording()">● Record</button></div>`;
  }
  el.innerHTML = h;
}

async function tkStartRecording() {
  if (!TF || TF.voice.recording) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return toast('Voice recording is not supported in this browser.', 'error');
  }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { return toast('Microphone permission is needed to record. Enable it in your browser settings.', 'error'); }
  // Prefer AAC/MP4 (the format the mobile app records, plays everywhere); fall back to WebM/Ogg.
  const mime = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    .find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); return toast('Could not start recording.', 'error'); }
  const chunks = [];
  mr.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
  const session = _tkRec = { mr, stream, chunks, startedAt: Date.now(), timer: null, discard: false, form: TF };
  mr.onstop = () => {
    clearInterval(session.timer);
    session.stream.getTracks().forEach(t => t.stop());
    if (_tkRec === session) _tkRec = null;
    const f = session.form, secs = Math.round((Date.now() - session.startedAt) / 1000);
    if (session.discard || TF !== f) return;
    f.voice.recording = false;
    if (secs < 1) { toast('Recording too short — try again.', 'error'); tkRenderVoice(); return; }
    const blob = new Blob(session.chunks, { type: mr.mimeType || mime || 'audio/webm' });
    tkRevokeVoiceUrl();
    Object.assign(f.voice, { blob, mime: blob.type, duration: Math.min(secs, TK_VOICE_MAX), url: URL.createObjectURL(blob), uploaded: null });
    tkRenderVoice();
  };
  mr.start();
  TF.voice.recording = true; TF.voice.elapsed = 0; tkRenderVoice();
  session.timer = setInterval(() => {
    if (!TF || TF !== session.form) return;
    TF.voice.elapsed = Math.round((Date.now() - session.startedAt) / 1000);
    const t = $('tkf-rec-t'); if (t) t.textContent = `Recording  ${tkFmtClock(TF.voice.elapsed)} / ${tkFmtClock(TK_VOICE_MAX)}`;
    if (TF.voice.elapsed >= TK_VOICE_MAX) tkStopRecording();
  }, 500);
}
function tkStopRecording(discard) {
  const s = _tkRec; if (!s) return;
  s.discard = !!discard;
  try { s.mr.state !== 'inactive' && s.mr.stop(); } catch (e) {}
}
function tkRevokeVoiceUrl() { if (TF?.voice?.url) { try { URL.revokeObjectURL(TF.voice.url); } catch (e) {} TF.voice.url = ''; } }
function tkDiscardVoice() { tkStopRecording(true); tkRevokeVoiceUrl(); }
function tkVoiceDelete() { tkRevokeVoiceUrl(); Object.assign(TF.voice, { blob: null, mime: '', duration: 0, uploaded: null }); tkRenderVoice(); }
function tkVoiceRemoveExisting() { TF.voice.removed = true; tkRenderVoice(); }

/** Upload once; result cached so a retry after a failed save doesn't upload twice. */
async function tkUploadVoice() {
  const v = TF.voice;
  if (!v.blob) return null;
  if (v.uploaded) return v.uploaded;
  const ext = /mp4|aac|m4a/.test(v.mime) ? 'm4a' : /ogg/.test(v.mime) ? 'ogg' : 'webm';
  const fd = new FormData();
  fd.append('voice', new File([v.blob], `voice.${ext}`, { type: v.mime || 'audio/webm' }));
  let res; try { res = await tkUpload('/upload/task-voice-note', fd); } catch (e) { return null; }
  if (!res?.success || !res.data?.url) { console.warn('[voice upload]', res); return null; }
  return (v.uploaded = { url: res.data.url, durationSeconds: res.data.durationSeconds ?? v.duration });
}

/* ══════════════════════════════════════════════════════════════
   STEP SHEET  (StepFormSheet equivalent)
   mode: 'full' | 'limited' (title, description, end time only)
══════════════════════════════════════════════════════════════ */
let SS = null;

function tkOpenStepSheet(step, mode, onSave) {
  SS = { s: Object.assign({}, step), mode, onSave };
  $('tk-step-ov').classList.add('open');
  tkRenderStepSheet();
}
function tkCloseStepSheet() {
  $('tk-step-ov')?.classList.remove('open'); SS = null;
  tkRenderSteps();      // a freshly added step the user cancelled stays listed as "Incomplete" (same as Flutter)
}

function tkRenderStepSheet() {
  const s = SS.s, lim = SS.mode === 'limited', dis = lim ? 'disabled' : '';
  const tStart = tkDate(TF.start), tEnd = tkDate(TF.end);
  const minS = tStart ? tkLocal(new Date(tStart.getFullYear(), tStart.getMonth(), tStart.getDate())) : tkLocal(Date.now() - 86400000);
  const maxS = tEnd ? tkLocal(new Date(tEnd.getFullYear(), tEnd.getMonth(), tEnd.getDate(), 23, 59)) : '';
  const minE = s.start || minS;
  $('tk-step-sheet').innerHTML = `
    <div class="tk-sheet-hdr"><div class="ico">⚙</div><div style="flex:1"><h4>Configure Step</h4>${tkIsField(s) ? '<small>📍 Destination set</small>' : ''}</div><button class="btn btn-primary btn-sm" onclick="tkSaveStep()">Save</button><button class="tk-ibtn grey" onclick="tkCloseStepSheet()" aria-label="Close">✕</button></div>
    <div class="tk-sheet-body">
      ${lim ? '<div class="tk-banner amber" style="margin-bottom:14px">This step is active — only the title, description and end time can be changed.</div>' : ''}
      <div class="fg"><label class="tk-lbl" for="tks-t">Step title *</label><input type="text" id="tks-t" placeholder="e.g. Pick up order from warehouse" oninput="SS.s.title=this.value"></div>
      <div class="fg"><label class="tk-lbl" for="tks-d">Description</label><textarea id="tks-d" rows="3" style="resize:vertical" placeholder="Extra instructions..." oninput="SS.s.description=this.value"></textarea></div>
      <span class="tk-lbl">Step time *</span>
      <div class="tk-sched" style="margin-bottom:20px">
        <div class="fg"><label class="tk-lbl" style="font-size:9px" for="tks-s">START</label><input type="datetime-local" id="tks-s" ${dis} min="${minS}" ${maxS ? `max="${maxS}"` : ''} onchange="SS.s.start=this.value;$('tks-e').min=this.value||''"></div>
        <div class="fg"><label class="tk-lbl" style="font-size:9px" for="tks-e">END</label><input type="datetime-local" id="tks-e" min="${minE}" ${maxS ? `max="${maxS}"` : ''} onchange="SS.s.end=this.value"></div>
      </div>
      <span class="tk-lbl">Employee requirements</span>
      ${tkStepToggle('📷', 'var(--amber)', 'Photo Proof', 'Employee uploads a photo on completion', s.requirePhoto, lim, 'requirePhoto')}
      ${tkStepToggle('✍️', 'var(--info)', 'Signature', 'Collect a digital signature before completing', s.requireSignature, lim, 'requireSignature')}
      ${s.requireSignature ? `<div class="tk-sig-opts"><span style="width:100%;font-size:11px;font-weight:700;color:var(--text3)">Signed by</span>${['customer', 'supervisor', 'manager'].map(w => `<button type="button" class="${s.signatureFrom === w ? 'sel' : ''}" ${dis} onclick="SS.s.signatureFrom='${w}';tkRenderStepSheet()">${tkCap(w)}</button>`).join('')}</div>` : ''}
      ${tkStepToggle('📍', 'var(--green)', 'Destination Check', 'Employee must physically arrive at a pinned location', s.requireLocationCheck, lim, 'requireLocationCheck')}
      ${s.requireLocationCheck ? `
        <div class="tk-loc-card ${tkHasLoc(s) ? 'set' : ''}" ${lim ? 'style="pointer-events:none;opacity:.6"' : ''} onclick="tkStepPickLocation()">
          <div class="ico">${tkHasLoc(s) ? '📍' : '＋'}</div>
          <div style="flex:1;min-width:0">${tkHasLoc(s) ? `<b>${esc(s.address || 'Location pinned')}</b><small>${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</small>` : '<span style="font-size:13px;color:var(--text3)">Click to pin destination on map</span>'}</div><span style="color:var(--text3)">›</span>
        </div>
        <div class="tk-radius"><div class="tx"><b>ARRIVAL RADIUS</b>Employee must be within this distance to confirm arrival</div><div style="position:relative"><input type="number" id="tks-r" min="1" step="1" ${dis} oninput="SS.s.radius=this.value" style="padding-right:26px"><span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--text3)">m</span></div></div>
        <div class="tk-info-green">ⓘ The employee sees an "I've Reached the Destination" button when they arrive. GPS is verified against the pin before they can mark the step complete.</div>` : ''}
      <button class="btn btn-primary" style="width:100%;margin-top:26px;padding:14px;justify-content:center" onclick="tkSaveStep()">Save Step</button>
    </div>`;
  $('tks-t').value = s.title; $('tks-d').value = s.description; $('tks-s').value = s.start; $('tks-e').value = s.end;
  const r = $('tks-r'); if (r) r.value = s.radius;
}
function tkStepToggle(ico, color, title, desc, on, lim, key) {
  return `<div class="tk-toggle ${on ? 'on' : ''}" style="--tk-c:${color};${lim ? 'pointer-events:none;opacity:.6' : ''}" onclick="tkStepFlip('${key}')"><div class="ico">${ico}</div><div class="tx"><b>${title}</b><span>${desc}</span></div><div class="tk-switch"></div></div>`;
}
function tkStepFlip(key) {
  const s = SS.s; s[key] = !s[key];
  if (key === 'requireLocationCheck' && !s[key]) { s.lat = s.lng = null; s.address = null; }   // turning the check off clears the pin
  tkRenderStepSheet();
}
function tkStepPickLocation() {
  const s = SS.s;
  tkOpenLocationPicker(tkHasLoc(s) ? { lat: s.lat, lng: s.lng, address: s.address } : null, loc => {
    if (!SS) return; Object.assign(SS.s, { lat: loc.lat, lng: loc.lng, address: loc.address }); tkRenderStepSheet();
  });
}
function tkSaveStep() {
  const upd = Object.assign({}, SS.s);
  upd.title = upd.title.trim(); upd.description = (upd.description || '').trim();
  upd.radius = parseInt(upd.radius, 10) || 100;
  const err = tkStepError(upd);
  if (err) return toast(err, 'error');
  const cb = SS.onSave; $('tk-step-ov').classList.remove('open'); SS = null;
  cb(upd);
}

/* ══════════════════════════════════════════════════════════════
   SUBMIT — create / recreate
══════════════════════════════════════════════════════════════ */
/** Same checks, same order, same messages as CreateTaskController.validate(). */
function tkValidateCreate() {
  if (!TF.title.trim()) return 'Task title is required';
  if (!TF.start) return 'Start date & time is required';
  if (!TF.end)   return 'End date & time is required';
  if (tkDate(TF.end) < tkDate(TF.start)) return 'End must be after start';
  if (!TF.steps.length) return 'Add at least one step';
  if (!TF.selected.size) return 'Assign to at least one employee';
  for (let i = 0; i < TF.steps.length; i++) { const e = tkStepError(TF.steps[i]); if (e) return `Step ${i + 1}: ${e}`; }
  return null;
}

async function tkSubmit() {
  if (!TF || TF.submitting) return;
  if (TF.mode === 'edit') return tkSaveEdit();
  const err = tkValidateCreate();
  if (err) return toast(err, 'error');
  if (!TF.roomId) return toast('No room selected', 'error');
  if (TF.voice.recording) return toast('Please stop the voice recording first.', 'error');
  TF.submitting = true; tkRenderSubmit();
  const form = TF;
  try {
    let note = null;                                     // new recording wins; else keep the recreated task's note unless removed
    if (form.voice.blob) {
      note = await tkUploadVoice();
      if (!note) return toast('Could not upload the voice note. Check your connection and try again.', 'error');
    } else if (!form.voice.removed && form.voice.existing?.url) {
      note = { url: form.voice.existing.url, durationSeconds: form.voice.existing.durationSeconds ?? null };
    }
    const body = {
      roomId: form.roomId, title: form.title.trim(),
      priority: form.priority,
      startDatetime: tkISO(form.start), endDatetime: tkISO(form.end),
      isFieldWork: form.track,                           // "track live location"
      assignedTo: Array.from(form.selected),
      steps: form.steps.map(tkStepToApi),
    };
    if (form.note.trim()) body.note = form.note.trim();
    if (note) body.voiceNote = note;
    const res = await tkApi('POST', '/tasks', body);
    if (!res) return toast('Something went wrong.', 'error');
    if (res.success) {
      const n = form.selected.size;
      tkCloseForm();
      toast(n > 1 ? `Task created for ${n} employees!` : 'Task created successfully!', 'success');
      tkRefreshLists();
    } else toast(res.message || 'Something went wrong!', 'error');
  } finally { if (TF === form) { TF.submitting = false; tkRenderSubmit(); } }
}

function tkRefreshLists(reopenTaskId) {
  try { loadTasks(typeof _tpg === 'number' ? _tpg : 1); loadTaskDashboard(); } catch (e) {}
  if (reopenTaskId) openTaskPanel(reopenTaskId);
}

/* ══════════════════════════════════════════════════════════════
   SUBMIT — edit  (task fields → changed steps → new steps)
══════════════════════════════════════════════════════════════ */
function tkValidateEdit() {
  if (!tkCanModify(TF.task)) return `Task is ${TF.task?.status} — no changes allowed`;
  if (!TF.title.trim()) return 'Task title is required';
  if (!TF.end) return 'End date & time is required';
  if (TF.start && tkDate(TF.end) < tkDate(TF.start)) return 'End time must be after start time';
  for (let i = 0; i < TF.states.length; i++) { const d = TF.states[i].draft; const e = d && tkStepError(d); if (e) return `Step ${i + 1}: ${e}`; }
  for (let i = 0; i < TF.newSteps.length; i++) { const e = tkStepError(TF.newSteps[i]); if (e) return `New Step ${i + 1}: ${e}`; }
  return null;
}

async function tkSaveEdit() {
  const err = tkValidateEdit();
  if (err) return toast(err, 'error');
  if (TF.voice.recording) return toast('Please stop the voice recording first.', 'error');
  TF.submitting = true; tkRenderSubmit();
  const form = TF, taskId = form.taskId, errors = [];
  try {
    let newNote = null;
    if (form.voice.blob) {
      newNote = await tkUploadVoice();
      if (!newNote) return toast('Could not upload the voice note. Check your connection and try again.', 'error');
    }
    const isPending = form.task.status === 'pending';
    const body = { taskId, title: form.title.trim(), priority: form.priority };
    if (form.note.trim()) body.note = form.note.trim();
    if (isPending && form.start) body.startDatetime = tkISO(form.start);       // start is locked once started
    if (form.end) body.endDatetime = tkISO(form.end);
    if (newNote) body.voiceNote = newNote;
    else if (form.voice.removed && form.voice.existing) body.voiceNote = null;
    const taskRes = await tkApi('PUT', '/tasks/edit', body);
    if (!taskRes?.success) errors.push(`Task fields: ${taskRes?.message || 'Update failed'}`);

    for (const ss of form.states) {
      if (!ss.draft) continue;
      const e = tkEditability(ss.original); if (e === 'locked') continue;
      const d = ss.draft;
      const p = { taskId, stepId: ss.original.stepId, title: d.title.trim(), endDatetime: tkISO(d.end) };
      if (d.description.trim()) p.description = d.description.trim();
      if (e === 'full') {
        p.startDatetime = tkISO(d.start);
        p.isFieldWorkStep = tkIsField(d);
        if (tkIsField(d)) p.destinationLocation = Object.assign({ coordinates: [d.lng, d.lat] }, d.address != null ? { address: d.address } : {});
        p.locationRadiusMeters = d.radius;
        p.validations = { requirePhoto: d.requirePhoto, requireSignature: d.requireSignature, requireLocationCheck: d.requireLocationCheck, requireLocationTrace: d.requireLocationTrace };
        if (d.requireSignature && d.signatureFrom) p.validations.signatureFrom = d.signatureFrom;
      }
      const r = await tkApi('PUT', '/tasks/steps/edit', p);
      if (!r?.success) errors.push(`Step "${ss.original.title}": ${r?.message || 'Update failed'}`);
    }
    for (const ns of form.newSteps) {
      if (tkStepError(ns)) continue;
      const r = await tkApi('POST', '/tasks/steps/add', Object.assign({ taskId }, tkStepToApi(ns)));
      if (!r?.success) errors.push(`New step "${ns.title}": ${r?.message || 'Add failed'}`);
    }
    if (!errors.length) {
      tkCloseForm(); toast('Task updated successfully!', 'success'); tkRefreshLists(taskId);
    } else {
      toast('Some changes failed: ' + errors[0], 'error');
      if (TF === form) { form.submitting = false; await tkOpenForm({ mode: 'edit', taskId }); }   // reload latest server state
    }
  } finally { if (TF === form) { TF.submitting = false; tkRenderSubmit(); } }
}

/* ══════════════════════════════════════════════════════════════
   LOCATION PICKER  (LocationPickerScreen equivalent)
   Google Maps · Places API (New) autocomplete restricted to India with a
   50 km location bias and a session token (same request the app sends) ·
   Geocoder for the address of a tapped / dragged pin.
══════════════════════════════════════════════════════════════ */
let LP = null;
const TK_INDIA = { lat: 20.5937, lng: 78.9629 };

function tkPinSvg(num, color, big) {
  const t = num != null ? `<text x="15" y="19" text-anchor="middle" font-size="12" font-weight="900" font-family="Arial,sans-serif" fill="${color}">${num}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 38" width="30" height="38"><path d="M15 0C6.7 0 0 6.5 0 14.6 0 25 15 38 15 38s15-13 15-23.4C30 6.5 23.3 0 15 0z" fill="${color}"/>${big ? `<circle cx="15" cy="14.6" r="13" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="3"/>` : ''}<circle cx="15" cy="14.5" r="${num != null ? 8.5 : 5.5}" fill="#fff"/>${t}</svg>`;
}
const tkPinIcon = (num, color, active) => active ? tkSvgIcon(tkPinSvg(num, color, true), 39, 49, 19.5, 49) : tkSvgIcon(tkPinSvg(num, color, false), 30, 38, 15, 38);

async function tkOpenLocationPicker(initial, cb) {
  tkEnsureDom();
  const view = $('tk-loc-view'); view.classList.add('open');
  try { await tkGoogle(); } catch (e) { view.classList.remove('open'); return toast(tkMapsError(e), 'error'); }
  tkLocTeardown();
  LP = { cb, pin: null, address: null, marker: null, seq: 0, timer: null, sugSeq: 0, results: [], geocoding: false };
  $('tk-loc-q').value = ''; $('tk-loc-x').style.display = 'none'; $('tk-loc-sugg').style.display = 'none';
  $('tk-loc-panel').classList.remove('show');
  LP.map = new google.maps.Map($('tk-loc-map'), {
    center: initial ? { lat: initial.lat, lng: initial.lng } : TK_INDIA, zoom: initial ? 15 : 5,
    disableDefaultUI: true, gestureHandling: 'greedy', clickableIcons: false, mapTypeId: 'roadmap',
  });
  LP.geocoder = new google.maps.Geocoder();
  LP.session = new google.maps.places.AutocompleteSessionToken();
  LP.map.addListener('click', e => tkLocPin(e.latLng.lat(), e.latLng.lng()));
  if (initial) { tkLocPlace(initial.lat, initial.lng); LP.address = initial.address || null; tkLocShowPanel(); }
  else $('tk-loc-hint').style.display = '';
}

function tkLocTeardown() { if (LP) { clearTimeout(LP.timer); LP.marker?.setMap(null); if (window.google?.maps?.event && LP.map) google.maps.event.clearInstanceListeners(LP.map); } LP = null; }
function tkLocCancel() { $('tk-loc-view').classList.remove('open'); tkLocTeardown(); }
function tkLocConfirm() {
  if (!LP?.pin) return;
  const out = { lat: LP.pin[0], lng: LP.pin[1], address: LP.address }, cb = LP.cb;
  $('tk-loc-view').classList.remove('open'); tkLocTeardown(); cb(out);
}
function tkLocZoom(d) { if (LP?.map) LP.map.setZoom((LP.map.getZoom() || 5) + d); }

function tkLocPlace(lat, lng) {
  LP.pin = [lat, lng];
  if (!LP.marker) {
    LP.marker = new google.maps.Marker({ position: { lat, lng }, map: LP.map, draggable: true, icon: tkPinIcon(null, '#8B5CF6', false), zIndex: 10 });
    LP.marker.addListener('dragend', () => { const p = LP.marker.getPosition(); tkLocPin(p.lat(), p.lng()); });
  } else LP.marker.setPosition({ lat, lng });
  $('tk-loc-hint').style.display = 'none';
}
function tkLocShowPanel() {
  $('tk-loc-panel').classList.add('show');
  $('tk-loc-co').textContent = `${LP.pin[0].toFixed(6)}, ${LP.pin[1].toFixed(6)}`;
  const a = $('tk-loc-addr'); a.textContent = LP.geocoding ? 'Getting address...' : (LP.address || 'Location pinned');
  a.style.color = LP.geocoding ? 'var(--text3)' : '';
}

/** Pin + reverse-geocode (name, sub-locality, locality, state — the same parts the app shows). */
async function tkLocPin(lat, lng) {
  if (!LP) return;
  tkLocPlace(lat, lng); LP.address = null; LP.geocoding = true; tkLocShowPanel();
  const my = ++LP.seq, ctx = LP;
  try {
    const r = await ctx.geocoder.geocode({ location: { lat, lng } });
    if (LP === ctx && my === LP.seq) LP.address = tkComposeAddress(r?.results || []);
  } catch (e) { /* address stays null → "Location pinned" */ }
  if (LP === ctx && my === LP.seq) { LP.geocoding = false; tkLocShowPanel(); }
}
function tkComposeAddress(results) {
  const r = results[0]; if (!r) return null;
  const get = (...types) => { for (const t of types) { const c = (r.address_components || []).find(c => c.types.includes(t)); if (c) return c.long_name; } return ''; };
  const street = [get('street_number'), get('route')].filter(Boolean).join(' ');
  const parts = [get('premise', 'point_of_interest', 'establishment') || street, get('sublocality_level_1', 'sublocality', 'neighborhood'), get('locality', 'administrative_area_level_2'), get('administrative_area_level_1')]
    .filter((p, i, arr) => p && arr.indexOf(p) === i);
  return parts.join(', ') || r.formatted_address || null;
}

function tkLocMyLocation() {
  if (!navigator.geolocation) return toast('Location is not supported in this browser', 'error');
  const b = $('tk-loc-me'); b.textContent = '…';
  navigator.geolocation.getCurrentPosition(p => {
    b.textContent = '◎'; if (!LP) return;
    LP.map.setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); LP.map.setZoom(17); tkLocPin(p.coords.latitude, p.coords.longitude);
  }, err => { b.textContent = '◎'; toast(err.code === 1 ? 'Location permission denied' : 'Could not get your location', 'error'); }, { enableHighAccuracy: true, timeout: 12000 });
}

function tkLocSearchInput(q) {
  $('tk-loc-x').style.display = q ? '' : 'none';
  clearTimeout(LP?.timer);
  if (q.trim().length < 3) { $('tk-loc-sugg').style.display = 'none'; return; }
  LP.timer = setTimeout(() => tkLocSearch(q.trim()), 350);
}
function tkLocClearSearch() { $('tk-loc-q').value = ''; $('tk-loc-x').style.display = 'none'; $('tk-loc-sugg').style.display = 'none'; clearTimeout(LP?.timer); }

async function tkLocSearch(q) {
  const box = $('tk-loc-sugg'), ctx = LP, my = ++LP.sugSeq;
  box.style.display = ''; box.innerHTML = '<div style="color:var(--text3)">Searching…</div>';
  const req = { input: q, includedRegionCodes: ['in'], sessionToken: LP.session };       // India only, like the app
  const c = LP.pin ? { lat: LP.pin[0], lng: LP.pin[1] } : LP.map.getCenter()?.toJSON?.();
  if (c) req.locationBias = { center: c, radius: 50000 };                                  // 50 km bias — ranks nearby first, doesn't filter
  let list = [];
  try { list = (await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req)).suggestions || []; }
  catch (e) { console.warn('[places]', e); if (LP === ctx && my === LP.sugSeq) box.innerHTML = '<div style="color:var(--red)">Search unavailable — check that Places API (New) is enabled for the key.</div>'; return; }
  if (LP !== ctx || my !== LP.sugSeq) return;
  LP.results = list.map(x => x.placePrediction).filter(Boolean);
  if (!LP.results.length) { box.innerHTML = '<div style="color:var(--text3)">No results</div>'; return; }
  box.innerHTML = LP.results.map((p, i) => `<div onclick="tkLocPick(${i})"><b>${esc(p.mainText?.text || p.text?.text || '')}</b><small>${esc(p.secondaryText?.text || '')}</small></div>`).join('');
}
async function tkLocPick(i) {
  const pred = LP?.results?.[i]; if (!pred) return;
  const ctx = LP;
  $('tk-loc-sugg').style.display = 'none'; $('tk-loc-q').value = pred.mainText?.text || pred.text?.text || '';
  try {
    const place = pred.toPlace();
    await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });     // resolves the placeId → coordinates (closes the billing session)
    if (LP !== ctx || !place.location) return;
    const lat = place.location.lat(), lng = place.location.lng();
    LP.seq++; tkLocPlace(lat, lng); LP.address = place.formattedAddress || pred.text?.text || null; LP.geocoding = false; tkLocShowPanel();
    LP.map.setCenter({ lat, lng }); LP.map.setZoom(16);
    LP.session = new google.maps.places.AutocompleteSessionToken();                           // fresh session after a pick (same as newSession())
  } catch (e) { toast('Could not load that place', 'error'); }
}

/* ══════════════════════════════════════════════════════════════
   TASK DETAILS PANEL  (ManagerTaskDetailScreen equivalent)
══════════════════════════════════════════════════════════════ */
let _tpTask = null;

async function openTaskPanel(taskId) {
  tkEnsureDom();
  _currentTaskId = taskId; _tpTask = null;
  $('task-panel').classList.add('open');
  $('tp-title').textContent = 'Loading…'; $('tp-sub').innerHTML = '';
  $('tp-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  ['tp-cancel-btn', 'tp-edit-btn', 'tp-recreate-btn'].forEach(id => { const b = $(id); if (b) b.style.display = 'none'; });
  if (window.innerWidth <= 768 && typeof showMobBackBar === 'function') showMobBackBar('Task Detail');
  const d = await tkApi('POST', '/tasks/detail', { taskId });
  if (_currentTaskId !== taskId) return;                      // panel closed / another task opened meanwhile
  if (!d) { $('tp-body').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading task</h3></div>'; return; }
  if (!d.success || !d.data?.task) { $('tp-body').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>${esc(d.message || 'Task not found')}</h3><button class="btn btn-ghost btn-sm" onclick="openTaskPanel('${tkAttr(taskId)}')">Retry</button></div>`; return; }
  _tpTask = d.data.task;
  renderTaskPanel(_tpTask);
}

function closeTaskPanel() {
  $('task-panel')?.classList.remove('open');
  _currentTaskId = null;
  if (typeof hideMobBackBar === 'function') hideMobBackBar();
}

function tkTimeBlock(label, dt, bad) {
  return `<div class="tk-time"><small>${label}</small>${dt ? `<b ${bad ? 'style="color:var(--red)"' : ''}>${tkFmtTime(dt)}</b><span>${tkFmtDate(dt)}</span>` : '<b>—</b>'}</div>`;
}
function tkTlRow(ico, label, dt, color) { return `<div class="tk-tl"><span style="color:${color}">${ico}</span><span>${label}</span><b style="margin-left:auto">${tkFmtDT(dt)}</b></div>`; }

function renderTaskPanel(t) {
  const sc = tkStatusColor(t.status), manage = tkCanModify(t) && _user?.role === 'manager';
  const total = t.totalSteps || (t.steps || []).length, done = t.completedSteps || 0, pct = total ? done / total : 0;
  const pcol = pct >= 1 ? 'var(--green)' : pct >= .5 ? 'var(--primary)' : 'var(--amber)';
  const u = t.assignedTo && typeof t.assignedTo === 'object' ? t.assignedTo : null;
  const steps = t.steps || [];
  const overdue = t.endDatetime && new Date(t.endDatetime) < new Date() && ['pending', 'in_progress', 'overdue'].includes(t.status);

  $('tp-title').textContent = t.title || 'Untitled Task';
  $('tp-sub').innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="badge ${tkStatusBadge(t.status)}">${esc(tkStatusLabel(t.status))}</span><span style="color:var(--text3)">·</span><span style="color:var(--text2);font-size:12px">${esc(t.room?.name || '—')}</span></div>`;
  if (_user?.role === 'manager') {
    $('tp-cancel-btn').style.display = manage ? '' : 'none';
    $('tp-edit-btn').style.display = manage ? '' : 'none';
    $('tp-recreate-btn').style.display = '';
  }

  /* location card (only for tasks with live-location tracking) */
  const fieldProgress = steps.some(s => s.isFieldWorkStep && ['reached', 'completed'].includes(s.status));
  const active = t.status === 'in_progress';
  const locCard = t.isFieldWork ? `<div class="tk-card"><span class="tk-lbl">Employee location</span>
      <div class="tk-loc-btns">
        ${active ? `<button class="tk-loc-btn" style="--tk-c:var(--green)" onclick="tkOpenMap(true)"><div class="ico">◎</div><div><b>Live Location</b><small>Current position</small></div></button>` : ''}
        ${fieldProgress ? `<button class="tk-loc-btn" style="--tk-c:var(--primary)" onclick="tkOpenMap(false)"><div class="ico">⤳</div><div><b>Full Route</b><small>GPS trace history</small></div></button>` : ''}
      </div>
      <div class="tk-note">ⓘ ${active ? 'GPS pings will update while the task is active.' : fieldProgress ? 'The task is complete. View the full recorded route above.' : 'No field-work steps have recorded GPS data yet.'}</div></div>` : '';

  const reason = t.cancellationReason || t.cancelReason;
  const info = `
    <div class="tk-hero" style="--tk-c:${sc}">
      <div class="pills"><span>${esc(tkStatusLabel(t.status).toUpperCase())}</span><span>${t.priority === 'high' ? '🔴' : t.priority === 'low' ? '🟢' : '🟡'} ${esc(tkCap(t.priority || 'medium'))}</span>${t.isFieldWork ? '<span>📍 Track Location</span>' : ''}</div>
      <h3>${esc(t.title || 'Untitled Task')}</h3>${t.room?.name ? `<div class="rm">🏠 ${esc(t.room.name)}</div>` : ''}
    </div>
    ${u ? `<div class="tk-card"><div class="tk-emp">${avatarHTML(u, { size: 44, online: true })}<div class="nm"><small>ASSIGNED TO</small><b>${esc(u.fullName || u.username || 'Employee')}</b>${u.username ? `<span>@${esc(u.username)}</span>` : ''}</div><span class="tk-on ${u.isOnline ? 'on' : 'off'}">${u.isOnline ? 'Online' : 'Offline'}</span>${t.isGroupTask ? '<span class="badge badge-in-progress" style="font-size:10px">Group Task</span>' : ''}</div></div>` : ''}
    <div class="tk-card"><span class="tk-lbl">Schedule</span>
      <div class="tk-times">${tkTimeBlock('START', t.startDatetime)}${tkTimeBlock('DEADLINE', t.endDatetime, overdue)}</div>
      ${total ? `<div class="tk-prog-row"><span>${done}/${total} steps done</span><span style="color:${pcol}">${Math.round(pct * 100)}%</span></div><div class="tk-prog"><i style="width:${Math.round(pct * 100)}%;background:${pcol}"></i></div>` : ''}
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:4px">
        ${t.createdAt ? tkTlRow('＋', `Created${t.createdBy?.fullName || t.createdBy?.username ? ' by ' + esc(t.createdBy.fullName || t.createdBy.username) : ''}`, t.createdAt, 'var(--text3)') : ''}
        ${t.employeeStartTime ? tkTlRow('▶', 'Employee started', t.employeeStartTime, 'var(--primary)') : ''}
        ${t.completedAt ? tkTlRow('✓', 'Completed', t.completedAt, 'var(--green)') : ''}
        ${t.cancelledAt ? tkTlRow(t.status === 'expired' ? '⏱' : '✕', t.status === 'expired' ? 'Expired (missed deadline)' : 'Cancelled', t.cancelledAt, t.status === 'expired' ? '#a855f7' : 'var(--red)') : ''}
        ${t.lastEditedAt ? tkTlRow('✎', `Last edited${t.editedWhileActive ? ' (while active)' : ''}`, t.lastEditedAt, 'var(--amber)') : ''}
      </div>
      ${reason ? `<div class="tk-banner red" style="margin:12px 0 0">Reason: ${esc(reason)}</div>` : ''}
    </div>
    ${locCard}
    ${t.note ? `<div class="tk-card"><div style="display:flex;gap:10px"><span style="font-size:18px">📝</span><div style="flex:1"><span class="tk-lbl" style="margin-bottom:4px">Task note</span><div style="font-size:13px;line-height:1.55;white-space:pre-wrap">${esc(t.note)}</div></div></div></div>` : ''}
    ${t.voiceNote?.url ? `<div class="tk-card"><span class="tk-lbl">Voice note${t.voiceNote.durationSeconds ? ` · ${tkFmtClock(t.voiceNote.durationSeconds)}` : ''}</span><audio class="tk-audio" controls preload="metadata" src="${tkAttr(t.voiceNote.url)}"></audio></div>` : ''}`;

  /* every photo / signature collected so far, at a glance */
  const proofs = [];
  steps.forEach((st, i) => { if (tkPhoto(st)) proofs.push({ kind: 'photo', i, st }); if (tkSigRaw(st)) proofs.push({ kind: 'sig', i, st }); });
  const proofsHtml = proofs.length ? `<div class="tk-card"><div class="tk-card-hdr"><div class="tk-card-ico">🖼</div><h4>Photos &amp; Signatures</h4><span class="tk-pill">${proofs.length}</span></div>
    <div class="tk-proofs">${proofs.map(p => p.kind === 'photo'
      ? `<div class="tk-proof" onclick="openLightbox('${tkAttr(tkPhoto(p.st))}','Step ${p.i + 1} — Photo Proof')"><img loading="lazy" src="${tkAttr(tkPhoto(p.st))}" alt="Photo proof"><span>📷 Step ${p.i + 1}</span></div>`
      : `<div class="tk-proof sig" onclick="tkViewSig(${p.i})"><img src="${tkAttr(tkSigSrc(tkSigRaw(p.st)))}" alt="Signature"><span>✍️ Step ${p.i + 1}${p.st.signatureSignedBy ? ' · ' + esc(p.st.signatureSignedBy) : ''}</span></div>`).join('')}</div></div>` : '';

  const stepsHtml = steps.length
    ? `<div class="tk-card"><div class="tk-card-hdr"><div class="tk-card-ico">☑</div><h4>Steps</h4><span style="margin-left:auto;font-size:12px;font-weight:800;color:var(--primary-light)">${done}/${total} done</span></div>${steps.map((s, i) => tkStepTile(s, i, i === steps.length - 1)).join('')}</div>`
    : '<div class="tbl-empty">No steps defined</div>';

  $('tp-body').innerHTML = info + proofsHtml + stepsHtml;       // one scrolling page: overview → proofs → every step in full
  $('tp-body').scrollTop = 0;
}

/* ── one step (header + expandable evidence) ─────────────────── */
/** Photo / signature accessors (tolerate alternate field names from older API versions). */
const tkPhoto = s => s.submittedPhotoUrl || s.photoUrl || s.submittedPhoto?.url || '';
const tkSigRaw = s => s.signatureData || s.signatureUrl || '';
const tkSigSrc = raw => !raw ? '' : (/^(data:|https?:)/.test(raw) ? raw : 'data:image/png;base64,' + raw);

function tkStepTile(s, i, last) {
  const done = ['completed', 'skipped'].includes(s.status), act = ['in_progress', 'reached'].includes(s.status);
  const col = tkStepColorByStatus(s.status), open = act || done || !!(tkPhoto(s) || tkSigRaw(s) || s.submittedLocation?.coordinates || s.employeeNotes);
  const v = s.validations || {};
  const loc = s.destinationLocation;
  const dest = s.isFieldWorkStep && loc?.address ? `<div class="tk-ev" style="--tk-c:var(--green)"><div class="l">📍 DESTINATION</div><div class="v" style="display:flex;align-items:center;color:var(--green);font-weight:600"><span style="flex:1">${esc(loc.address)}</span>${loc.coordinates ? `<a class="tk-link-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${loc.coordinates[1]},${loc.coordinates[0]}&travelmode=driving" title="Directions">➤</a>` : ''}</div></div>` : '';
  const chips = [];
  if (s.employeeStartTime) chips.push(['▶', 'Started', s.employeeStartTime, 'var(--primary)']);
  if (s.isFieldWorkStep && s.employeeReachTime) chips.push(['📍', 'Reached', s.employeeReachTime, 'var(--amber)']);
  if (s.employeeCompleteTime) chips.push(['✓', 'Done', s.employeeCompleteTime, 'var(--green)']);
  const timing = chips.length ? `<div class="tk-chips">${chips.map((c, k) => `${k ? '<span class="ar">→</span>' : ''}<span class="c" style="--tk-c:${c[3]}">${c[0]} ${c[1]}<i>${tkFmtTime(c[2])}</i></span>`).join('')}</div>` : '';
  const reqs = []; if (v.requirePhoto) reqs.push('📸 Photo'); if (v.requireSignature) reqs.push(`✍️ Signature${v.signatureFrom ? ' (' + esc(v.signatureFrom) + ')' : ''}`);
  if (v.requireLocationCheck) reqs.push(`📍 Destination check${s.locationRadiusMeters ? ' (' + s.locationRadiusMeters + 'm)' : ''}`); if (v.requireLocationTrace) reqs.push('📡 GPS trace');
  const photo = tkPhoto(s), sigRaw = tkSigRaw(s), sig = tkSigSrc(sigRaw);
  const sl = s.submittedLocation?.coordinates;
  const missing = [];
  if (v.requirePhoto && !photo) missing.push('Photo not submitted');
  if (v.requireSignature && !sigRaw) missing.push('Signature missing');
  if (v.requireLocationCheck && !sl) missing.push('Location not submitted');
  return `<div class="tk-st"><div class="tk-st-rail"><div class="tk-st-dot ${done ? 'done' : ''} ${act ? 'act' : ''}" style="--tk-c:${col}">${done ? '✓' : i + 1}</div>${last ? '' : `<div class="tk-st-line ${done ? 'done' : ''}" style="--tk-c:${col}"></div>`}</div>
    <div class="tk-st-box ${act ? 'act' : ''} ${open ? 'open' : ''}" style="--tk-c:${col}">
      <div class="tk-st-head" onclick="this.parentElement.classList.toggle('open')"><div class="tt"><b class="${done ? 'dim' : ''}">${s.isFieldWorkStep ? '<span class="tk-field-tag">Field</span>' : ''}${esc(s.title || 'Step ' + (i + 1))}</b><small>${tkFmtTime(s.startDatetime)} → ${tkFmtTime(s.endDatetime)}</small></div><span class="tk-st-pill">${tkStepStatusLabel(s.status)}</span><span class="tk-st-chev">⌄</span></div>
      <div class="tk-st-body"><hr>
        ${s.description ? `<div style="font-size:12.5px;color:var(--text2);line-height:1.5;margin-bottom:6px;white-space:pre-wrap">${esc(s.description)}</div>` : ''}
        ${reqs.length ? `<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Requires: ${reqs.join(' · ')}</div>` : ''}
        ${dest}${timing}
        ${s.isOverdue ? '<div class="tk-overdue">⚠ Completed after deadline</div>' : ''}
        ${photo ? `<div class="tk-ev" style="--tk-c:var(--amber)"><div class="l">📷 PHOTO PROOF</div><img class="ph" loading="lazy" src="${tkAttr(photo)}" alt="Photo proof" onclick="openLightbox(this.src,'Step ${i + 1} — Photo Proof')" onerror="this.outerHTML='<div class=&quot;tk-banner amber&quot;>Photo could not be loaded</div>'"></div>` : ''}
        ${sigRaw ? `<div class="tk-ev" style="--tk-c:var(--info)"><div class="l">✍️ SIGNATURE</div><div class="tk-sig-box"><img src="${tkAttr(sig)}" alt="Signature"><div style="flex:1;font-size:12px"><b style="color:var(--info)">Signature collected</b>${s.signatureSignedBy ? `<div style="color:var(--text3)">Signed by: ${esc(s.signatureSignedBy)}</div>` : ''}</div><button class="btn btn-ghost btn-sm" onclick="tkViewSig(${i})">View</button></div></div>` : ''}
        ${sl ? `<div class="tk-ev" style="--tk-c:var(--green)"><div class="l">📍 SUBMITTED LOCATION</div><div class="v" style="display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:12px"><span style="flex:1">${sl[1].toFixed(5)}, ${sl[0].toFixed(5)}</span>${s.submittedLocation.accuracyMeters != null ? `<span style="color:var(--text3)">±${Math.round(s.submittedLocation.accuracyMeters)}m</span>` : ''}<a class="tk-link-btn" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${sl[1]},${sl[0]}" title="Open in maps">↗</a></div></div>` : ''}
        ${s.employeeNotes ? `<div class="tk-ev" style="--tk-c:var(--text2)"><div class="l">💬 EMPLOYEE NOTE</div><div class="v" style="white-space:pre-wrap;background:var(--surface3);padding:9px 11px;border-radius:10px">${esc(s.employeeNotes)}</div></div>` : ''}
        ${missing.length ? `<div class="tk-miss"><b>Missing validations</b>${missing.map(m => `• ${esc(m)}<br>`).join('')}</div>` : ''}
      </div></div></div>`;
}

function tkViewSig(i) {
  const s = _tpTask?.steps?.[i]; if (!tkSigRaw(s || {})) return;
  openSigViewer(tkSigRaw(s), s.signatureSignedBy ? 'Signed by ' + s.signatureSignedBy : 'Signature');
}

/* ── actions ──────────────────────────────────────────────────── */
async function cancelCurrentTask() {
  if (!_currentTaskId) return;
  if (!confirm('Cancel Task?\n\nThe employee will be notified. This cannot be undone.')) return;
  const id = _currentTaskId, btn = $('tp-cancel-btn');
  if (btn) btn.disabled = true;
  const res = await tkApi('PATCH', '/tasks/cancel', { taskId: id });
  if (btn) btn.disabled = false;
  if (res?.success) { toast('Task cancelled', 'success'); tkRefreshLists(id); }
  else toast(res?.message || 'Failed to cancel', 'error');
}

/* ══════════════════════════════════════════════════════════════
   LIVE LOCATION + ROUTE HISTORY  (TaskLocationMapSheet equivalent)
   Google Maps.
   · Live  : REST seed (/tasks/live-location) + Socket.IO
             watch_task_location → employee_location stream,
             marker glides between fixes (2 s ease-in-out-cubic),
             green breadcrumb trail (last 500 fixes).
   · Route : /tasks/location-trace → polyline, S/E flags, stats.
══════════════════════════════════════════════════════════════ */
let MV = null;
const tkEase = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // easeInOutCubic
const tkWsUrl = () => BASE.replace(/\/+$/, '').replace(/\/api$/, '');
const tkIsActiveStep = s => ['in_progress', 'travelling', 'reached'].includes(s.status);

async function tkOpenMap(live) {
  if (!_tpTask) return;
  tkEnsureDom();
  tkCloseMap(true);
  MV = { task: _tpTask, taskId: _tpTask._id, live: !!live, sat: false, map: null, iw: null, layers: [], emp: null, empPos: null, trailLine: null,
         anim: null, ws: null, wsConnected: false, wsMsg: '', latest: null, trail: [], liveData: null, trace: [], traceStart: null, traceEnd: null,
         loading: true, error: '', seq: 0 };
  $('tk-map-view').classList.add('open'); document.body.style.overflow = 'hidden';
  $('tkm-title').textContent = _tpTask.title || 'Employee Location';
  $('tkm-sub').textContent = _tpTask.assignedTo?.fullName || _tpTask.assignedTo?.username || '';
  tkMapChrome(); tkMapBottomPanel();
  const m = MV;
  try { await tkGoogle(); } catch (e) { if (MV === m) tkMapMessage(`<div style="font-size:30px">🗺️</div><div style="max-width:420px">${esc(tkMapsError(e))}</div>`, true); return; }
  if (MV !== m) return;
  m.map = new google.maps.Map($('tk-map'), { center: TK_INDIA, zoom: 5, mapTypeId: 'roadmap', gestureHandling: 'greedy', clickableIcons: false,
    fullscreenControl: false, streetViewControl: false, mapTypeControl: false, zoomControl: true });
  m.iw = new google.maps.InfoWindow();
  tkMapLoad();
}

function tkCloseMap(silent) {
  if (!MV) { if (!silent) $('tk-map-view')?.classList.remove('open'); return; }
  tkMapDisconnect();
  if (MV.anim) cancelAnimationFrame(MV.anim.raf);
  tkMapClearLayers(); try { MV.iw?.close(); } catch (e) {}
  if (window.google?.maps?.event && MV.map) google.maps.event.clearInstanceListeners(MV.map);
  const host = $('tk-map'); if (host) host.innerHTML = '';
  MV = null;
  $('tk-map-view')?.classList.remove('open');
  if (!$('tk-form-view')?.classList.contains('open')) document.body.style.overflow = '';
}

function tkMapMessage(html, show) { const m = $('tkm-msg'); if (!m) return; m.innerHTML = html || ''; m.classList.toggle('show', !!show); }

function tkMapSwitch(toLive) {
  if (!MV || MV.live === toLive) return;
  tkMapDisconnect();
  if (MV.anim) cancelAnimationFrame(MV.anim.raf); MV.anim = null;
  MV.live = toLive; MV.empPos = null; MV.latest = null; MV.trail = []; MV.error = ''; MV.wsMsg = '';
  tkMapClearLayers(); tkMapChrome(); tkMapBottomPanel();
  if (MV.map) tkMapLoad();
}

async function tkMapLoad() {
  const m = MV; if (!m) return;
  const my = ++m.seq; m.loading = true; m.error = '';
  tkMapChrome();
  tkMapMessage(`<div class="spinner"></div><div>${m.live ? 'Fetching live position…' : 'Loading route history…'}</div>`, true);
  if (m.live) {
    const res = await tkApi('POST', '/tasks/live-location', { taskId: m.taskId });
    if (MV !== m || my !== m.seq) return;
    if (res?.success) m.liveData = res.data || null; else m.error = res?.message || 'Could not get live location';
    const c = m.liveData?.latestLocation?.coordinates;
    if (c && c.length >= 2) m.empPos = [c[1], c[0]];
    m.loading = false; tkMapMessage('', false);
    tkMapDraw(); tkMapFit();
    tkMapConnect();
  } else {
    const res = await tkApi('POST', '/tasks/location-trace', { taskId: m.taskId });
    if (MV !== m || my !== m.seq) return;
    m.trace = []; m.traceStart = m.traceEnd = null;
    if (res?.success) {
      const list = res.data?.traces || res.data?.locationTrace || res.data?.trace || [];
      m.trace = list.map(t => { const c = t.location?.coordinates || t.coordinates; return c && c.length >= 2 ? [c[1], c[0], t.recordedAt || t.timestamp] : null; }).filter(Boolean);
      if (m.trace.length) { m.traceStart = m.trace[0][2] ? new Date(m.trace[0][2]) : null; m.traceEnd = m.trace[m.trace.length - 1][2] ? new Date(m.trace[m.trace.length - 1][2]) : null; }
    } else m.error = res?.message || 'Could not load route trace';
    m.loading = false;
    if (m.error) { tkMapMessage(`<div style="font-size:30px">⚠️</div><div>${esc(m.error)}</div><button class="btn btn-ghost btn-sm" onclick="tkMapLoad()">Retry</button>`, true); tkMapChrome(); tkMapBottomPanel(); return; }
    tkMapMessage('', false);
    tkMapDraw(); tkMapFit();
  }
  tkMapChrome();
}

function tkMapRefresh() { if (MV && !MV.live && MV.map) { tkMapClearLayers(); tkMapLoad(); } }

/* ── WebSocket (Socket.IO) — same events as ManagerLocationController ── */
async function tkMapConnect() {
  const m = MV; if (!m || !m.live) return;
  m.wsMsg = 'Connecting to live feed…'; tkMapChrome();
  try { await tkLoadScript(TK_SOCKET_SRC, () => !!window.io); } catch (e) { m.wsMsg = 'Could not load the live-update client.'; return tkMapChrome(); }
  if (MV !== m || !m.live) return;
  m.wsMsg = '';
  const socket = io(tkWsUrl(), { transports: ['websocket'], reconnection: true, reconnectionAttempts: 6, reconnectionDelay: 1500 });
  m.ws = socket;
  socket.on('connect', () => socket.emit('watch_task_location', { token: _token, taskId: m.taskId }));   // also re-joins after a reconnect
  socket.on('watching_task_location', () => { m.wsConnected = true; m.wsMsg = ''; tkMapChrome(); });
  socket.on('employee_location', data => {
    if (MV !== m || !m.live || !data) return;
    if (data.taskId && String(data.taskId) !== String(m.taskId)) return;
    const lat = Number(data.lat), lng = Number(data.lng); if (!isFinite(lat) || !isFinite(lng)) return;
    if (m.wsMsg === 'Employee stopped tracking') m.wsMsg = '';
    m.latest = { lat, lng, accuracy: data.accuracy != null ? Number(data.accuracy) : null, battery: data.battery != null ? Number(data.battery) : null, timestamp: data.timestamp ? new Date(data.timestamp) : new Date() };
    m.trail.push([lat, lng]); if (m.trail.length > 500) m.trail.shift();
    tkMapAnimateTo([lat, lng]); tkMapBottomPanel(); tkMapChrome();
  });
  socket.on('tracking_stopped', () => { m.wsMsg = 'Employee stopped tracking'; tkMapChrome(); });
  socket.on('error', d => { m.wsConnected = false; m.wsMsg = (d && d.message) || String(d || 'Live feed error'); tkMapChrome(); });
  socket.on('connect_error', () => { m.wsConnected = false; m.wsMsg = 'Connection failed. Check your network.'; tkMapChrome(); });
  socket.on('disconnect', () => { m.wsConnected = false; m.wsMsg = 'Disconnected — reconnecting…'; tkMapChrome(); });
}
function tkMapDisconnect() {
  const m = MV; if (!m?.ws) return;
  try { m.ws.emit('unwatch_task_location', { taskId: m.taskId }); m.ws.removeAllListeners?.(); m.ws.disconnect(); } catch (e) {}
  m.ws = null; m.wsConnected = false;
}

/** Glide the employee marker from its current position to the new fix (2 s). */
function tkMapAnimateTo(to) {
  const m = MV; if (!m?.map) return;
  if (!m.empPos) { m.empPos = to; tkMapDraw(); tkMapFit(); return; }
  if (m.empPos[0] === to[0] && m.empPos[1] === to[1]) return;
  if (m.anim) cancelAnimationFrame(m.anim.raf);
  const from = m.empPos.slice(), t0 = performance.now();
  const a = m.anim = { raf: 0 };
  const step = now => {
    if (MV !== m || m.anim !== a) return;
    const t = Math.min(1, (now - t0) / 2000), k = tkEase(t);
    m.empPos = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    m.emp?.setPosition({ lat: m.empPos[0], lng: m.empPos[1] }); tkMapDrawTrail();
    if (t < 1) a.raf = requestAnimationFrame(step);
  };
  a.raf = requestAnimationFrame(step);
  const b = m.map.getBounds();
  if (b && !b.contains({ lat: to[0], lng: to[1] })) m.map.panTo({ lat: to[0], lng: to[1] });   // keep the employee in view
}

/* ── Drawing ─────────────────────────────────────────────────── */
function tkMapClearLayers() { if (!MV) return; MV.layers.forEach(l => { try { l.setMap(null); } catch (e) {} }); MV.layers = []; MV.emp = null; MV.trailLine = null; }
function tkMapTrack(layer) { MV.layers.push(layer); return layer; }
function tkMapPopup(marker, html) { marker.addListener('click', () => { MV.iw.setContent(`<div style="color:#111;font-size:12px;line-height:1.45">${html}</div>`); MV.iw.open({ map: MV.map, anchor: marker }); }); }

function tkFlagSvg(label, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 40" width="34" height="40"><rect x="3" y="2" width="3" height="36" rx="1.5" fill="${color}"/><path d="M6 3 L32 9 L6 22 Z" fill="${color}"/><text x="14" y="15" font-size="10" font-weight="900" font-family="Arial,sans-serif" fill="#fff">${label}</text></svg>`;
}
const TK_EMP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="50" height="50"><circle cx="25" cy="25" r="20" fill="#22C55E" fill-opacity=".14"><animate attributeName="r" values="12;24;12" dur="1.8s" repeatCount="indefinite"/><animate attributeName="fill-opacity" values=".3;.05;.3" dur="1.8s" repeatCount="indefinite"/></circle><circle cx="25" cy="27" r="10" fill="#000" fill-opacity=".18"/><circle cx="25" cy="25" r="10" fill="#22C55E" stroke="#fff" stroke-width="3"/><circle cx="21" cy="21" r="2.2" fill="#fff" fill-opacity=".6"/></svg>';
const TK_STATUS_SNIP = { completed: '✅ Completed', in_progress: '🔵 In progress', reached: '📍 Reached', travelling: '🚗 Travelling', skipped: '⏭ Skipped' };
const tkLL = p => ({ lat: p[0], lng: p[1] });

function tkMapDraw() {
  const m = MV; if (!m?.map) return;
  tkMapClearLayers();
  (m.task.steps || []).forEach((s, i) => {                          // numbered destination pins (field-work steps only)
    const c = s.destinationLocation?.coordinates;
    if (!s.isFieldWorkStep || !c || c.length < 2) return;
    const done = ['completed', 'skipped'].includes(s.status), act = tkIsActiveStep(s);
    const mk = tkMapTrack(new google.maps.Marker({ position: { lat: c[1], lng: c[0] }, map: m.map, icon: tkPinIcon(i + 1, tkStepColor(i), act), opacity: done ? .5 : 1, zIndex: act ? 500 : done ? 100 : 300 }));
    tkMapPopup(mk, `<b>Step ${i + 1} · ${esc(s.title || '')}</b><br>${esc(s.destinationLocation?.address || 'Step ' + (i + 1) + ' destination')}<br>${TK_STATUS_SNIP[s.status] || '⏳ Pending'}`);
  });
  if (m.live) {
    if (m.empPos) {
      const name = m.liveData?.employee?.fullName || m.task.assignedTo?.fullName || 'Employee';
      m.emp = tkMapTrack(new google.maps.Marker({ position: tkLL(m.empPos), map: m.map, icon: tkSvgIcon(TK_EMP_SVG, 50, 50, 25, 25), zIndex: 1000 }));
      tkMapPopup(m.emp, `📍 <b>${esc(name)}</b><br>Live position`);
    }
    tkMapDrawTrail();
  } else if (m.trace.length) {
    const pts = m.trace.map(p => ({ lat: p[0], lng: p[1] }));
    if (pts.length >= 2) tkMapTrack(new google.maps.Polyline({ path: pts, map: m.map, strokeColor: '#6366F1', strokeWeight: 5, strokeOpacity: .9, geodesic: false, zIndex: 2 }));
    const st = tkMapTrack(new google.maps.Marker({ position: pts[0], map: m.map, icon: tkSvgIcon(tkFlagSvg('S', '#22C55E'), 34, 40, 4, 38), zIndex: 400 }));
    tkMapPopup(st, `🟢 <b>Route Start</b>${m.traceStart ? '<br>' + tkFmtTime(m.traceStart) : ''}`);
    if (pts.length > 1) {
      const en = tkMapTrack(new google.maps.Marker({ position: pts[pts.length - 1], map: m.map, icon: tkSvgIcon(tkFlagSvg('E', '#EF4444'), 34, 40, 4, 38), zIndex: 400 }));
      tkMapPopup(en, `🔴 <b>Route End</b>${m.traceEnd ? '<br>' + tkFmtTime(m.traceEnd) : ''}`);
    }
  }
  tkMapChrome(); tkMapBottomPanel();
}

function tkMapDrawTrail() {
  const m = MV; if (!m?.live || !m.map) return;
  const raw = m.trail; let pts = [];
  if (raw.length) { if (raw.length > 1) pts = raw.slice(0, -1); pts.push(m.empPos || raw[raw.length - 1]); }
  if (pts.length < 2) { if (m.trailLine) { m.trailLine.setMap(null); m.layers = m.layers.filter(l => l !== m.trailLine); m.trailLine = null; } return; }
  const path = pts.map(tkLL);
  if (!m.trailLine) m.trailLine = tkMapTrack(new google.maps.Polyline({ path, map: m.map, strokeColor: '#22C55E', strokeOpacity: .5, strokeWeight: 4, zIndex: 1 }));
  else m.trailLine.setPath(path);
}

function tkMapFit() {
  const m = MV; if (!m?.map) return;
  const pts = [];
  if (m.live) { if (m.empPos) pts.push(m.empPos); } else m.trace.forEach(p => pts.push([p[0], p[1]]));
  (m.task.steps || []).forEach(s => { const c = s.destinationLocation?.coordinates; if (c && c.length >= 2) pts.push([c[1], c[0]]); });
  if (!pts.length) return;
  if (pts.length === 1) { m.map.setCenter(tkLL(pts[0])); m.map.setZoom(16); return; }
  const b = new google.maps.LatLngBounds();
  pts.forEach(p => b.extend(tkLL(p)));
  m.map.fitBounds(b, 80);
  google.maps.event.addListenerOnce(m.map, 'idle', () => { if (MV === m && m.map.getZoom() > 18) m.map.setZoom(18); });
}
function tkMapSat() {
  const m = MV; if (!m?.map) return;
  m.sat = !m.sat; m.map.setMapTypeId(m.sat ? 'hybrid' : 'roadmap');
}

/* ── Chrome: tabs, status bar, chips, legend ─────────────────── */
function tkMapChrome() {
  const m = MV; if (!m) return;
  $('tkm-tab-live').classList.toggle('on', m.live); $('tkm-tab-route').classList.toggle('on', !m.live);
  $('tkm-refresh').style.display = m.live ? 'none' : '';
  const st = $('tkm-status');
  if (m.live) {
    st.className = 'tk-map-status' + (m.wsConnected && !m.wsMsg ? ' ok' : '');
    st.innerHTML = `<span class="dot"></span>${m.wsMsg ? esc((m.wsConnected ? 'Connected · ' : '') + m.wsMsg) : m.wsConnected ? 'Connected · updates in real-time' : 'Connecting to live feed…'}${m.error && !m.empPos ? ` <span style="color:var(--text3);margin-left:auto">${esc(m.error)}${m.wsConnected ? ' — waiting for first update' : ''}</span>` : ''}`;
  } else {
    st.className = 'tk-map-status';
    st.innerHTML = `<span class="dot"></span>${m.trace.length ? `${m.trace.length} pts recorded · tap refresh to update` : 'No route data yet — tap refresh to load'}`;
  }
  const acc = m.latest?.accuracy ?? m.liveData?.latestLocation?.accuracyMeters;
  $('tkm-chips').innerHTML = m.live
    ? `<span class="live"><i></i>${m.wsConnected ? 'Live' : 'Connecting…'}</span>${acc != null ? `<span class="acc">±${Math.round(acc)}m</span>` : ''}`
    : (m.trace.length ? `<span class="acc">${m.trace.length} points</span>` : '');
  const steps = (m.task.steps || []);
  const rows = steps.map((s, i) => ({ s, i })).filter(x => x.s.isFieldWorkStep && x.s.destinationLocation?.coordinates);
  $('tkm-legend').innerHTML = `<b>Legend</b>${m.live ? '<div class="r"><span class="sw" style="background:#22C55E"></span>Employee (live)</div>' : ''}${rows.map(({ s, i }) => `<div class="r"><span class="sw" style="background:${tkStepColor(i)}"></span>Step ${i + 1}${({ completed: ' ✓', in_progress: ' ●', reached: ' ◎', skipped: ' –' })[s.status] || ''}</div>`).join('')}${m.live ? '' : '<div class="r"><span class="fl" style="background:#22C55E"></span>Start</div><div class="r"><span class="fl" style="background:#EF4444"></span>End</div>'}`;
}

/* ── Bottom panels ───────────────────────────────────────────── */
function tkMapStepRow(s, i, showTime) {
  const col = tkStepColor(i);
  const [lbl, bc] = ({ completed: ['Done', 'var(--green)'], in_progress: ['Active', '#6366F1'], reached: ['Reached', '#6366F1'], skipped: ['Skipped', 'var(--text3)'] })[s.status] || ['Pending', 'var(--text3)'];
  const sub = showTime && s.employeeStartTime ? `${tkFmtTime(s.employeeStartTime)} → ${s.employeeCompleteTime ? tkFmtTime(s.employeeCompleteTime) : '—'}` : (s.destinationLocation?.address || '');
  return `<div class="tk-mrow" style="--tk-c:${col}"><div class="n">${i + 1}</div><div class="t"><b>${esc(s.title || 'Step ' + (i + 1))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="tk-sm-chip" style="--tk-c:${bc}">${lbl}</span></div>`;
}

function tkMapBottomPanel() {
  const m = MV; if (!m) return;
  const field = (m.task.steps || []).map((s, i) => ({ s, i })).filter(x => x.s.isFieldWorkStep);
  let h = '';
  if (m.live) {
    const emp = m.liveData?.employee || m.task.assignedTo || {};
    const battery = m.latest?.battery ?? m.liveData?.latestLocation?.batteryLevel;
    const upd = m.latest?.timestamp || (m.liveData?.latestLocation?.recordedAt ? new Date(m.liveData.latestLocation.recordedAt) : null);
    h = `<div class="tk-live-card">${avatarHTML(emp, { size: 44 })}<div class="nm"><b>${esc(emp.fullName || emp.username || 'Employee')}</b>${upd ? `<small>Updated ${tkFmtTime(upd)}</small>` : '<small>Waiting for the first GPS fix…</small>'}</div>${battery != null ? `<span class="tk-sm-chip" style="--tk-c:${battery > 20 ? 'var(--green)' : 'var(--red)'}">🔋 ${battery}%</span>` : ''}</div>`;
    if (field.length) h += `<div class="tk-sec">DESTINATIONS</div>${field.map(x => tkMapStepRow(x.s, x.i, false)).join('')}`;
  } else {
    const pts = m.trace.map(p => [p[0], p[1]]);
    h = `<div class="tk-stats"><div><b>${m.trace.length}</b><small>GPS PTS</small></div><div><b>${tkDistLabel(pts)}</b><small>DISTANCE</small></div><div><b>${tkDurLabel(m.traceStart, m.traceEnd)}</b><small>DURATION</small></div></div>`;
    if (m.traceStart && m.traceEnd) {
      const total = (m.traceEnd - m.traceStart) / 1000, frac = d => total > 0 && d ? Math.min(1, Math.max(0, ((new Date(d) - m.traceStart) / 1000) / total)) : 0;
      const dots = (m.task.steps || []).map((s, i) => ({ s, i })).filter(x => x.s.employeeStartTime);
      h += `<div class="tk-tbar"><div class="bar"></div><i class="e" style="left:-1px;background:#22C55E"></i><i class="e" style="right:-1px;background:#EF4444"></i>${dots.map(x => `<i class="s" style="left:${(frac(x.s.employeeStartTime) * 100).toFixed(2)}%;background:${tkStepColor(x.i)}" title="Step ${x.i + 1}"></i>`).join('')}</div><div class="tk-tbar-lbl"><span>Start</span><span>End</span></div>`;
    }
    if (field.length) h += `<div class="tk-sec">STEPS COVERED</div>${field.map(x => tkMapStepRow(x.s, x.i, true)).join('')}`;
  }
  $('tkm-bottom').innerHTML = h;
}
