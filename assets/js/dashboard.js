/* ═══════════════════════════════════════════════════════════════
   TASKROOM — DASHBOARD JAVASCRIPT
   All page loaders, detail panels, maps, mobile nav
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════════
   VIEW SWITCHER
══════════════════════════════════════════════════════════════ */
function showLanding() {
  $('landing-view').style.display  = '';
  $('dashboard-view').style.display = 'none';
  const ln = $('land-nav'); if (ln) ln.style.display = '';
  const mn = $('main-nav'); if (mn) mn.style.display = 'none';
  // Show sticky CTA again when back on landing
  const cta = $('sticky-cta-bar'); if (cta) cta.style.display = '';
 
  // ── ANIMATION LIFECYCLE HOOK ──
  // Tell the particle field and cursor they're visible again.
  if (typeof window._onLandingShow === 'function') window._onLandingShow();
 
  setTimeout(initLandingAnimations, 100);
}

function showDash() {
  if (!_token || !_user) {
    clearStorage(); showLanding();
    setTimeout(() => { showLogin(); toast('Session expired. Please sign in.', 'error'); }, 200);
    return;
  }
  $('landing-view').style.display   = 'none';
  if (typeof window._onLandingHide === 'function') window._onLandingHide();
  $('dashboard-view').style.display = 'block';
  // Hide landing nav and sticky CTA when in dashboard
  const ln = $('land-nav'); if (ln) ln.style.display = 'none';
  const cta = $('sticky-cta-bar');
  if (cta) { cta.classList.remove('visible'); cta.style.display = 'none'; }
  const mn = $('main-nav');
  if (mn) {
    mn.style.display = 'flex';
    mn.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;min-width:0">
        <button id="sb-toggle" onclick="toggleSidebar()" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:7px 9px;cursor:pointer;color:var(--text2);display:flex;align-items:center;flex-shrink:0" aria-label="Toggle sidebar">☰</button>
        <div class="logo-icon" style="flex-shrink:0"><img src="./app_icon.png" alt="TaskRoom" width="28" height="28"></div>
        <span class="logo-text" style="font-size:15px;white-space:nowrap">Task<span style="color:var(--primary-light)">Room</span></span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span class="badge badge-${_user?.role||'employee'}" style="display:none" id="dash-role-badge">${_user?.role||'employee'}</span>
        <span style="font-size:12.5px;color:var(--text2);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:none" id="dash-user-label">${esc(_user?.fullName||_user?.username||'User')}</span>
        <button class="btn btn-ghost btn-sm" onclick="logout()" style="flex-shrink:0;font-size:12px;padding:6px 12px">Sign Out</button>
      </div>`;
    // Show extra info only on wider screens
    const roleB = mn.querySelector('#dash-role-badge');
    const userL = mn.querySelector('#dash-user-label');
    function updateNavLabels() {
      const w = window.innerWidth;
      if (roleB) roleB.style.display = w >= 480 ? '' : 'none';
      if (userL) userL.style.display = w >= 640 ? '' : 'none';
    }
    updateNavLabels();
    window._dashNavResize = updateNavLabels;
    window.removeEventListener('resize', window._dashNavResizePrev);
    window.addEventListener('resize', updateNavLabels);
    window._dashNavResizePrev = updateNavLabels;
  }
  fillSidebar(); applyRoleUI();
  showPage('overview', $('nav-overview'));
  loadDashData(); loadBillingStatus();
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  $('mob-nav-overview')?.classList.add('active');
}

function toggleSidebar() {
  const sb = $('sidebar'); if (!sb) return;
  const willOpen = !sb.classList.contains('open');
  sb.classList.toggle('open');
  const overlay = $('sidebar-overlay');
  if (overlay) overlay.classList.toggle('show', willOpen);
  const btn = $('sb-toggle');
  if (btn) btn.textContent = willOpen ? '✕' : '☰';
}

function applyRoleUI() {
  const isManager = _user?.role === 'manager';
  document.querySelectorAll('.manager-only').forEach(el => el.style.display = isManager ? '' : 'none');
}

function fillSidebar() {
  if (!_org) return;
  const av = $('sb-av');
  if (av) {
    if (_user?.profilePicture) {
      av.innerHTML = `<img src="${esc(_user.profilePicture)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.remove();this.parentElement.textContent='${(_user?.fullName||_user?.username||'U')[0].toUpperCase()}'">`;
    } else {
      av.textContent = (_user?.fullName || _user?.username || 'U')[0].toUpperCase();
    }
  }
  if ($('sb-uname')) $('sb-uname').textContent = _user?.fullName || _user?.username || 'User';
  if ($('sb-urole')) { $('sb-urole').textContent = _user?.role || 'employee'; $('sb-urole').className = 'sb-role ' + (_user?.role || 'employee'); }
  if ($('sb-orgname'))  $('sb-orgname').textContent  = _org.name || '';
  if ($('sb-code-val')) $('sb-code-val').textContent = _org.code || '—';
  if ($('ov-code'))     $('ov-code').textContent     = _org.code || '—';
}

/* ── Page navigation ─────────────────────────────────────────── */
function showPage(id, el) {
  document.querySelectorAll('.dash-page').forEach(p => p.classList.remove('active'));
  $('page-' + id)?.classList.add('active');
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  closeTaskPanel();
  $('att-panel')?.classList.remove('open');
  $('sidebar')?.classList.remove('open');
  $('sidebar-overlay')?.classList.remove('show');
  _mobCurrentPage = id;
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  $('mob-nav-' + id)?.classList.add('active');
  hideMobBackBar(); closeMobDrawer();

  const loaders = {
    overview:   () => loadDashData(),
    org:        () => loadOrgPageData(),
    members:    () => loadMembers(1),
    rooms:      () => loadRooms(1),
    tasks:      () => loadTasks(1),
    attendance: () => loadAttendance(1),
    analytics:  () => loadAnalytics(),
    billing:    () => loadBilling(),
  };
  if (loaders[id]) loaders[id]();
}

/* ══════════════════════════════════════════════════════════════
   ORG / DASH DATA
══════════════════════════════════════════════════════════════ */
async function refreshOrgData() {
  if (!_token) return;
  const oid = _user?.organization?._id || _user?.organization || _org?._id;
  if (!oid) return;
  try {
    const od = await api('GET', '/organization/detail/' + oid);
    if (od.success) { _org = { ..._org, ...(od.data?.organization || od.data) }; save(); }
  } catch(e) { console.warn('[refreshOrgData]', e); }
}

async function loadOrgPageData() {
  const og = $('org-grid');
  const os = $('org-settings');
  if (og) og.innerHTML = '<div class="loading" style="padding:24px"><div class="spinner"></div></div>';
  if (os) os.innerHTML = '<div class="loading" style="padding:24px"><div class="spinner"></div></div>';
  await refreshOrgData();
  fillOrgPage();
}

async function loadDashData() {
  if (!_token) return;
  const h = new Date().getHours();
  if ($('ov-greeting')) $('ov-greeting').textContent = (h<12?'Good morning':h<17?'Good afternoon':'Good evening') + ', ' + (_user?.fullName||'').split(' ')[0] + '  👋';
  if ($('ov-date'))     $('ov-date').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  ['s-emp','s-rooms'].forEach(id => { const el=$(id); if(el) el.innerHTML='<span class="skeleton" style="display:inline-block;width:36px;height:26px;border-radius:5px"></span>'; });

  await refreshOrgData();
  fillOrgStats();

  if (_user?.role === 'manager') {
    const isNewOrg = (_org?.stats?.totalEmployees||0) === 0 && (_org?.stats?.totalRooms||0) === 0;
    const bannerEl = $('ov-onboard-banner');
    if (bannerEl) {
      bannerEl.innerHTML = isNewOrg ? `
        <div style="background:linear-gradient(135deg,rgba(19,127,236,.12),rgba(19,127,236,.04));border:1px solid rgba(19,127,236,.2);border-radius:12px;padding:22px 24px;margin-bottom:20px">
          <div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--text)">🚀 Welcome to TaskRoom! Here's how to get started:</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--surface2);border-radius:8px;cursor:pointer" onclick="openCreateRoom()">
              <div style="width:30px;height:30px;border-radius:6px;background:rgba(19,127,236,.15);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">🏠</div>
              <div style="flex:1"><div style="font-size:13.5px;font-weight:600">Step 1 — Create a Room</div><div style="font-size:12px;color:var(--text2)">Rooms organise your team by project or region</div></div>
              <div style="color:var(--primary-light);font-size:13px">→</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--surface2);border-radius:8px;cursor:pointer" onclick="openInviteHelper()">
              <div style="width:30px;height:30px;border-radius:6px;background:rgba(16,185,129,.15);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">👥</div>
              <div style="flex:1"><div style="font-size:13.5px;font-weight:600">Step 2 — Invite Employees</div><div style="font-size:12px;color:var(--text2)">Share your org code <strong style="font-family:monospace;color:var(--primary-light)">${_org?.code||''}</strong></div></div>
              <div style="color:var(--primary-light);font-size:13px">→</div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--surface2);border-radius:8px;cursor:pointer" onclick="showPage('tasks',document.getElementById('nav-tasks'))">
              <div style="width:30px;height:30px;border-radius:6px;background:rgba(245,158,11,.15);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">✅</div>
              <div style="flex:1"><div style="font-size:13.5px;font-weight:600">Step 3 — Assign Your First Task</div><div style="font-size:12px;color:var(--text2)">Multi-step tasks with photo &amp; signature proof</div></div>
              <div style="color:var(--primary-light);font-size:13px">→</div>
            </div>
          </div>
        </div>` : '';
    }
    loadTaskDashboard();
  }
}

function fillOrgStats() {
  if (!_org) return;
  if ($('s-emp'))   $('s-emp').textContent   = _org.stats?.totalEmployees ?? '—';
  if ($('s-rooms')) $('s-rooms').textContent = _org.stats?.totalRooms     ?? '—';
  fillOrgPage();
}

async function loadTaskDashboard() {
  try {
    const d = await api('GET', '/tasks/dashboard');
    if (!d.success) return;
    const s = d.data?.summary || {};
    if ($('s-inprog')) $('s-inprog').textContent = s.in_progress || 0;
    if ($('s-missed')) $('s-missed').textContent = (s.missed||0) + (s.overdue||0);
    if ($('s-comp'))   $('s-comp').textContent   = s.completed || 0;
    const active = (s.in_progress||0) + (s.pending||0);
    const b = $('sb-task-badge'); if (b) { b.style.display = active > 0 ? '' : 'none'; b.textContent = active; }
    renderTodayTasks(d.data?.todayTasks || []);
    renderEmpActivity(d.data?.employeeActivity || []);
  } catch(e) { console.error(e); }
}

async function refreshDash() {
  ['s-emp','s-rooms'].forEach(id => { const el=$(id); if(el) el.innerHTML='<span class="skeleton" style="display:inline-block;width:36px;height:26px;border-radius:5px"></span>'; });
  await refreshOrgData(); fillOrgStats();
  if (_user?.role === 'manager') loadTaskDashboard();
  toast('Refreshed', 'success');
}

function renderTodayTasks(tasks) {
  const el = $('today-tasks-list');
  if (!tasks.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px"><div style="font-size:28px;margin-bottom:8px">✅</div><div style="font-weight:600;color:var(--text2);margin-bottom:4px">No tasks yet</div><div style="font-size:12px">Create a room first, then assign tasks to your team.</div>${_user?.role==='manager'?`<button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openCreateRoom()">+ Create Your First Room</button>`:''}</div>`;
    return;
  }
  el.innerHTML = tasks.slice(0,6).map(t => {
    const pct  = t.totalSteps > 0 ? Math.round((t.completedSteps||0)/t.totalSteps*100) : 0;
    const scls = {'pending':'badge-pending','in_progress':'badge-in-progress','completed':'badge-completed','cancelled':'badge-cancelled'}[t.status]||'badge-pending';
    return `<div class="today-task" onclick="openTaskPanel('${t._id}')">
      <div class="today-task-top"><div class="today-task-name">${esc(t.title)}</div><div class="badge ${scls}" style="font-size:10px;flex-shrink:0">${(t.status||'').replace('_',' ')}</div></div>
      <div class="today-task-meta"><span>${esc(t.assignedTo?.fullName||t.assignedTo?.username||'—')}</span><span>·</span><span>${esc(t.room?.name||'—')}</span><span style="${isOverdue(t.endDatetime)&&t.status!=='completed'?'color:var(--red)':''}">⏰ ${fmtTime(t.endDatetime)}</span>${t.totalSteps>0?`<span>· ${pct}%</span>`:''}</div>
    </div>`;
  }).join('');
}

