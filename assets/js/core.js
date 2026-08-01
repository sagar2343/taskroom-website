/* ═══════════════════════════════════════════════════════════════
   TASKROOM — CORE: utils, api, auth, storage
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIG ─────────────────────────────────────────────────────────── */
const BASE = 'https://api.taskroom.in/api';
// const BASE = 'http://localhost:3000/api';

/* ── STATE ──────────────────────────────────────────────────────────── */
let _user  = null;
let _token = null;
let _org   = null;

/* Pagination cursors */
let _pg  = 1, _rpg = 1, _tpg = 1, _apg = 1, _mpg = 1;
let _taskFilter = '';
let _currentTaskId = null, _currentRoomId = null;

/* Task wizard state */
let _ctRoom = null, _ctMembers = [], _ctSelectedIds = new Set(), _ctSteps = [], _wzStep = 1;

/* Map state */
let _map = null, _mapPolyline = null, _mapTileLayer = null, _mapSatellite = false;

/* Misc */
let _debounceTimers = {};
let _landingPlans   = [];
let _billingCycle   = 'monthly';

/* ── UTILS ──────────────────────────────────────────────────────────── */
const esc = s => {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(s || ''));
  return d.innerHTML;
};
const $ = id => document.getElementById(id);

/* ── Avatar helper — profile picture with initials fallback ──────────
   Used everywhere a user avatar is rendered: sidebar, tables, cards,
   task panels, member pickers. Pass the user/member object and options.
   opts: { size:number (px, default 34), online:boolean (show status dot) }
──────────────────────────────────────────────────────────────────── */
function avatarHTML(user, opts = {}) {
  const size = opts.size || 34;
  const pic  = user?.profilePicture || user?.avatar || '';
  const init = (user?.fullName || user?.username || '?').trim()[0]?.toUpperCase() || '?';
  const dotSize = size >= 34 ? 9 : 8;
  const dot = opts.online
    ? `<div style="position:absolute;bottom:-2px;right:-2px;width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${user?.isOnline ? 'var(--green)' : 'var(--text3)'};border:2px solid var(--surface2)"></div>`
    : '';
  const inner = pic
    ? `<img src="${esc(pic)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.textContent='${init}'">`
    : init;
  return `<div class="avatar" style="position:relative;width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px;flex-shrink:0">${inner}${dot}</div>`;
}

const fmtDate = d => {
  if (!d) return '—';
  const t = new Date(d);
  return `${t.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getMonth()]} ${t.getFullYear()}`;
};
const fmtDT = d => {
  if (!d) return '—';
  const t = new Date(d);
  const h = t.getHours() % 12 || 12, m = String(t.getMinutes()).padStart(2,'0'), p = t.getHours() >= 12 ? 'PM' : 'AM';
  return `${t.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getMonth()]} · ${h}:${m} ${p}`;
};
const fmtTime = d => {
  if (!d) return '—';
  const t = new Date(d);
  const h = t.getHours() % 12 || 12, m = String(t.getMinutes()).padStart(2,'0'), p = t.getHours() >= 12 ? 'PM' : 'AM';
  return `${h}:${m} ${p}`;
};
const fmtMins  = m => { if (!m) return '0m'; const h = Math.floor(m / 60), mn = Math.round(m % 60); return h ? `${h}h ${mn}m` : `${mn}m`; };
const fmtINR   = n => '₹' + (n || 0).toLocaleString('en-IN');
const isOverdue = d => d && new Date(d) < new Date();

function debounce(key, fn, delay) {
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(fn, delay);
}

/* ── STORAGE ─────────────────────────────────────────────────────────── */
const SK = 'taskroom_v3';
function save() {
  try { localStorage.setItem(SK, JSON.stringify({ user: _user, token: _token, org: _org })); } catch(e) {}
}
function loadStorage() {
  try {
    const d = JSON.parse(localStorage.getItem(SK) || '{}');
    _user = d.user || null; _token = d.token || null; _org = d.org || null;
  } catch(e) {}
}
function clearStorage() {
  _user = null; _token = null; _org = null;
  try { localStorage.removeItem(SK); } catch(e) {}
}