function renderEmpActivity(activity) {
  const el = $('emp-activity-grid');
  const onlineCnt = activity.filter(a => a.employee?.isOnline).length;
  const oc = $('ov-online-count'); if (oc) oc.textContent = onlineCnt > 0 ? `${onlineCnt} online now` : '';
  if (!activity.length) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;grid-column:1/-1"><div style="font-size:26px;margin-bottom:8px">👥</div><div style="font-weight:600;color:var(--text2);margin-bottom:4px">No employees yet</div><div style="font-size:12px">Share your org code <strong style="color:var(--primary-light);font-family:monospace">${_org?.code||''}</strong> with your team.</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="openInviteHelper()">📤 Invite Employees</button></div>`;
    return;
  }
  el.innerHTML = activity.map(a => {
    const u = a.employee;
    return `<div class="emp-ac">${avatarHTML(u, {size:38, online:true})}<div style="min-width:0"><div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u?.fullName||u?.username||'—')}</div><div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.activeTask||'No active task')}</div><div class="badge ${a.taskStatus==='in_progress'?'badge-in-progress':'badge-pending'}" style="font-size:9.5px;margin-top:3px">${(a.taskStatus||'pending').replace('_',' ')}</div></div></div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   ORG PAGE
══════════════════════════════════════════════════════════════ */
function fillOrgPage() {
  if (!_org) return;
  if ($('org-av')) $('org-av').textContent = (_org.name||'O')[0].toUpperCase();
  if ($('org-n'))  $('org-n').textContent  = _org.name || '—';
  if ($('org-e'))  $('org-e').textContent  = _org.contactEmail || '—';
  if ($('org-c'))  $('org-c').textContent  = _org.code || '—';

  const plan = _org.effectivePlan || _org.plan || 'starter';
  const planEl = $('org-plan-badge');
  if (planEl) { planEl.className = `badge badge-${plan}`; planEl.textContent = plan.charAt(0).toUpperCase()+plan.slice(1)+((_org.isTrialActive&&_org.trialEndsAt&&new Date()<new Date(_org.trialEndsAt))?' (Trial)':''); }
  const sb = $('org-status');
  if (sb) {
    if (_org.isSuspended)   { sb.className='badge badge-suspended'; sb.textContent='● Suspended'; }
    else if (!_org.isActive){ sb.className='badge badge-inactive';  sb.textContent='● Inactive'; }
    else                    { sb.className='badge badge-active';    sb.textContent='● Active'; }
  }
  const a    = _org.address || {};
  const addr = [a.city, a.state, a.country].filter(Boolean).join(', ') || '—';
  const og   = $('org-grid');
  if (og) og.innerHTML = `<div class="org-di"><label>Phone</label><div class="val">${esc(_org.contactPhone||'—')}</div></div><div class="org-di"><label>Domain</label><div class="val">${esc(_org.domain||'—')}</div></div><div class="org-di"><label>Address</label><div class="val">${esc(addr)}</div></div><div class="org-di"><label>Employees</label><div class="val">${_org.stats?.totalEmployees||0}</div></div><div class="org-di"><label>Managers</label><div class="val">${_org.stats?.totalManagers||0}</div></div><div class="org-di"><label>Rooms</label><div class="val">${_org.stats?.totalRooms||0}</div></div><div class="org-di"><label>Created</label><div class="val">${fmtDate(_org.createdAt)}</div></div>`;

  const limits = _org.limits || { maxEmployees:20, maxRooms:5, historyDays:7, gpsTrace:false, exportReports:false, productivityScores:false };
  const lf = limits.features || limits;
  const os = $('org-settings');
  if (os) os.innerHTML = `<div class="sc c-blue"><div class="sc-icon">🏠</div><div class="sc-label">Max Rooms</div><div class="sc-value">${fmtLimit(limits.maxRooms)}</div></div><div class="sc c-green"><div class="sc-icon">👥</div><div class="sc-label">Max Employees</div><div class="sc-value">${fmtLimit(limits.maxEmployees)}</div></div><div class="sc c-teal"><div class="sc-icon">🧑‍💼</div><div class="sc-label">Max Managers</div><div class="sc-value">${fmtLimit(limits.maxManagers??1)}</div></div><div class="sc c-amber"><div class="sc-icon">📅</div><div class="sc-label">History Days</div><div class="sc-value">${fmtLimit(limits.historyDays)}</div></div><div class="sc c-${(lf.liveTracking||lf.gpsTrace)?'purple':'red'}"><div class="sc-icon">📍</div><div class="sc-label">GPS Trace</div><div class="sc-value" style="font-size:18px">${(lf.liveTracking||lf.gpsTrace)?'✅':'❌'}</div></div><div class="sc c-${lf.exportReports?'teal':'red'}"><div class="sc-icon">📄</div><div class="sc-label">Exports</div><div class="sc-value" style="font-size:18px">${lf.exportReports?'✅':'❌'}</div></div><div class="sc c-purple" onclick="copyCode()" style="cursor:pointer"><div class="sc-icon">🔑</div><div class="sc-label">Org Code</div><div class="sc-value" style="font-size:16px;letter-spacing:2px">${_org.code||'—'}</div><div class="sc-sub">Click to copy</div></div>`;

  const trial = $('org-trial-block');
  if (trial) {
    if (_org.isTrialActive && _org.trialEndsAt && new Date() < new Date(_org.trialEndsAt)) {
      const days = Math.max(0, Math.ceil((new Date(_org.trialEndsAt)-new Date())/86400000));
      const tp   = (_org.effectivePlan||'growth').charAt(0).toUpperCase()+(_org.effectivePlan||'growth').slice(1);
      trial.innerHTML = `<div class="plan-trial-banner"><div class="trial-days-ring">${days}</div><div><div style="font-size:14px;font-weight:700;color:var(--amber)">${tp} Trial Active — ${days} day${days!==1?'s':''} remaining</div><div style="font-size:12.5px;color:var(--text2);margin-top:4px">Upgrade before the trial ends to keep all features.</div><button class="btn btn-amber btn-sm" style="margin-top:10px" onclick="showPage('billing',$('nav-billing'))">Upgrade Plan →</button></div></div>`;
    } else trial.innerHTML = '';
  }
}

/* ══════════════════════════════════════════════════════════════
   BILLING
══════════════════════════════════════════════════════════════ */
async function loadBillingStatus() {
  if (!_token || _user?.role !== 'manager') return;
  try {
    const d = await api('GET', '/billing/status');
    if (!d.success) return;
    const s = d.data;
    const tb = $('sb-trial-badge'); if (tb) { tb.style.display=(s.isTrialActive&&s.trialDaysLeft>0)?'':'none'; if(s.isTrialActive) tb.textContent=`${s.trialDaysLeft}d`; }
    const pb = $('sb-pro-badge');   if (pb) pb.style.display = (planRank(s.effectivePlan)>=1) ? '' : 'none';
    if (_org) { Object.assign(_org, { plan:s.plan, effectivePlan:s.effectivePlan, isTrialActive:s.isTrialActive, trialEndsAt:s.trialEndsAt, planExpiresAt:s.planExpiresAt, limits:s.limits, billableSeats:s.billableSeats }); save(); }
    renderDashTrialBanner(s);
    fillOrgPage();
  } catch(e) {}
}

function renderDashTrialBanner(s) {
  let el = $('dash-trial-banner');
  if (!el) { el = document.createElement('div'); el.id = 'dash-trial-banner'; $('dash-main')?.prepend(el); }
  if (!s) { el.innerHTML = ''; return; }
  const { isTrialActive, trialDaysLeft, plan, effectivePlan, subscriptionDaysLeft, trialEndsAt, planExpiresAt } = s;
  let content = '';
  if (isTrialActive && trialDaysLeft > 0) {
    const cap = (effectivePlan||'growth').charAt(0).toUpperCase()+(effectivePlan||'growth').slice(1);
    content = `<div class="dash-alert-strip dash-alert-blue"><span>⏳ <strong>${trialDaysLeft} days left</strong> on your free ${cap} trial</span><button class="dash-alert-btn" onclick="showPage('billing',$('nav-billing'))">Upgrade Now</button></div>`;
  } else if (subscriptionDaysLeft > 0 && subscriptionDaysLeft <= 7) {
    const cap = (effectivePlan||plan||'').charAt(0).toUpperCase()+(effectivePlan||plan||'').slice(1);
    content = `<div class="dash-alert-strip dash-alert-amber"><span>⚠️ Your ${cap} plan <strong>expires in ${subscriptionDaysLeft} days</strong></span><button class="dash-alert-btn" onclick="showPage('billing',$('nav-billing'))">Renew Now</button></div>`;
  }
  el.innerHTML = content;
}

async function loadBilling() {
  const body = $('billing-body');
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const [statusR, plansR, histR] = await Promise.all([
      api('GET', '/billing/status'), api('GET', '/billing/plans'), api('GET', '/billing/history'),
    ]);
    if (!statusR.success) { body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Failed to load billing</h3><p>${esc(statusR.message||'Unknown error')}</p></div>`; return; }
    const status  = statusR.data || {};
    const plans   = (plansR.success  ? plansR.data  : []) || [];
    const history = (histR.success   ? histR.data   : []) || [];
    renderDashTrialBanner(status);
    body.innerHTML = buildBillingHTML(status, plans, history);
  } catch(e) {
    body.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>Failed to load billing</h3><p>${esc(e.message)}</p></div>`;
  }
}

function buildBillingHTML(status, plans, history) {
  const { isTrialActive, trialDaysLeft, plan, effectivePlan, billableSeats, trialEndsAt, planExpiresAt, subscriptionDaysLeft, lastPayment } = status;
  let html = '';

  // Status banner
  if (isTrialActive && trialDaysLeft > 0) {
    const cap = (effectivePlan||'growth').charAt(0).toUpperCase()+(effectivePlan||'growth').slice(1);
    html += `<div class="bill-banner bill-banner-blue"><div class="bill-banner-icon">⏳</div><div class="bill-banner-body"><div class="bill-banner-title">14-day Trial — ${trialDaysLeft} day${trialDaysLeft!==1?'s':''} left</div><div class="bill-banner-sub">You're on the ${cap} plan trial. Upgrade before ${fmtDate(trialEndsAt)} to keep access.</div></div></div>`;
  } else if (subscriptionDaysLeft > 0 && subscriptionDaysLeft <= 7) {
    const cap = (effectivePlan||plan||'').charAt(0).toUpperCase()+(effectivePlan||plan||'').slice(1);
    html += `<div class="bill-banner bill-banner-amber"><div class="bill-banner-icon">⚠️</div><div class="bill-banner-body"><div class="bill-banner-title">Expires in ${subscriptionDaysLeft} day${subscriptionDaysLeft!==1?'s':''}</div><div class="bill-banner-sub">Renew your ${cap} plan now. Valid until ${fmtDate(planExpiresAt)}.</div></div></div>`;
  } else if (!isTrialActive && planRank(effectivePlan) > 0) {
    const cap = (effectivePlan||'').charAt(0).toUpperCase()+(effectivePlan||'').slice(1);
    html += `<div class="bill-banner bill-banner-green"><div class="bill-banner-icon">✓</div><div class="bill-banner-body"><div class="bill-banner-title">${cap} Plan — Active</div><div class="bill-banner-sub">${planExpiresAt?`Valid until ${fmtDate(planExpiresAt)} · `:''}${billableSeats||0} billable seat${(billableSeats||0)!==1?'s':''}</div></div></div>`;
  } else {
    html += `<div class="bill-banner bill-banner-grey"><div class="bill-banner-icon">ℹ️</div><div class="bill-banner-body"><div class="bill-banner-title">Starter Plan</div><div class="bill-banner-sub">Upgrade to unlock live GPS, analytics, exports, and more.</div></div></div>`;
  }

  // Stats
  html += `<div class="stat-grid" style="margin-bottom:20px">
    <div class="sc c-blue"><div class="sc-icon">💎</div><div class="sc-label">Effective Plan</div><div class="sc-value" style="font-size:20px;text-transform:capitalize">${effectivePlan||'starter'}</div></div>
    <div class="sc c-green"><div class="sc-icon">👥</div><div class="sc-label">Billable Seats</div><div class="sc-value">${billableSeats||0}</div><div class="sc-sub">emp + managers</div></div>
    <div class="sc c-amber"><div class="sc-icon">📅</div><div class="sc-label">${isTrialActive?'Trial Ends':'Plan Expires'}</div><div class="sc-value" style="font-size:15px">${(isTrialActive?trialEndsAt:planExpiresAt)?fmtDate(isTrialActive?trialEndsAt:planExpiresAt):'—'}</div></div>
    ${lastPayment?`<div class="sc c-purple"><div class="sc-icon">💳</div><div class="sc-label">Last Payment</div><div class="sc-value" style="font-size:16px">${fmtINR(lastPayment.amountINR||0)}</div><div class="sc-sub">${fmtDate(lastPayment.paidAt)}</div></div>`:''}
  </div>`;

  // Cycle toggle
  html += `<div class="bill-cycle-toggle" style="margin-bottom:20px">
    <button class="bill-cycle-btn ${_billingCycle==='monthly'?'active':''}" onclick="setBillingCycle('monthly')">Monthly</button>
    <button class="bill-cycle-btn ${_billingCycle==='annual'?'active':''}" onclick="setBillingCycle('annual')">Annual <span class="bill-cycle-save">−16%</span></button>
  </div>`;

  // Plan cards
  html += '<h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Choose a Plan</h3><div class="bill-plans-grid">';
  plans.forEach(p => {
    const slug   = p.slug || p.id || '';
    const isCurrentActual = !isTrialActive && plan === slug;
    const isTrialPlan     = isTrialActive && effectivePlan === slug;
    const isHigher        = planRank(slug) > planRank(plan||'starter');
    const isEnterprise    = !!p.isContactSales;
    const monthly  = p.monthlyPrice || 0;
    const yearly   = p.yearlyPrice  || 0;
    const amount   = _billingCycle === 'annual' && yearly > 0 ? yearly : monthly;
    const perMo    = _billingCycle === 'annual' && yearly > 0 ? Math.round(yearly/12) : monthly;
    const lv = v => (v == null || v === -1 || v === 99999) ? '∞' : v;

    let priceHtml;
    if (isEnterprise)       priceHtml = `<div class="bill-plan-price" style="font-size:24px">Custom</div><div class="bill-plan-cycle">${monthly > 0 ? '₹'+monthly.toLocaleString('en-IN')+'+/month' : 'Contact for pricing'}</div>`;
    else if (monthly === 0) priceHtml = `<div class="bill-plan-price">Free</div><div class="bill-plan-cycle">forever</div>`;
    else                    priceHtml = `<div class="bill-plan-price"><sup>₹</sup>${perMo.toLocaleString('en-IN')}</div><div class="bill-plan-cycle">per month${_billingCycle==='annual'?` · ₹${yearly.toLocaleString('en-IN')}/year`:''}</div>`;

    let ctaHtml;
    if (isEnterprise)         ctaHtml = `<a href="mailto:support@taskroom.in?subject=Enterprise%20Inquiry" class="btn btn-ghost w-full">Contact Sales →</a>`;
    else if (isCurrentActual) ctaHtml = `<button class="btn btn-ghost w-full" disabled>Current Plan</button>`;
    else if (isTrialPlan)     ctaHtml = `<button class="btn btn-primary w-full" onclick="startUpgrade('${slug}','${esc(p.label||slug)}',${amount})">Buy — Keep Access</button><div style="font-size:11.5px;color:var(--amber);text-align:center;margin-top:7px">Trial expires ${fmtDate(trialEndsAt)}</div>`;
    else if (isHigher)        ctaHtml = `<button class="btn btn-primary w-full" onclick="startUpgrade('${slug}','${esc(p.label||slug)}',${amount})">Upgrade to ${esc(p.label||slug)} →</button>`;
    else                      ctaHtml = `<button class="btn btn-ghost w-full" disabled>Downgrade</button>`;

    let badgeHtml = '';
    if (isCurrentActual) badgeHtml = `<div style="margin-bottom:6px"><span class="badge badge-active">Current Plan</span></div>`;
    else if (isTrialPlan)badgeHtml = `<div style="margin-bottom:6px"><span class="badge badge-trial">Trial — ${trialDaysLeft}d left</span></div>`;
    else if (slug==='growth') badgeHtml = `<div style="margin-bottom:6px"><span class="badge badge-pro">Most Popular</span></div>`;

    const cardCls = isCurrentActual ? 'plan-card current' : isTrialPlan ? 'plan-card recommended' : 'plan-card';
    html += `<div class="${cardCls}">${badgeHtml}<div class="p-name" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text2);margin-bottom:8px">${esc(p.label||slug)}</div>${priceHtml}<div class="bill-plan-limits"><span class="bill-limit-chip">👥 ${lv(p.maxEmployees)} emp</span><span class="bill-limit-chip">🏠 ${lv(p.maxRooms)} rooms</span></div><hr style="border:none;border-top:1px solid var(--border);margin:12px 0"/>${ctaHtml}</div>`;
  });
  html += '</div>';

  // History
  if (history.length) {
    html += '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px;margin-top:28px">Payment History</h3><div class="tbl-wrap"><table><thead><tr><th></th><th>Plan</th><th>Cycle</th><th>Amount</th><th>Valid Until</th><th>Paid At</th></tr></thead><tbody>';
    history.forEach(r => {
      html += `<tr><td style="width:28px;text-align:center">${r.status==='paid'?'<span style="color:var(--green);font-size:16px">✓</span>':'<span style="color:var(--red);font-size:16px">✗</span>'}</td><td><div class="badge badge-${r.plan||''}" style="text-transform:capitalize">${esc(r.plan||'—')}</div></td><td style="color:var(--text2);font-size:12.5px;text-transform:capitalize">${esc(r.billingCycle||'—')}</td><td style="font-weight:700">${fmtINR(r.amountINR||r.amountPaid||0)}</td><td style="color:var(--text2);font-size:12.5px">${r.validUntil?fmtDate(r.validUntil):'—'}</td><td style="color:var(--text3);font-size:12.5px">${r.paidAt?fmtDate(r.paidAt):'—'}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }
  return html;
}

/* ══════════════════════════════════════════════════════════════
   ROOMS
══════════════════════════════════════════════════════════════ */
const ROOM_ICONS  = { sales:'💼', delivery:'🚚', service:'🔧', maintenance:'⚙️', inspection:'🔍', other:'🏠' };
const ROOM_COLORS = { sales:'var(--primary)', delivery:'var(--amber)', service:'var(--green)', maintenance:'var(--purple)', inspection:'var(--info)', other:'var(--primary)' };

async function loadRooms(pg=1) {
  _rpg = pg;
  const el = $('rooms-grid-wrap');
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const search = $('room-search')?.value.trim() || '';
  const cat    = $('room-cat-filter')?.value || '';
  let url = `/rooms?page=${pg}&limit=12`;
  if (search) url += '&search=' + encodeURIComponent(search);
  if (cat)    url += '&category=' + cat;
  try {
    const d = await api('GET', url);
    if (!d.success) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>Failed to load rooms</h3><p>${esc(d.message)}</p></div>`; return; }
    const rooms = d.data?.rooms || [], pag = d.data?.pagination || {};
    if (!rooms.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏠</div><h3>No Rooms Found</h3><p>${search?'No rooms match your search.':'Create your first room to get started.'}</p>${_user?.role==='manager'?'<button class="btn btn-primary btn-sm" onclick="openCreateRoom()">+ Create Room</button>':''}</div>`; renderPg('rooms-pg',pag,pg,'loadRooms'); return; }
    el.innerHTML = '<div class="rooms-grid">' + rooms.map(r => {
      const icon = ROOM_ICONS[r.category]||'🏠', color = ROOM_COLORS[r.category]||'var(--primary)';
      return `<div class="room-card" onclick="openRoomDetail('${r._id}')">
        <div class="room-card-top"><div class="room-icon" style="background:linear-gradient(135deg,${color},${color}88)">${icon}</div><div style="min-width:0"><div class="room-name">${esc(r.name)}</div><div class="room-code">${esc(r.roomCode||'—')}</div></div><div style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:3px"><span class="room-cat-badge">${esc(r.category||'other')}</span>${r.isArchived?'<span class="badge badge-inactive" style="font-size:10px">Archived</span>':''}</div></div>
        ${r.description?`<div class="room-desc">${esc(r.description)}</div>`:''}
        <div class="room-stats"><div class="room-stat">👥 <strong>${r.stats?.totalMembers||0}</strong></div><div class="room-stat">✅ <strong>${r.stats?.completedTasks||0}</strong> done</div><div class="room-stat">⏳ <strong>${r.stats?.activeTasks||0}</strong> active</div></div>
      </div>`;
    }).join('') + '</div>';
    renderPg('rooms-pg', pag, pg, 'loadRooms');
  } catch(e) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>Failed to load rooms.</p></div>'; }
}

async function openRoomDetail(roomId) {
  _currentRoomId = roomId; openM('modal-room-detail');
  $('rd-name').textContent = 'Loading…';
  $('rd-members-list').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  $('rd-tasks-list').innerHTML   = '<div class="loading"><div class="spinner"></div></div>';
  showRoomTab('overview', document.querySelector('#rd-tabs .tab-btn'));
  try {
    const d = await api('GET', '/rooms/' + roomId);
    if (!d.success) { toast('Could not load room', 'error'); closeM('modal-room-detail'); return; }
    const r = d.data?.room;
    const icon = ROOM_ICONS[r.category]||'🏠', color = ROOM_COLORS[r.category]||'var(--primary)';
    $('rd-icon').style.background = `linear-gradient(135deg,${color},${color}88)`;
    $('rd-icon').textContent = icon;
    $('rd-name').textContent = r.name||'Room';
    $('rd-code').textContent = r.roomCode||'—';
    $('rd-cat-badge').textContent = r.category||'other';
    const sb = $('rd-status-badge'); if (r.isArchived){sb.className='badge badge-inactive';sb.textContent='Archived';}else{sb.className='badge badge-active';sb.textContent='Active';}
    if ($('rd-member-count'))  $('rd-member-count').textContent  = r.stats?.totalMembers||r.members?.length||0;
    if ($('rd-active-tasks'))  $('rd-active-tasks').textContent  = r.stats?.activeTasks||0;
    if ($('rd-comp-tasks'))    $('rd-comp-tasks').textContent    = r.stats?.completedTasks||0;
    const ab = $('rd-archive-btn'); if(ab){ab.textContent=r.isArchived?'Restore Room':'Archive Room';ab.className=r.isArchived?'btn btn-success btn-sm':'btn btn-ghost btn-sm';}
    $('rd-overview-info').innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px"><div class="org-di"><label>Created by</label><div class="val">${esc(r.createdBy?.fullName||r.createdBy?.username||'—')}</div></div><div class="org-di"><label>Created</label><div class="val">${fmtDate(r.createdAt)}</div></div><div class="org-di"><label>Max Members</label><div class="val">${r.settings?.maxMembers||100}</div></div>${r.description?`<div class="org-di" style="grid-column:1/-1"><label>Description</label><div class="val">${esc(r.description)}</div></div>`:''}</div>`;
    renderRoomMembers(r.members||[]);
    loadRoomTasks(roomId);
  } catch(e) { toast('Error loading room', 'error'); }
}

function renderRoomMembers(members) {
  const el = $('rd-members-list');
  if (!members.length) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><h3>No Members</h3></div>'; return; }
  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:7px">' + members.map(m => {
    const u = m.user||m;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border-radius:var(--r2);border:1px solid var(--border)">${avatarHTML(u,{size:36,online:true})}<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">${esc(u.fullName||u.username||'—')}</div><div style="font-size:11.5px;color:var(--text3)">@${esc(u.username||'—')}</div></div><div class="badge badge-${u.role||'employee'}">${u.role||'employee'}</div></div>`;
  }).join('') + '</div>';
}

async function loadRoomTasks(roomId) {
  const el = $('rd-tasks-list');
  try {
    const d = await api('GET', `/tasks?roomId=${roomId}&limit=20`);
    if (!d.success) { el.innerHTML = '<div style="padding:16px;color:var(--red);font-size:13px">Failed to load</div>'; return; }
    const tasks = d.data?.tasks || [];
    if (!tasks.length) { el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><h3>No Tasks</h3>${_user?.role==='manager'?'<button class="btn btn-primary btn-sm" onclick="openCreateTaskForRoom()">+ Create Task</button>':''}</div>`; return; }
    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:7px">' + tasks.map(t => {
      const pct  = t.totalSteps > 0 ? Math.round((t.completedSteps||0)/t.totalSteps*100) : 0;
      const scls = {'pending':'badge-pending','in_progress':'badge-in-progress','completed':'badge-completed','cancelled':'badge-cancelled'}[t.status]||'badge-pending';
      return `<div style="padding:11px 13px;background:var(--surface2);border-radius:var(--r2);border:1px solid var(--border);cursor:pointer;transition:border-color var(--transition)" onclick="closeM('modal-room-detail');setTimeout(()=>openTaskPanel('${t._id}'),120)" onmouseover="this.style.borderColor='rgba(19,127,236,.3)'" onmouseout="this.style.borderColor='var(--border)'"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px"><div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</div><div class="badge ${scls}" style="font-size:10px;flex-shrink:0">${(t.status||'').replace('_',' ')}</div></div><div style="font-size:11.5px;color:var(--text3)">${esc(t.assignedTo?.fullName||t.assignedTo?.username||'—')} · ${fmtDT(t.startDatetime)}</div></div>`;
    }).join('') + '</div>';
  } catch(e) { el.innerHTML = '<div style="padding:16px;color:var(--red);font-size:13px">Error.</div>'; }
}