/* ── THEME ───────────────────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('taskroom_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const btn = $('theme-toggle-btn');
  if (btn) btn.textContent = saved === 'light' ? '🌙' : '☀️';
}
function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('taskroom_theme', next);
  const btn = $('theme-toggle-btn');
  if (btn) btn.textContent = next === 'light' ? '🌙' : '☀️';
  applyMobNavTheme();
}

/* ── HTTP ────────────────────────────────────────────────────────────── */
async function api(method, path, body, token, extraHeaders = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...extraHeaders } };
  if (token || _token) opts.headers['Authorization'] = 'Bearer ' + (token || _token);
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  if (r.status === 401 && (token || _token)) {
    clearStorage(); showLanding();
    toast('Session expired — please sign in again.', 'error');
    throw new Error('Unauthorized');
  }
  return r.json();
}

/* ── MODAL HELPERS ───────────────────────────────────────────────────── */
function openM(id)  { $(id)?.classList.add('open'); }
function closeM(id) { $(id)?.classList.remove('open'); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.overlay.open').forEach(m => m.classList.remove('open'));
    closeTaskPanel();
    $('att-panel')?.classList.remove('open');
  }
});
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
  });
});

/* ── TOAST ───────────────────────────────────────────────────────────── */
function toast(m, t = 'info') {
  const c = { success:'rgba(16,185,129,.25)', error:'rgba(239,68,68,.25)', info:'rgba(19,127,236,.2)', amber:'rgba(245,158,11,.2)' };
  const ic = { success:'✅', error:'❌', info:'ℹ️', amber:'⚠️' };
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9998;background:var(--surface);border:1px solid ${c[t]||c.info};color:var(--text);padding:12px 16px;border-radius:12px;font-size:14px;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.5);display:flex;align-items:center;gap:8px;opacity:0;transform:translateY(8px);transition:all .3s;max-width:340px;font-family:'Sora',sans-serif`;
  el.innerHTML = `<span>${ic[t]||'ℹ️'}</span><span style="flex:1">${esc(m)}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 400); }, 3500);
}

/* ── ALERTS ──────────────────────────────────────────────────────────── */
function showA(id, t, m) { const el = $(id); if (el) el.innerHTML = `<div class="alert alert-${t}">${m}</div>`; }
function clearA(id) { const el = $(id); if (el) el.innerHTML = ''; }

/* ── PAGINATION ──────────────────────────────────────────────────────── */
function renderPg(elId, p, cur, fn) {
  const el = $(elId); if (!el) return;
  if (!p || p.totalPages <= 1) { el.innerHTML = ''; return; }
  let h = `<button class="pg-btn" onclick="${fn}(${cur-1})" ${cur<=1?'disabled':''}>‹</button>`;
  for (let i = 1; i <= p.totalPages; i++) {
    if (Math.abs(i - cur) < 3 || i === 1 || i === p.totalPages)
      h += `<button class="pg-btn ${i===cur?'active':''}" onclick="${fn}(${i})">${i}</button>`;
    else if (Math.abs(i - cur) === 3)
      h += `<span style="color:var(--text3);padding:0 4px">…</span>`;
  }
  h += `<button class="pg-btn" onclick="${fn}(${cur+1})" ${cur>=p.totalPages?'disabled':''}>›</button>`;
  el.innerHTML = h;
}

/* ── COPY CODE ───────────────────────────────────────────────────────── */
function copyCode() {
  if (!_org?.code) return;
  navigator.clipboard?.writeText(_org.code)
    .then(() => toast('Org code copied: ' + _org.code, 'success'))
    .catch(() => {
      const el = document.createElement('textarea');
      el.value = _org.code; document.body.appendChild(el);
      el.select(); document.execCommand('copy'); el.remove();
      toast('Code copied!', 'success');
    });
}

/* ── LOGOUT ──────────────────────────────────────────────────────────── */
function logout() {
  clearStorage(); showLanding();
  document.querySelectorAll('.overlay.open').forEach(m => m.classList.remove('open'));
}

/* ── PLAN RANK ───────────────────────────────────────────────────────── */
const PLAN_RANK = { starter: 0, growth: 1, business: 2, enterprise: 3 };
function planRank(slug) { return PLAN_RANK[slug] ?? -1; }
function fmtLimit(v)    { return v === -1 || v === 99999 ? '∞' : v; }