function showRoomTab(tab, btn) {
  document.querySelectorAll('#rd-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#modal-room-detail .tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  $('rd-tab-' + tab)?.classList.add('active');
}

async function archiveCurrentRoom() {
  if (!_currentRoomId) return;
  const d = await api('GET', '/rooms/' + _currentRoomId);
  const r = d.data?.room;
  if (!confirm(`${r?.isArchived?'Restore':'Archive'} this room?`)) return;
  try {
    const res = await api('PATCH', '/rooms/archive/' + _currentRoomId, { archive: !r?.isArchived });
    if (res.success) { toast(res.message||'Done','success'); closeM('modal-room-detail'); loadRooms(1); }
    else toast(res.message, 'error');
  } catch(e) { toast('Error','error'); }
}

/* ══════════════════════════════════════════════════════════════
   TASKS
══════════════════════════════════════════════════════════════ */
async function loadTasks(pg=1) {
  _tpg = pg;
  const body = $('tasks-body');
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const priority = $('task-priority-filter')?.value || '';
  const search   = $('task-search')?.value.trim() || '';
  let url = `/tasks?page=${pg}&limit=15`;
  if (_taskFilter) url += '&status=' + _taskFilter;
  if (priority)    url += '&priority=' + priority;
  if (search)      url += '&search=' + encodeURIComponent(search);
  try {
    const d = await api('GET', url);
    if (!d.success) { body.innerHTML = `<div class="tbl-empty">${esc(d.message)}</div>`; return; }
    const tasks = d.data?.tasks || [], pag = d.data?.pagination || {};
    if ($('tasks-count-label')) $('tasks-count-label').textContent = `Tasks (${pag.total||tasks.length})`;
    if (!tasks.length) { body.innerHTML = '<div class="tbl-empty">No tasks found</div>'; renderPg('tasks-pg',pag,pg,'loadTasks'); return; }
    body.innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Title</th><th>Employee</th><th>Room</th><th>Priority</th><th>Status</th><th>Progress</th><th>Deadline</th></tr></thead><tbody>
    ${tasks.map(t => {
      const pct  = t.totalSteps > 0 ? Math.round((t.completedSteps||0)/t.totalSteps*100) : 0;
      const scls = {'pending':'badge-pending','in_progress':'badge-in-progress','completed':'badge-completed','cancelled':'badge-cancelled','overdue':'badge-overdue'}[t.status]||'badge-pending';
      const overdue = isOverdue(t.endDatetime) && !['completed','cancelled'].includes(t.status);
      return `<tr class="task-row" onclick="openTaskPanel('${t._id}')">
        <td><div class="task-title-cell">${esc(t.title)}</div>${t.isFieldWork?'<div style="font-size:10.5px;color:var(--info);margin-top:2px">📍 GPS</div>':''}</td>
        <td><div style="display:flex;align-items:center;gap:7px">${avatarHTML(t.assignedTo,{size:26})}<div style="font-size:12.5px;font-weight:600;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.assignedTo?.fullName||t.assignedTo?.username||'—')}</div></div></td>
        <td style="color:var(--text2);font-size:12px">${esc(t.room?.name||'—')}</td>
        <td><div class="badge badge-${t.priority||'medium'}">${t.priority||'medium'}</div></td>
        <td><div class="badge ${scls}">${(t.status||'pending').replace('_',' ')}</div>${overdue?'<div style="font-size:10px;color:var(--red);margin-top:1px">Overdue</div>':''}</td>
        <td>${t.totalSteps>0?`<div class="progress-bar"><div class="progress-fill" style="background:${pct>=100?'var(--green)':pct>=50?'var(--primary)':'var(--amber)'};width:${pct}%"></div></div><div style="font-size:11px;color:var(--text3);margin-top:2px">${pct}%</div>`:'<span style="color:var(--text3);font-size:12px">—</span>'}</td>
        <td style="font-size:12px;${overdue?'color:var(--red)':''}">${fmtDT(t.endDatetime)}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
    renderPg('tasks-pg', pag, pg, 'loadTasks');
  } catch(e) { body.innerHTML = '<div class="tbl-empty">Error loading tasks.</div>'; }
}

function setTaskFilter(val, btn) {
  _taskFilter = val;
  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  loadTasks(1);
}

/* ── Task Detail Panel ───────────────────────────────────────── */
async function openTaskPanel(taskId) {
  _currentTaskId = taskId;
  $('task-panel').classList.add('open');
  $('tp-title').textContent = 'Loading…'; $('tp-sub').innerHTML = '';
  $('tp-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  $('tp-cancel-btn').style.display = 'none';
  if (window.innerWidth <= 768 && typeof showMobBackBar === 'function') showMobBackBar('Task Detail');
  // Keep tabs hidden until data loads
  const tpTabs = $('tp-tabs');
  if (tpTabs) { tpTabs.style.display = 'none'; tpTabs.style.overflowX = 'auto'; tpTabs.style.flexWrap = 'nowrap'; tpTabs.style.webkitOverflowScrolling = 'touch'; }
  try {
    const d = await api('POST', '/tasks/detail', { taskId });
    if (!d.success) { $('tp-body').innerHTML = `<div class="empty-state"><div class="empty-icon">❌</div><h3>Error</h3><p>${esc(d.message)}</p></div>`; return; }
    renderTaskPanel(d.data?.task);
  } catch(e) { $('tp-body').innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error loading task</h3></div>'; }
}

function renderTaskPanel(t) {
  const scls = {'pending':'badge-pending','in_progress':'badge-in-progress','completed':'badge-completed','cancelled':'badge-cancelled'}[t.status]||'badge-pending';
  const pct  = t.totalSteps > 0 ? Math.round((t.completedSteps||0)/t.totalSteps*100) : 0;
  $('tp-title').textContent = t.title || 'Task';
  $('tp-sub').innerHTML = `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="badge ${scls}">${(t.status||'').replace('_',' ')}</span><span style="color:var(--text3)">·</span><span style="color:var(--text2);font-size:12px">${esc(t.room?.name||'—')}</span></div>`;
  const canCancel = _user?.role === 'manager' && ['pending','in_progress'].includes(t.status);
  if (canCancel) $('tp-cancel-btn').style.display = '';
  const hasGPS = t.isFieldWork && (t.locationTrace?.length > 0 || t.liveLocation);
  const tpTabs = $('tp-tabs');
  if (tpTabs) {
    tpTabs.style.display = 'flex';
    tpTabs.style.overflowX = 'auto';
    tpTabs.style.flexWrap = 'nowrap';
    tpTabs.style.webkitOverflowScrolling = 'touch';
    tpTabs.style.paddingBottom = '1px'; // prevent border clipping
  }
  $('tp-gps-tab').style.display = hasGPS ? '' : 'none';
  const overdue = isOverdue(t.endDatetime) && !['completed','cancelled'].includes(t.status);
  const u = t.assignedTo;

  let html = `<div id="tp-tab-info" class="tab-content active">
    <div class="panel-sec"><div class="panel-sec-title">Assigned Employee</div>
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border-radius:var(--r2);border:1px solid var(--border)">
        ${avatarHTML(u,{size:40,online:true})}
        <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:700">${esc(u?.fullName||u?.username||'—')}</div>${u?.username?`<div style="font-size:12px;color:var(--text3)">@${esc(u.username)}</div>`:''}</div>
        <div style="font-size:12px;color:${u?.isOnline?'var(--green)':'var(--text3)'}">● ${u?.isOnline?'Online':'Offline'}</div>
      </div>
    </div>
    <div class="panel-sec"><div class="panel-sec-title">Task Details</div>
      <div class="info-row"><span class="label">Priority</span><div class="badge badge-${t.priority||'medium'}">${t.priority||'medium'}</div></div>
      <div class="info-row"><span class="label">GPS</span><span class="val">${t.isFieldWork?'📍 Enabled':'Disabled'}</span></div>
      <div class="info-row"><span class="label">Start</span><span class="val">${fmtDT(t.startDatetime)}</span></div>
      <div class="info-row"><span class="label">Deadline</span><span class="val" style="${overdue?'color:var(--red)':''}">${fmtDT(t.endDatetime)}${overdue?' ⚠️':''}</span></div>
      ${t.completedAt?`<div class="info-row"><span class="label">Completed</span><span class="val" style="color:var(--green)">${fmtDT(t.completedAt)}</span></div>`:''}
      ${t.cancelReason?`<div class="info-row"><span class="label">Cancel Reason</span><span class="val">${esc(t.cancelReason)}</span></div>`:''}
    </div>
    ${t.totalSteps>0?`<div class="panel-sec"><div class="panel-sec-title">Progress</div><div class="prog-wrap"><div class="prog-label"><span>${t.completedSteps||0}/${t.totalSteps} steps</span><span style="font-weight:700;color:${pct>=100?'var(--green)':pct>=50?'var(--primary)':'var(--amber)'}">${pct}%</span></div><div class="prog-bar" style="height:7px"><div class="prog-fill" style="width:${pct}%;background:${pct>=100?'var(--green)':pct>=50?'var(--primary)':'var(--amber)'}"></div></div></div></div>`:''}
    ${t.note?`<div class="panel-sec"><div class="panel-sec-title">Manager Note</div><div style="background:var(--amber-g);border:1px solid rgba(245,158,11,.22);border-radius:var(--r2);padding:10px 12px;font-size:13px;line-height:1.6;color:var(--text2)">📝 ${esc(t.note)}</div></div>`:''}
    ${hasGPS?`<div class="panel-sec"><div class="panel-sec-title">GPS Location</div><button class="btn btn-primary btn-sm w-full" onclick="openGPSMap('${t._id}')">🗺️ View Full Route Trace</button></div>`:''}
  </div>`;

  // Steps tab
  html += `<div id="tp-tab-steps" class="tab-content"><div class="panel-sec"><div class="step-timeline">`;
  (t.steps||[]).forEach((s, i) => {
    const isDone = ['completed','skipped'].includes(s.status);
    const isActive = ['in_progress','reached'].includes(s.status);
    const dotCls = isDone ? 'done' : isActive ? 'active' : 'pending';
    const scol = {'completed':'var(--green)','in_progress':'var(--primary)','reached':'var(--amber)','skipped':'var(--text3)','pending':'var(--text3)'}[s.status]||'var(--text3)';
    const slbl = {'completed':'✓ Completed','in_progress':'● In Progress','reached':'📍 Reached','skipped':'Skipped','pending':'Pending'}[s.status]||'Pending';
    const reqs = [];
    if (s.validations?.requirePhoto)         reqs.push('📸 Photo');
    if (s.validations?.requireSignature)     reqs.push('✍️ Signature');
    if (s.validations?.requireLocationCheck) reqs.push('📍 Location');
    html += `<div class="step-item">
      <div style="position:relative"><div class="step-dot ${dotCls}">${isDone?'✓':i+1}</div>${i<(t.steps||[]).length-1?`<div class="step-line ${isDone?'done':''}"></div>`:''}</div>
      <div class="step-content">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px"><div class="step-title-text">${esc(s.title||'Step '+(i+1))}</div></div>
        <div class="step-time">${fmtTime(s.startDatetime)} → ${fmtTime(s.endDatetime)}</div>
        <div style="margin-top:4px"><span style="font-size:11.5px;font-weight:700;color:${scol}">${slbl}</span>${s.completedAt?`<span style="font-size:11px;color:var(--text3)"> · ${fmtDT(s.completedAt)}</span>`:''}</div>
        ${reqs.length?`<div style="font-size:11px;color:var(--text3);margin-top:4px">Requires: ${reqs.join(' · ')}</div>`:''}
        ${s.employeeNotes?`<div class="step-ev">💬 ${esc(s.employeeNotes)}</div>`:''}
        <div class="step-media">
          ${s.submittedPhotoUrl?`<img class="step-photo-thumb" src="${esc(s.submittedPhotoUrl)}" alt="Photo" onclick="openLightbox('${esc(s.submittedPhotoUrl)}','Step ${i+1} — Photo Proof')"/>`:'' }
          ${s.signatureData?`<div class="step-sig-thumb" onclick="openSigViewer('${esc(s.signatureData)}','Signed — Step ${i+1}')" style="cursor:pointer;background:#fff;border-radius:6px;padding:4px;border:1px solid var(--border)"><img src="${s.signatureData.startsWith('data:')?s.signatureData:'data:image/png;base64,'+s.signatureData}" alt="Signature" style="max-width:100%;max-height:60px;object-fit:contain;display:block"/><div style="font-size:9px;color:var(--text3);text-align:center;margin-top:2px">✍️ Tap to expand</div></div>`:''}
        </div>
      </div>
    </div>`;
  });
  if (!(t.steps||[]).length) html += '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No steps defined</div>';
  html += `</div></div></div>`;

  // GPS tab
  html += `<div id="tp-tab-gps" class="tab-content"><div class="panel-sec"><button class="btn btn-primary w-full" onclick="openGPSMap('${t._id}')">🗺️ Open Full-Screen Route Map</button>${t.locationTrace?.length?`<div class="gps-trace-info" style="margin-top:10px"><div class="trace-stat"><strong>${t.locationTrace.length}</strong>GPS Pings</div>${t.distanceTravelledKm?`<div class="trace-stat"><strong>${t.distanceTravelledKm.toFixed(1)}km</strong>Distance</div>`:''}</div>`:''}</div></div>`;

  $('tp-body').innerHTML = html;
  showTaskTab('info', document.querySelector('#tp-tabs .tab-btn'));
}

function showTaskTab(tab, btn) {
  document.querySelectorAll('#tp-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['info','steps','gps'].forEach(t => { const el = $('tp-tab-'+t); if(el) el.classList.toggle('active', t===tab); });
}

function closeTaskPanel() {
  $('task-panel')?.classList.remove('open');
  _currentTaskId = null;
  if (typeof hideMobBackBar === 'function') hideMobBackBar();
}

async function cancelCurrentTask() {
  if (!_currentTaskId) return;
  if (!confirm('Cancel this task? This cannot be undone.')) return;
  try {
    const d = await api('PATCH', '/tasks/cancel', { taskId: _currentTaskId });
    if (d.success) { toast('Task cancelled','success'); closeTaskPanel(); loadTasks(_tpg); loadTaskDashboard(); }
    else toast(d.message||'Failed','error');
  } catch(e) { toast('Error','error'); }
}

/* ══════════════════════════════════════════════════════════════
   GPS MAP
══════════════════════════════════════════════════════════════ */
async function openGPSMap(taskId) {
  openM('modal-gps');
  $('map-container').innerHTML = '<div class="loading" style="height:100%;align-items:center;justify-content:center;display:flex"><div class="spinner"></div></div>';
  $('gps-trace-stats').innerHTML = '';
  try {
    const d = await api('POST', '/tasks/location-trace', { taskId });
    if (!d.success) { $('map-container').innerHTML = `<div class="empty-state"><div class="empty-icon">📍</div><h3>No GPS Data</h3><p>${esc(d.message||'No location trace available.')}</p></div>`; return; }
    const trace = d.data?.locationTrace || d.data?.trace || [];
    const task  = d.data?.task || {};
    if ($('gps-modal-title')) $('gps-modal-title').textContent = esc(task.title||'GPS Route Trace');
    if ($('gps-modal-sub'))   $('gps-modal-sub').textContent   = `${trace.length} location pings · ${esc(task.assignedTo?.fullName||'Employee')}`;
    if (trace.length > 0) {
      const km = d.data?.distanceTravelledKm;
      if ($('gps-trace-stats')) $('gps-trace-stats').innerHTML = `<div class="trace-stat"><strong>${trace.length}</strong>Pings</div>${km?`<div class="trace-stat"><strong>${km.toFixed(1)}km</strong>Distance</div>`:''}<div class="trace-stat"><strong>${fmtTime(trace[0]?.timestamp)}</strong>Start</div><div class="trace-stat"><strong>${fmtTime(trace[trace.length-1]?.timestamp)}</strong>End</div>`;
    }
    initLeafletMap(trace, task);
  } catch(e) { $('map-container').innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${esc(e.message)}</p></div>`; }
}

function initLeafletMap(trace, task) {
  if (!window.L) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
    const js  = document.createElement('script'); js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    js.onload = () => renderLeafletMap(trace, task); document.head.appendChild(js);
  } else renderLeafletMap(trace, task);
}

function renderLeafletMap(trace, task) {
  $('map-container').innerHTML = '<div id="leaflet-map" style="width:100%;height:100%"></div>';
  const center = trace.length > 0 ? [trace[0].coordinates[1], trace[0].coordinates[0]] : [20.5937, 78.9629];
  if (_map) { _map.remove(); _map = null; }
  _map = L.map('leaflet-map').setView(center, 14);
  _mapTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap', maxZoom:19 }).addTo(_map);
  if (!trace.length) { L.marker(center).addTo(_map).bindPopup('No GPS data recorded').openPopup(); return; }
  const pts = trace.map(p => [p.coordinates[1], p.coordinates[0]]);
  _mapPolyline = L.polyline(pts, { color:'#137fec', weight:3, opacity:.85 }).addTo(_map);
  const mkIcon = (bg) => L.divIcon({ html:`<div style="width:16px;height:16px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`, iconSize:[16,16], iconAnchor:[8,8] });
  L.marker(pts[0], { icon: mkIcon('var(--green)') }).addTo(_map).bindPopup(`<b>Start</b><br>${fmtDT(trace[0].timestamp)}`);
  L.marker(pts[pts.length-1], { icon: mkIcon('var(--red)') }).addTo(_map).bindPopup(`<b>${task.status==='completed'?'Completed':'Last Known'}</b><br>${fmtDT(trace[trace.length-1].timestamp)}`);
  (task.steps||[]).forEach((s, i) => {
    if (s.destinationLocation?.coordinates) {
      const c  = [s.destinationLocation.coordinates[1], s.destinationLocation.coordinates[0]];
      const ic = L.divIcon({ html:`<div style="width:22px;height:22px;border-radius:50%;background:var(--amber);border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#000;box-shadow:0 2px 6px rgba(0,0,0,.4)">${i+1}</div>`, iconSize:[22,22], iconAnchor:[11,11] });
      L.marker(c, { icon: ic }).addTo(_map).bindPopup(`<b>Step ${i+1}: ${esc(s.title||'')}</b><br>${esc(s.destinationLocation.address||'')}`);
    }
  });
  _map.fitBounds(_mapPolyline.getBounds(), { padding:[20,20] });
}
function mapFitBounds()      { if (_map && _mapPolyline) _map.fitBounds(_mapPolyline.getBounds(), { padding:[20,20] }); }
function mapToggleSatellite(){ if (!_map||!window.L) return; _mapSatellite=!_mapSatellite; if(_mapTileLayer)_map.removeLayer(_mapTileLayer); _mapTileLayer=L.tileLayer(_mapSatellite?'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}':'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:_mapSatellite?'© Esri':'© OpenStreetMap',maxZoom:19}).addTo(_map); }
function stopMap()           { if (_map) { _map.remove(); _map = null; } }

/* ══════════════════════════════════════════════════════════════
   ATTENDANCE
══════════════════════════════════════════════════════════════ */
async function loadAttendance(pg=1) {
  _apg = pg;
  const body = $('att-body');
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const empId = $('att-emp-filter')?.value || '';
  const from  = $('att-date-from')?.value  || '';
  const to    = $('att-date-to')?.value    || '';
  let url = `/attendance/history?page=${pg}&limit=15`;
  if (empId) url += '&employeeId=' + empId;
  if (from)  url += '&from=' + from;
  if (to)    url += '&to='   + to;
  try {
    const d = await api('GET', url);
    if (!d.success) { body.innerHTML = `<div class="tbl-empty">${esc(d.message)}</div>`; return; }
    const records = d.data?.attendance || d.data?.records || [], pag = d.data?.pagination || {};
    if ($('att-count-label')) $('att-count-label').textContent = `Attendance (${pag.total||records.length})`;
    const empSel = $('att-emp-filter');
    if (empSel && empSel.options.length <= 1) {
      const mRes = await api('GET', '/organization/members?limit=200');
      if (mRes.success) (mRes.data?.members||[]).filter(m=>m.role==='employee').forEach(m => { const o=document.createElement('option'); o.value=m._id; o.textContent=m.fullName||m.username; empSel.appendChild(o); });
    }
    if (!records.length) { body.innerHTML = '<div class="tbl-empty">No attendance records found</div>'; renderPg('att-pg',pag,pg,'loadAttendance'); return; }
    body.innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Employee</th><th>Punch In</th><th>Punch Out</th><th>Total Hours</th><th>Sessions</th><th>Tasks Done</th><th>Details</th></tr></thead><tbody>
    ${records.map(r => {
      const emp = r.employee;
      const totalHrs = ((r.totalMinutes||0)/60).toFixed(1);
      return `<tr><td style="font-weight:600">${fmtDate(r.workDate)}</td><td><div style="display:flex;align-items:center;gap:7px">${avatarHTML(emp,{size:26})}<div><div style="font-size:12.5px;font-weight:600">${esc(emp?.fullName||emp?.username||'—')}</div></div></div></td><td style="color:var(--text2);font-size:12.5px">${r.punchInTime?fmtTime(r.punchInTime):(r.sessions?.[0]?.startTime?fmtTime(r.sessions[0].startTime):'—')}</td><td style="color:var(--text2);font-size:12.5px">${r.punchOutTime?fmtTime(r.punchOutTime):'—'}</td><td><span style="font-weight:700;color:${parseFloat(totalHrs)>=8?'var(--green)':parseFloat(totalHrs)>=4?'var(--amber)':'var(--text2)'}">${fmtMins(r.totalMinutes)}</span></td><td style="font-size:12.5px;color:var(--text2)">${(r.sessions||[]).length}</td><td style="font-size:12.5px;color:var(--text2)">${r.tasksCompleted||0}</td><td><button class="btn btn-ghost btn-sm" onclick="openAttDetail('${r._id}')">View →</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
    renderPg('att-pg', pag, pg, 'loadAttendance');
  } catch(e) { body.innerHTML = '<div class="tbl-empty">Error loading attendance.</div>'; }
}

async function openAttDetail(attId) {
  const panel = $('att-panel'); panel.classList.add('open');
  $('atp-title').textContent = 'Loading…'; $('atp-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const d = await api('GET', '/attendance/detail/' + attId).catch(() => api('GET', '/attendance/employee/' + attId));
    const r = d.data?.attendance || d.data || {}, emp = r.employee || {};
    $('atp-title').textContent = emp.fullName || emp.username || 'Attendance Detail';
    $('atp-sub').textContent   = fmtDate(r.workDate);
    let html = `<div class="panel-sec"><div class="panel-sec-title">Summary</div>
      <div class="info-row"><span class="label">Date</span><span class="val">${fmtDate(r.workDate)}</span></div>
      <div class="info-row"><span class="label">Total Time</span><span class="val" style="color:var(--green)">${fmtMins(r.totalMinutes)}</span></div>
      <div class="info-row"><span class="label">Sessions</span><span class="val">${(r.sessions||[]).length}</span></div>
      <div class="info-row"><span class="label">Tasks Done</span><span class="val">${r.tasksCompleted||0}</span></div></div>`;
    html += `<div class="panel-sec"><div class="panel-sec-title">Sessions</div><div class="att-timeline">`;
    (r.sessions||[]).forEach((s, i) => {
      const open = !s.endTime;
      const mins = s.endTime && s.startTime ? Math.round((new Date(s.endTime)-new Date(s.startTime))/60000) : null;
      html += `<div class="att-session"><div class="att-session-dot ${open?'':'closed'}"></div><div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:700">Session ${i+1}</div><div style="font-size:11.5px;color:var(--text3)">${fmtTime(s.startTime)} → ${s.endTime?fmtTime(s.endTime):'Still active'}</div>${mins?`<div class="att-hours-bar" style="margin-top:5px"><div class="att-hours-fill" style="width:${Math.min(100,(mins/480)*100)}%"></div></div><div style="font-size:11px;color:var(--text3);margin-top:2px">${fmtMins(mins)}</div>`:''}</div>${open?'<span class="badge badge-active" style="font-size:10px">Active</span>':''}</div>`;
    });
    if (!(r.sessions||[]).length) html += '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No sessions recorded</div>';
    html += `</div></div>`;
    $('atp-body').innerHTML = html;
  } catch(e) { $('atp-body').innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Error</h3><p>${esc(e.message)}</p></div>`; }
}

/* ══════════════════════════════════════════════════════════════
   MEMBERS
══════════════════════════════════════════════════════════════ */
async function loadMembers(pg=1) {
  _mpg = pg;
  const body = $('m-body');
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const search = $('m-search')?.value.trim() || '';
  const role   = $('role-filter')?.value    || '';
  let url = `/organization/members?page=${pg}&limit=15`;
  if (search) url += '&search=' + encodeURIComponent(search);
  if (role)   url += '&role='   + role;
  try {
    const d = await api('GET', url);
    if (!d.success) { body.innerHTML = `<div class="tbl-empty">${esc(d.message)}</div>`; return; }
    const mbs = d.data?.members || [], pag = d.data?.pagination || {};
    if (!mbs.length) { body.innerHTML = `<div class="tbl-empty">No members yet. <a href="#" onclick="openInviteHelper();return false" style="color:var(--primary-light)">Invite your first employee →</a></div>`; renderPg('m-pg',pag,pg,'loadMembers'); return; }
    body.innerHTML = `<div style="overflow-x:auto"><table><thead><tr><th>Member</th><th>Username</th><th>Role</th><th>Status</th><th>Department</th><th>Joined</th></tr></thead><tbody>
    ${mbs.map(m => {
      return `<tr><td><div style="display:flex;align-items:center;gap:9px">${avatarHTML(m,{size:38})}<div><div style="font-weight:600;font-size:13px">${esc(m.fullName||m.username)}</div><div style="font-size:11.5px;color:var(--text3)">${esc(m.email||m.mobile||'')}</div></div></div></td><td class="mono" style="font-size:12.5px;color:var(--text2)">@${esc(m.username)}</td><td><div class="badge badge-${m.role||'employee'}">${m.role||'employee'}</div></td><td><div style="display:flex;align-items:center;gap:5px"><div class="online-dot ${m.isOnline?'on':'off'}"></div><span style="font-size:12.5px;color:var(--text2)">${m.isOnline?'Online':'Offline'}</span></div></td><td style="color:var(--text2);font-size:12.5px">${esc(m.department||'—')}</td><td style="color:var(--text3);font-size:12.5px">${fmtDate(m.createdAt)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
    renderPg('m-pg', pag, pg, 'loadMembers');
  } catch(e) { body.innerHTML = '<div class="tbl-empty">Error loading members.</div>'; }
}

/* ══════════════════════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════════════════════ */
async function loadAnalytics() {
  const body = $('analytics-body');
  body.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const days = parseInt($('analytics-period')?.value || '14');
  try {
    const [overviewR, trendsR, productivityR] = await Promise.all([
      api('GET', '/analytics/overview'),
      api('GET', `/analytics/trends?days=${days}`),
      api('GET', `/analytics/productivity`).catch(e => ({ success:false, needsUpgrade:true, message:e.message })),
    ]);
    let html = '';
    if (overviewR.success) {
      const ov = overviewR.data;
      html += `<div class="stat-grid" style="margin-bottom:20px"><div class="sc c-green"><div class="sc-icon">🟢</div><div class="sc-label">Online Now</div><div class="sc-value">${ov.onlineNow||0}</div><div class="sc-sub">of ${ov.totalEmployees||0} employees</div></div><div class="sc c-blue"><div class="sc-icon">📅</div><div class="sc-label">Present Today</div><div class="sc-value">${ov.attendanceToday||0}</div><div class="sc-sub">${ov.attendanceRate||0}% rate</div></div><div class="sc c-amber"><div class="sc-icon">✅</div><div class="sc-label">Tasks Today</div><div class="sc-value">${ov.tasksToday||0}</div><div class="sc-sub">${ov.taskBreakdown?.completed||0} completed</div></div><div class="sc c-red"><div class="sc-icon">⚠️</div><div class="sc-label">Overdue</div><div class="sc-value">${ov.overdueTasks||0}</div><div class="sc-sub">Needs attention</div></div></div>`;
    }
    if (trendsR.success) {
      const trends = trendsR.data?.trendData || [];
      const maxP = Math.max(...trends.map(t=>t.present), 1);
      const maxT = Math.max(...trends.map(t=>t.tasksDone), 1);
      html += `<div class="card" style="margin-bottom:20px"><div class="card-hdr"><div class="card-title">📈 ${days}-Day Trend</div><div style="display:flex;gap:12px;font-size:12px"><span style="color:var(--primary-light)">■ Present</span><span style="color:var(--amber)">■ Tasks done</span></div></div><div style="display:flex;align-items:flex-end;gap:3px;height:80px;padding:0 4px">${trends.map(t=>{const pP=Math.round((t.present/maxP)*100);const tP=Math.round((t.tasksDone/maxT)*100);return`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px"><div style="display:flex;gap:1px;align-items:flex-end;height:60px"><div style="width:6px;border-radius:2px 2px 0 0;background:var(--primary-light);height:${pP}%;min-height:2px;opacity:.7"></div><div style="width:6px;border-radius:2px 2px 0 0;background:var(--amber);height:${tP}%;min-height:2px;opacity:.7"></div></div><div style="font-size:9px;color:var(--text3);transform:rotate(-45deg);white-space:nowrap;margin-top:4px">${t.date.slice(5)}</div></div>`;}).join('')}</div></div>`;
    }
    if (!productivityR.success && (productivityR.needsUpgrade || productivityR.neededPlan)) {
      html += `<div class="card"><div style="text-align:center;padding:28px"><div style="font-size:40px;margin-bottom:12px">🔒</div><div style="font-size:16px;font-weight:700;margin-bottom:8px">Productivity Scores require Growth plan or higher</div><p style="color:var(--text2);font-size:13.5px;max-width:340px;margin:0 auto 18px;line-height:1.6">Weekly A–D grades are available on Growth, Business and Enterprise plans.</p><button class="btn btn-primary" onclick="showPage('billing',$('nav-billing'))">Upgrade Plan →</button></div></div>`;
    } else if (productivityR.success) {
      const prod = productivityR.data;
      html += `<div class="card"><div class="card-hdr"><div class="card-title">🏆 Productivity Scores</div><div style="font-size:12.5px;color:var(--text2)">Avg: <strong style="color:var(--primary-light)">${prod.summary?.avgScore||0}/100</strong></div></div>`;
      (prod.scores||[]).forEach(e => {
        const bc = {A:'var(--green)',B:'var(--primary-light)',C:'var(--amber)',D:'var(--red)'}[e.grade]||'var(--red)';
        html += `<div class="score-row"><div style="font-size:12px;color:var(--text3);width:20px">#${(prod.scores||[]).indexOf(e)+1}</div>${avatarHTML(e,{size:30})}<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.fullName)}</div><div class="score-bar"><div class="score-fill" style="width:${e.score}%;background:${bc}"></div></div><div style="font-size:11px;color:var(--text3);margin-top:2px">${e.stats.daysPresent}d · ${e.stats.totalHours}h · ${e.stats.completionRate}% tasks</div></div><div style="text-align:right"><div style="font-size:18px;font-weight:900;color:${bc}">${e.score}</div></div></div>`;
      });
      html += '</div>';
    }
    body.innerHTML = html;
  } catch(err) { body.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>Analytics</h3><p>${esc(err.message)}</p></div>`; }
}

/* ══════════════════════════════════════════════════════════════
   ORG EDIT / ROOMS CREATE / TASK WIZARD
══════════════════════════════════════════════════════════════ */
function openEditOrg() {
  if (!_org) return; clearA('alert-edit');
  $('e-name').value   = _org.name||''; $('e-email').value  = _org.contactEmail||'';
  $('e-phone').value  = _org.contactPhone||''; $('e-domain').value = _org.domain||'';
  $('e-city').value   = _org.address?.city||''; $('e-state').value = _org.address?.state||'';
  $('e-pin').value    = _org.address?.pincode||''; $('e-country').value = _org.address?.country||'India';
  $('e-loc').checked    = _org.settings?.enableLocationTracking !== false;
  $('e-active').checked = _org.isActive !== false;
  openM('modal-edit');
}
async function submitEdit(e) {
  e.preventDefault();
  const btn = $('btn-edit'); btn.innerHTML='<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Saving…'; btn.disabled=true; clearA('alert-edit');
  const body = { name:$('e-name').value.trim(), contactEmail:$('e-email').value.trim(), contactPhone:$('e-phone').value.trim()||undefined, domain:$('e-domain').value.trim()||undefined, address:{city:$('e-city').value.trim()||undefined,state:$('e-state').value.trim()||undefined,pincode:$('e-pin').value.trim()||undefined,country:$('e-country').value.trim()||'India'}, settings:{enableLocationTracking:$('e-loc').checked}, isActive:$('e-active').checked };
  try {
    const d = await api('PUT', '/organization/update/' + _org._id, body);
    if (d.success) { _org={..._org,...(d.data?.organization||d.data)}; save(); closeM('modal-edit'); fillOrgPage(); fillSidebar(); toast('Organization updated!','success'); }
    else showA('alert-edit','error',esc(d.message||'Failed'));
  } catch(err) { showA('alert-edit','error','Network error'); }
  finally { btn.innerHTML='Save Changes'; btn.disabled=false; }
}

function openCreateRoom() { openM('modal-create-room'); clearA('alert-create-room'); }
async function submitCreateRoom(e) {
  e.preventDefault();
  const name = $('r-name').value.trim(); $('fg-rname')?.classList.remove('field-error');
  if (!name) { $('fg-rname')?.classList.add('field-error'); return; }
  const btn = $('btn-create-room'); btn.innerHTML='<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Creating…'; btn.disabled=true; clearA('alert-create-room');
  try {
    const d = await api('POST', '/rooms', { name, description:$('r-desc').value.trim()||undefined, category:$('r-cat').value, maxMembers:parseInt($('r-max').value)||100, settings:{autoAcceptMembers:$('r-auto-accept').checked,allowMembersToSeeEachOther:$('r-see-each').checked,isActive:$('r-active').checked} });
    if (d.success) { toast('Room created: ' + d.data?.room?.name, 'success'); closeM('modal-create-room'); loadRooms(1); }
    else showA('alert-create-room','error',esc(d.message));
  } catch(err) { showA('alert-create-room','error','Network error'); }
  finally { btn.innerHTML='🏠 Create Room'; btn.disabled=false; }
}

/* Task wizard */
function openCreateTaskForRoom() {
  _ctRoom = _currentRoomId;
  $('ct-room-sub').textContent = _ctRoom ? 'Assign a task to room members' : 'No room selected';
  closeM('modal-room-detail');
  resetWizard(); openM('modal-create-task');
  const now = new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  const str = now.toISOString().slice(0,16);
  $('ct-start').min = $('ct-end').min = str;
  if (_ctRoom) loadCtMembers();
}
function resetWizard() {
  _wzStep=1; _ctSteps=[]; _ctSelectedIds=new Set(); _ctMembers=[];
  clearA('alert-create-task');
  ['ct-title','ct-note','ct-start','ct-end'].forEach(id => { if($(id)) $(id).value=''; });
  $('ct-priority').value='medium'; $('ct-track').checked=false;
  $('ct-steps-list').innerHTML=''; $('ct-steps-empty').style.display='';
  $('ct-members-list').innerHTML='<div class="loading"><div class="spinner"></div></div>';
  updateWizardUI();
}
function updateWizardUI() {
  for (let i=1;i<=3;i++) {
    const dot=$('wz-dot-'+i), lbl=$('wz-lbl-'+i), page=$('wz-page-'+i);
    if(i<_wzStep){dot.className='wz-dot done';dot.textContent='✓';lbl.className='wz-label';}
    else if(i===_wzStep){dot.className='wz-dot active';dot.textContent=i;lbl.className='wz-label active';}
    else{dot.className='wz-dot';dot.textContent=i;lbl.className='wz-label';}
    page?.classList.toggle('active',i===_wzStep);
  }
}
function wzNext(from) {
  clearA('alert-create-task');
  if (from===1) {
    const title=$('ct-title').value.trim(),start=$('ct-start').value,end=$('ct-end').value;
    let ok=true;
    ['fg-ct-title','fg-ct-start','fg-ct-end'].forEach(id=>$(id)?.classList.remove('field-error'));
    if(!title){$('fg-ct-title')?.classList.add('field-error');ok=false;}
    if(!start){$('fg-ct-start')?.classList.add('field-error');ok=false;}
    if(!end)  {$('fg-ct-end')?.classList.add('field-error');ok=false;}
    if(ok&&new Date(end)<=new Date(start)){showA('alert-create-task','error','End time must be after start time');ok=false;}
    if(!ok)return;_wzStep=2;
  } else if(from===2){
    if(!_ctRoom){showA('alert-create-task','error','No room selected');return;}
    if(!_ctSteps.length){showA('alert-create-task','error','Add at least one step');return;}
    _wzStep=3;renderCtMembers();
  }
  updateWizardUI();
}
function wzBack(from){_wzStep=from-1;updateWizardUI();clearA('alert-create-task');}
function addTaskStep(){
  const id='s'+Date.now();
  _ctSteps.push({id,title:'',startDatetime:$('ct-start').value||'',endDatetime:$('ct-end').value||'',requirePhoto:false,requireSignature:false,requireLocationCheck:false});
  renderCtSteps();
}
function deleteCtStep(id){_ctSteps=_ctSteps.filter(s=>s.id!==id);renderCtSteps();}
function updateCtStep(id,field,val){const s=_ctSteps.find(s=>s.id===id);if(s)s[field]=val;}
function renderCtSteps(){
  const el=$('ct-steps-list');$('ct-steps-empty').style.display=_ctSteps.length?'none':'';
  if(!_ctSteps.length){el.innerHTML='';return;}
  el.innerHTML=_ctSteps.map((s,i)=>`<div class="step-form-item"><div class="step-form-hdr"><div style="display:flex;align-items:center;gap:8px"><div class="step-form-num">${i+1}</div><div style="font-size:13px;font-weight:600">Step ${i+1}</div></div><button class="btn btn-danger btn-sm" onclick="deleteCtStep('${s.id}')">✕</button></div><div class="fg" style="margin-bottom:10px"><label>Step Title *</label><input type="text" value="${esc(s.title)}" placeholder="e.g. Collect signature" oninput="updateCtStep('${s.id}','title',this.value)" style="font-size:13px;padding:8px 11px"/></div><div class="form-row"><div class="fg"><label>Start *</label><input type="datetime-local" value="${esc(s.startDatetime)}" oninput="updateCtStep('${s.id}','startDatetime',this.value)" style="font-size:13px;padding:8px 11px"/></div><div class="fg"><label>End *</label><input type="datetime-local" value="${esc(s.endDatetime)}" oninput="updateCtStep('${s.id}','endDatetime',this.value)" style="font-size:13px;padding:8px 11px"/></div></div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px"><label style="text-transform:none;font-size:12.5px;display:flex;align-items:center;gap:5px;cursor:pointer;font-weight:500"><input type="checkbox" ${s.requirePhoto?'checked':''} onchange="updateCtStep('${s.id}','requirePhoto',this.checked)"/> 📸 Photo</label><label style="text-transform:none;font-size:12.5px;display:flex;align-items:center;gap:5px;cursor:pointer;font-weight:500"><input type="checkbox" ${s.requireSignature?'checked':''} onchange="updateCtStep('${s.id}','requireSignature',this.checked)"/> ✍️ Signature</label><label style="text-transform:none;font-size:12.5px;display:flex;align-items:center;gap:5px;cursor:pointer;font-weight:500"><input type="checkbox" ${s.requireLocationCheck?'checked':''} onchange="updateCtStep('${s.id}','requireLocationCheck',this.checked)"/> 📍 Location</label></div></div>`).join('');
}
async function loadCtMembers(){
  if(!_ctRoom)return;
  try{const d=await api('GET','/rooms/member/'+_ctRoom);_ctMembers=(d.data?.members||[]).filter(m=>m.user&&m.status!=='removed');}catch(e){_ctMembers=[];}
}
function renderCtMembers(){
  const el=$('ct-members-list');
  if(!_ctMembers.length){el.innerHTML='<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">No members. Add employees first.</div>';updateCtCount();return;}
  el.innerHTML=_ctMembers.map(m=>{const u=m.user||m,id=u._id||u.id,sel=_ctSelectedIds.has(id);return`<div class="member-select-item ${sel?'selected':''}" onclick="ctToggle('${id}',this)">${avatarHTML(u,{size:32})}<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.fullName||u.username||'—')}</div><div style="font-size:11px;color:var(--text3)">@${esc(u.username||'—')}</div></div><div style="font-size:11px;color:${u.isOnline?'var(--green)':'var(--text3)'}">● ${u.isOnline?'Online':'Offline'}</div><div class="check">${sel?'✓':''}</div></div>`;}).join('');
  $('ct-member-count').textContent=_ctMembers.length+' member'+(_ctMembers.length!==1?'s':'');
  updateCtCount();
}
function ctToggle(id,el){if(_ctSelectedIds.has(id)){_ctSelectedIds.delete(id);el.classList.remove('selected');el.querySelector('.check').textContent='';}else{_ctSelectedIds.add(id);el.classList.add('selected');el.querySelector('.check').textContent='✓';}updateCtCount();}
function ctSelectAll(){_ctMembers.forEach(m=>{const id=(m.user||m)._id||(m.user||m).id;if(id)_ctSelectedIds.add(id);});renderCtMembers();}
function ctClearAll(){_ctSelectedIds.clear();renderCtMembers();}
function updateCtCount(){const n=_ctSelectedIds.size;$('ct-selected-info').textContent=n?`${n} selected`:'None selected';}
async function submitCreateTask(){
  clearA('alert-create-task');
  if(!_ctSelectedIds.size){showA('alert-create-task','error','Select at least one employee');return;}
  if(!_ctRoom){showA('alert-create-task','error','No room selected');return;}
  for(let i=0;i<_ctSteps.length;i++){
    const s=_ctSteps[i];
    if(!s.title.trim()){showA('alert-create-task','error',`Step ${i+1}: Title is required`);return;}
    if(!s.startDatetime||!s.endDatetime){showA('alert-create-task','error',`Step ${i+1}: Times are required`);return;}
    if(new Date(s.endDatetime)<=new Date(s.startDatetime)){showA('alert-create-task','error',`Step ${i+1}: End must be after start`);return;}
  }
  const btn=$('btn-create-task');btn.innerHTML='<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Creating…';btn.disabled=true;
  try{
    const d=await api('POST','/tasks',{roomId:_ctRoom,title:$('ct-title').value.trim(),note:$('ct-note').value.trim()||undefined,priority:$('ct-priority').value,startDatetime:new Date($('ct-start').value).toISOString(),endDatetime:new Date($('ct-end').value).toISOString(),isFieldWork:$('ct-track').checked,assignedTo:Array.from(_ctSelectedIds),steps:_ctSteps.map(s=>({title:s.title,startDatetime:new Date(s.startDatetime).toISOString(),endDatetime:new Date(s.endDatetime).toISOString(),validations:{requirePhoto:s.requirePhoto,requireSignature:s.requireSignature,signatureFrom:s.requireSignature?'customer':null,requireLocationCheck:s.requireLocationCheck,requireLocationTrace:$('ct-track').checked}}))});
    if(d.success){toast(`Task created for ${_ctSelectedIds.size} employee${_ctSelectedIds.size>1?'s':''}!`,'success');closeM('modal-create-task');loadTasks(1);loadTaskDashboard();}
    else showA('alert-create-task','error',esc(d.message||'Failed'));
  }catch(e){showA('alert-create-task','error','Network error');}
  finally{btn.innerHTML='🚀 Create Task';btn.disabled=false;}
}

/* ── Export ──────────────────────────────────────────────────── */
function exportReport(type, format) {
  const from  = $('att-date-from')?.value || '';
  const to    = $('att-date-to')?.value   || '';
  const empId = $('att-emp-filter')?.value || '';
  let url = `${BASE}/export/${type}/${format}?`;
  if (from)  url += 'from=' + from + '&';
  if (to)    url += 'to='   + to   + '&';
  if (empId) url += 'employeeId=' + empId + '&';
  fetch(url, { headers: { 'Authorization': 'Bearer ' + _token } })
    .then(r => { if (!r.ok) throw new Error('Export failed — ' + r.status); return r.blob(); })
    .then(b => { const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`taskroom-${type}-${Date.now()}.${format==='excel'?'xlsx':'pdf'}`;a.click();URL.revokeObjectURL(u);toast('Export downloaded!','success'); })
    .catch(e => toast('Export failed: ' + e.message, 'error'));
}

/* ── Media Viewers ───────────────────────────────────────────── */
function openLightbox(url, caption) { $('lightbox-img').src=url; $('lightbox-caption').textContent=caption||''; $('lightbox').classList.add('open'); }
function closeLightbox() { $('lightbox').classList.remove('open'); $('lightbox-img').src=''; }
function openSigViewer(src, caption) {
  let imgSrc = src;
  if (src && !src.startsWith('data:') && !src.startsWith('http')) imgSrc = 'data:image/png;base64,' + src;
  const img = $('sig-view-img'); if(img){img.src=imgSrc;img.style.cssText='max-width:100%;max-height:60vh;object-fit:contain;background:#fff;border-radius:8px;padding:16px';}
  const cap = $('sig-caption'); if(cap) cap.textContent = caption||'Customer Signature';
  $('sig-viewer')?.classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLightbox(); $('sig-viewer')?.classList.remove('open'); }
  });
  $('sig-viewer')?.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
});

/* ══════════════════════════════════════════════════════════════
   MOBILE NAVIGATION
══════════════════════════════════════════════════════════════ */
let _mobHistory = [];
let _mobCurrentPage = 'overview';

function mobNavGo(pageId, title, btn) {
  closeMobDrawer();
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  showPage(pageId, $('nav-' + pageId));
  _mobCurrentPage = pageId;
  hideMobBackBar();
}
function mobDrawerGo(pageId, title) {
  closeMobDrawer();
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  showPage(pageId, $('nav-' + pageId));
  _mobCurrentPage = pageId;
  hideMobBackBar();
}
function toggleMobMenu() {
  const drawer = $('mob-more-drawer');
  if (!drawer) return;
  if (drawer.style.display === 'none' || !drawer.style.display) {
    drawer.style.display = 'block';
    setTimeout(() => document.addEventListener('click', closeMobDrawerOutside, { once: true }), 10);
  } else closeMobDrawer();
}
function closeMobDrawer() { const d=$('mob-more-drawer'); if(d) d.style.display='none'; }
function closeMobDrawerOutside(e) { const d=$('mob-more-drawer'); if(d&&!d.contains(e.target)) closeMobDrawer(); }
function closeSidebarMobile() { $('sidebar')?.classList.remove('open'); $('sidebar-overlay')?.classList.remove('show'); }
function showMobBackBar(title) { const b=$('mob-back-bar'),t=$('mob-back-title');if(b)b.classList.add('show');if(t)t.textContent=title||'Detail'; }
function hideMobBackBar() { $('mob-back-bar')?.classList.remove('show'); }
function mobGoBack() { closeTaskPanel(); $('att-panel')?.classList.remove('open'); document.querySelectorAll('.overlay.open').forEach(m=>m.classList.remove('open')); hideMobBackBar(); }
function applyMobNavTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const nav = $('mob-bottom-nav'); if(!nav) return;
  nav.style.background   = isDark ? 'rgba(8,13,18,.96)' : 'rgba(255,255,255,.97)';
  nav.style.borderTopColor = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)';
  const drawer = $('mob-more-drawer'); if(drawer) drawer.style.background = isDark ? 'var(--surface)' : '#fff';
}
