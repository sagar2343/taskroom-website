/* ═══════════════════════════════════════════════════════════════
   TASKROOM — LANDING PAGE JAVASCRIPT
   FIXES:
   1. Particle field opacity reduced (content readability)
   2. Animation loops never break — use flag to pause rendering
   3. Loops restart when returning to landing from dashboard
   4. Cursor stops affecting dashboard performance
   5. Light/dark theme aware particle colours
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── Global animation state ──────────────────────────────────── */
let _landingVisible   = false;   // true only when landing view is shown
let _particleRenderer = null;    // Three.js renderer reference
let _particleScene    = null;
let _particleCamera   = null;
let _particleMat      = null;    // PointsMaterial — update opacity on theme change
let _particleRunning  = false;   // prevent double-starting the loop
let _cursorRunning    = false;

/* ── Called by showLanding() in dashboard.js ─────────────────── */
window._onLandingShow = function () {
  _landingVisible = true;
  const canvas = document.getElementById('hero-canvas');
  if (canvas) canvas.style.display = '';
  _updateParticleTheme();      // sync colours to current theme instantly
};

/* ── Called by showDash() in dashboard.js ────────────────────── */
window._onLandingHide = function () {
  _landingVisible = false;
  const canvas = document.getElementById('hero-canvas');
  if (canvas) canvas.style.display = 'none';
  const dot  = document.getElementById('tr-cursor');
  const ring = document.getElementById('tr-cursor-ring');
  if (dot)  dot.style.opacity  = '0';
  if (ring) ring.style.opacity = '0';
};

/* ── Mobile hamburger ────────────────────────────────────────── */
function toggleLandMenu() {
  const ham  = $('land-ham');
  const menu = $('land-mob-menu');
  if (!ham || !menu) return;
  ham.classList.toggle('open');
  menu.classList.toggle('open');
}

/* ── Scroll animations (IntersectionObserver) ────────────────── */
function initLandingAnimations() {
  const els = document.querySelectorAll('.l-fade-up');
  if (!els.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => obs.observe(el));
}

/* ── Nav scroll shadow ───────────────────────────────────────── */
function initNavScroll() {
  const nav = $('land-nav');
  if (!nav) return;
  const handler = () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', handler, { passive: true });
  handler();
}

/* ── Sticky CTA bar ──────────────────────────────────────────── */
function initStickyCTA() {
  const bar = $('sticky-cta-bar');
  if (!bar) return;
  window.addEventListener('scroll', () => {
    if (!_landingVisible) { bar.classList.remove('visible'); return; }
    const pct = window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight);
    bar.classList.toggle('visible', pct > 0.65);
  }, { passive: true });
}

/* ── Hero accent bar animation ───────────────────────────────── */
function initHeroAccents() {
  setTimeout(() => {
    const b1 = $('acc-bar');  if (b1) b1.style.width = '78%';
    const b2 = $('acc-bar2'); if (b2) b2.style.width = '91%';
  }, 1800);
}

/* ── FAQ accordion ───────────────────────────────────────────── */
function initFAQ() {
  document.querySelectorAll('.l-faq-q').forEach(btn => {
    btn.addEventListener('click', function () {
      const item    = this.closest('.l-faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.l-faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });
}

/* ── Smooth scroll for anchor links ──────────────────────────── */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#l-"], a[href^="#features"], a[href^="#hero"]').forEach(a => {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
        $('land-ham')?.classList.remove('open');
        $('land-mob-menu')?.classList.remove('open');
      }
    });
  });
}

/* ── Plan chooser modal ──────────────────────────────────────── */
let _selectedLandingPlan = 'starter';

function openPlanChooser(preselect) {
  _selectedLandingPlan = preselect || 'starter';
  openM('modal-plan-chooser');
  document.querySelectorAll('.plan-chooser-card').forEach(c => {
    c.style.opacity = '0.7'; c.style.borderColor = 'var(--border)';
  });
  const idx = { starter: 0, growth: 1, business: 2, enterprise: 3 }[_selectedLandingPlan] ?? 0;
  const cards = document.querySelectorAll('.plan-chooser-card');
  if (cards[idx]) { cards[idx].style.opacity = '1'; cards[idx].style.borderColor = 'var(--primary)'; }
}

function selectLandingPlan(plan, el) {
  _selectedLandingPlan = plan;
  document.querySelectorAll('.plan-chooser-card').forEach(c => {
    c.style.borderColor = 'var(--border)'; c.style.opacity = '0.75';
  });
  el.style.borderColor = 'var(--primary)'; el.style.opacity = '1';
  setTimeout(() => {
    closeM('modal-plan-chooser');
    openCreateOrgWithPlan(plan);
  }, 220);
}

function openCreateOrgWithPlan(plan) {
  clearA('alert-create');
  const labels = { starter: 'Starter (₹199/month)', growth: 'Growth — 14-day trial free', business: 'Business — 14-day trial free', enterprise: 'Enterprise' };
  const sub = document.querySelector('#modal-create .modal-sub');
  if (sub) sub.textContent = `Setting up your workspace on the ${labels[plan] || plan} plan.`;
  openM('modal-create');
}

function openCreateOrg() { _selectedLandingPlan = 'starter'; openM('modal-create'); clearA('alert-create'); }
function showLogin()      { openM('modal-login'); clearA('alert-login'); }

/* ── Pricing toggle ──────────────────────────────────────────── */
function updateLandingPricing(yearly) {
  _billingCycle = yearly ? 'yearly' : 'monthly';   // ✅ keep state in sync
  if (_landingPlans.length) renderLandingPricingGrid(_landingPlans, yearly);
  updateLandCalc();   // ✅ recalc whenever billing cycle changes
}

/* ── ROI Calculator ──────────────────────────────────────────── */
const STATIC_PLANS = {
  199: { label: 'Starter',  maxEmp: 5,  yearly: 1999 },
  499: { label: 'Growth',   maxEmp: 25, yearly: 4999 },
  999: { label: 'Business', maxEmp: 75, yearly: 9999 },
};

function updateLandCalc() {
  const planEl = $('l-calc-plan');
  const empEl  = $('l-calc-emp');
  if (!planEl || !empEl) return;

  const emps = parseInt(empEl.value) || 1;
  const empValEl = $('l-emp-val');
  if (empValEl) empValEl.textContent = emps;

  // ✅ Use API plans if loaded, otherwise fall back to static
  let plansMap;
  if (_landingPlans && _landingPlans.length > 0) {
    plansMap = _landingPlans
      .filter(p => !p.isContactSales)
      .reduce((acc, p) => {
        acc[p.monthlyPrice] = {
          label:   p.label,
          slug:    p.slug,
          maxEmp:  p.maxEmployees === -1 ? Infinity : p.maxEmployees,
          monthly: p.monthlyPrice,
          yearly:  p.yearlyPrice,
        };
        return acc;
      }, {});
  } else {
    plansMap = Object.fromEntries(
      Object.entries(STATIC_PLANS).map(([k, v]) => [k, { ...v, monthly: Number(k) }])
    );
  }

  const base = parseInt(planEl.value) || 499;
  // ✅ Check yearly toggle state
  const isYearly   = !!($('l-yearly-toggle')?.checked);
  let   plan       = plansMap[base] || Object.values(plansMap)[0];
  let   totalBase  = base;          // monthly price used for display
  let   note       = '';

  const maxEmp = plan?.maxEmp === Infinity ? 9999 : (plan?.maxEmp ?? 9999);

  if (emps > maxEmp) {
    const fitting = Object.entries(plansMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .find(([, p]) => p.maxEmp === Infinity || p.maxEmp >= emps);

    if (fitting) {
      totalBase = Number(fitting[0]);
      plan      = fitting[1];
      note      = `⬆ ${plan.label} plan recommended for ${emps} employees`;
    } else {
      totalBase = 1999;
      note      = `⬆ Enterprise plan — contact us for ${emps}+ employees`;
    }
  }

  // ✅ Show monthly or effective-monthly-from-yearly
  const displayMonthly = isYearly && plan?.yearly
    ? Math.round(plan.yearly / 12)
    : totalBase;

  const annual = isYearly && plan?.yearly
    ? plan.yearly
    : totalBase * 12;

  const setEl = (id, val, style) => {
    const e = $(id);
    if (e) { e.textContent = val; if (style) Object.assign(e.style, style); }
  };

  setEl('l-calc-total',    fmtINR(displayMonthly));
  setEl('l-calc-annual',   `= ${fmtINR(annual)}/year${isYearly ? ' (billed yearly)' : ''}`);
  setEl('l-calc-base',     fmtINR(displayMonthly));
  setEl('l-calc-seat-lbl', `Employees (${emps})`);
  setEl('l-calc-seat',
    emps <= maxEmp ? 'Included' : 'Exceeds plan limit',
    { color: emps <= maxEmp ? 'var(--green)' : 'var(--amber)' }
  );

  const hoursSaved = emps * 3.5;
  const moneySaved = hoursSaved * 4 * 150;
  setEl('l-calc-time-saved', `${Math.round(hoursSaved)}hrs/week · ${fmtINR(Math.round(moneySaved))}/month saved`);

  const warnEl = $('l-calc-warn');
  if (warnEl) { warnEl.textContent = note; warnEl.style.display = note ? 'block' : 'none'; }

  const totalEl = $('l-calc-total');
  if (totalEl) {
    totalEl.style.transition = 'transform .15s ease';
    totalEl.style.transform  = 'scale(1.08)';
    setTimeout(() => { totalEl.style.transform = 'scale(1)'; }, 150);
  }
}

/* ── Load plans from API ─────────────────────────────────────── */
async function loadLandingPlans() {
  try {
    const res = await fetch(BASE + '/billing/plans');
    const d   = await res.json();
    if (!d.success || !d.data?.length) return;
    _landingPlans = d.data;
    renderLandingPricingGrid(_landingPlans, false);
    renderLandingPlanChooser(_landingPlans);
    updateLandCalcFromPlans(_landingPlans);
  } catch (e) {
    console.warn('[loadLandingPlans]', e);
    const grid = $('l-pricing-grid');
    if (grid) grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--red);font-size:13px">Failed to load pricing. <a href="mailto:support@taskroom.in" style="color:var(--primary-light)">Contact us</a>.</div>`;
  }
}

function renderLandingPricingGrid(plans, yearly) {
  const grid = $('l-pricing-grid');
  if (!grid) return;

  const FEAT_LABELS = {
    liveTracking: '📍 Live GPS tracking', attendanceAnalytics: '📊 Attendance analytics',
    taskHistory: '🕒 Task history', notifications: '🔔 Push notifications',
    performanceDashboard: '🏆 Performance dashboard', routeHistory: '🗺️ Route history',
    advancedReports: '📁 Advanced reports', exportReports: '📄 PDF & Excel export',
    prioritySupport: '⭐ Priority support', premiumAnalytics: '✨ Premium analytics',
  };

  grid.innerHTML = plans.map(p => {
    const isFeatured   = p.slug === 'growth';
    const isEnterprise = !!p.isContactSales;
    const monthly      = p.monthlyPrice || 0;
    const yearlyTotal  = p.yearlyPrice  || 0;
    const annualSaving = monthly > 0 ? Math.round(monthly * 12 - yearlyTotal) : 0;

    let priceHtml;
    if (isEnterprise) {
      const entBase = monthly > 0 ? `₹${monthly.toLocaleString('en-IN')}+/month` : 'Custom pricing';
      priceHtml = `<div class="l-price-amount" style="font-size:20px;margin-top:6px;line-height:1.2">Custom<br>Pricing</div><div class="l-price-period" style="margin-top:6px">${entBase}</div><div class="l-price-yearly" style="visibility:hidden">-</div>`;
    } else {
      const display = yearly && yearlyTotal ? Math.round(yearlyTotal / 12) : monthly;
      priceHtml = `<div class="l-price-amount"><sup>&#8377;</sup><span class="lp-amount">${display}</span></div>
        <div class="l-price-period"><span class="lp-period">${yearly ? 'per month (billed yearly)' : 'per month'}</span></div>
        <div class="l-price-yearly">&#8377;${yearlyTotal.toLocaleString('en-IN')}/year · save &#8377;${annualSaving.toLocaleString('en-IN')}</div>`;
    }

    const lv = v => (v == null || v === -1 || v === 99999) ? 'Unlimited' : v;
    const limitsLine = isEnterprise
      ? 'Unlimited employees · Rooms · Managers'
      : `Up to ${lv(p.maxEmployees)} employees · ${lv(p.maxRooms)} Rooms · ${lv(p.maxManagers)} Manager${(p.maxManagers != null && p.maxManagers !== 1) ? 's' : ''}`;

    const prevLabel   = plans[plans.indexOf(p) - 1]?.label;
    const allFeatures = [...(prevLabel && !isEnterprise ? [`Everything in ${prevLabel}`] : []), ...(p.featureLabels || [])].slice(0, 7);
    const lockedFeats = Object.entries(FEAT_LABELS).filter(([k]) => !p.features?.[k]).map(([, l]) => `<li class="dim">${l}</li>`).slice(0, 2).join('');

    let ctaHtml;
    if (isEnterprise)    ctaHtml = `<a href="mailto:hello@taskroom.in" class="l-price-cta">Talk to sales &#8594;</a>`;
    else if (isFeatured) ctaHtml = `<button class="l-price-cta featured" onclick="openPlanChooser('${p.slug}')">Start 14-day trial &#8594;</button>`;
    else                 ctaHtml = `<button class="l-price-cta" onclick="openPlanChooser('${p.slug}')">Get started &#8594;</button>`;

    return `<div class="l-price-card ${isFeatured ? 'featured' : ''}">
      ${isFeatured ? '<div class="l-price-recommended">MOST POPULAR</div>' : ''}
      <div class="l-price-plan">${esc(p.label)}</div>
      ${priceHtml}
      <div class="l-price-seats">${limitsLine}</div>
      <hr class="l-price-divider">
      <ul class="l-price-features">${allFeatures.map(f => `<li>${esc(f)}</li>`).join('')}${lockedFeats}</ul>
      ${ctaHtml}
    </div>`;
  }).join('');

  initLandingAnimations();
}

function renderLandingPlanChooser(plans) {
  const grid = $('l-plan-chooser-grid');
  if (!grid) return;

  grid.innerHTML = plans.map((p) => {
    const isFeatured   = p.slug === 'growth';
    const isEnterprise = !!p.isContactSales;
    const monthly      = p.monthlyPrice || 0;
    const yearlyTotal  = p.yearlyPrice  || 0;
    const lv = v => (v === -1 || v === 99999) ? 'Unlimited' : v;
    const subtitle = isEnterprise
      ? `₹${monthly.toLocaleString('en-IN')}+/month · Unlimited`
      : `₹${yearlyTotal.toLocaleString('en-IN')}/year · ${lv(p.maxEmployees)} emp · ${lv(p.maxRooms)} rooms`;

    const feats    = (p.featureLabels || []).slice(0, 5).map(f => `<li>&#10003; ${esc(f)}</li>`).join('');
    const btnCls   = isFeatured ? 'btn btn-primary w-full' : 'btn btn-ghost w-full';
    const btnText  = isEnterprise ? 'Talk to sales →' : isFeatured ? 'Start 14-day trial →' : 'Get started →';
    const bdrStyle = isFeatured
      ? 'border:2px solid var(--primary);background:linear-gradient(160deg,var(--surface),rgba(19,127,236,.06));position:relative'
      : 'border:2px solid var(--border);background:var(--surface2)';

    return `<div onclick="selectLandingPlan('${p.slug}',this)" class="plan-chooser-card"
        style="${bdrStyle};border-radius:var(--r);padding:20px;cursor:pointer;transition:all .2s">
      ${isFeatured ? `<div style="position:absolute;top:-12px;left:16px;background:linear-gradient(90deg,var(--primary),#4a9ff5);color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px">MOST POPULAR</div>` : ''}
      <div style="font-size:11px;font-weight:700;color:${isFeatured ? 'var(--primary-light)' : 'var(--text3)'};text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;margin-top:${isFeatured ? '8' : '0'}px">${esc(p.label)}</div>
      <div style="font-size:32px;font-weight:900;letter-spacing:-1.5px;margin-bottom:2px">
        ${isEnterprise ? 'Custom' : `&#8377;${monthly.toLocaleString('en-IN')}<span style="font-size:14px;font-weight:400;color:var(--text2)">/mo</span>`}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:14px">${subtitle}</div>
      <ul style="list-style:none;font-size:12.5px;color:var(--text2);display:flex;flex-direction:column;gap:6px">${feats}</ul>
      <button class="${btnCls}" style="margin-top:16px;font-size:13px">${btnText}</button>
    </div>`;
  }).join('');
}

function updateLandCalcFromPlans(plans) {
  const sel = $('l-calc-plan');
  if (!sel) return;
  sel.innerHTML = plans.filter(p => !p.isContactSales).map(p =>
    `<option value="${p.monthlyPrice}" data-max="${p.maxEmployees}" data-yearly="${p.yearlyPrice}" ${p.slug === 'growth' ? 'selected' : ''}>
      ${esc(p.label)} (₹${p.monthlyPrice.toLocaleString('en-IN')}/month — up to ${p.maxEmployees === -1 ? 'unlimited' : p.maxEmployees} emp)
    </option>`
  ).join('');
  updateLandCalc();
}

/* ── Invite helper ───────────────────────────────────────────── */
function openInviteHelper() {
  if (!_org?.code) return;
  const code = _org.code;
  const msg  = `Hi! Join our TaskRoom workspace.\n\n1. Download the TaskRoom app\n2. Register with org code: ${code}\n3. Your manager will assign tasks\n\nCode: ${code}`;
  if (navigator.share) {
    navigator.share({ title: 'Join TaskRoom', text: msg }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(msg).then(() => toast('Invite message copied!', 'success')).catch(() => {});
    toast(`Share org code ${code} with your employees.`, 'info');
  }
}

/* ── Video showcase toggle ───────────────────────────────────── */
function toggleShowcaseVideo(video) {
  const icon = $('play-icon');
  if (video.paused) {
    video.play();
    if (icon) icon.setAttribute('d', 'M8 5v14l11-7z');
  } else {
    video.pause();
    if (icon) icon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
  }
}

/* ══════════════════════════════════════════════════════════════
   PREMIUM CURSOR
   FIX: Loop never breaks — uses _landingVisible flag to hide/show.
   FIX: Hidden and inert when dashboard is active.
══════════════════════════════════════════════════════════════ */
function initPremiumCursor() {
  const dot  = document.getElementById('tr-cursor');
  const ring = document.getElementById('tr-cursor-ring');
  if (!dot || !ring || window.innerWidth <= 768) return;
  if (_cursorRunning) return;
  _cursorRunning = true;

  let mx = -200, my = -200, rx = -200, ry = -200;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  document.addEventListener('mouseover', e => {
    if (!_landingVisible) return;
    if (e.target.closest('a,button,[role=button],.l-price-cta,.hero-btn-primary,.hero-btn-ghost')) {
      dot.style.width  = '20px'; dot.style.height  = '20px';
    }
  });
  document.addEventListener('mouseout', e => {
    if (!_landingVisible) return;
    if (e.target.closest('a,button,[role=button],.l-price-cta,.hero-btn-primary,.hero-btn-ghost')) {
      dot.style.width  = '12px'; dot.style.height  = '12px';
    }
  });

  (function animCursor() {
    requestAnimationFrame(animCursor);   // ← always keep loop alive

    if (!_landingVisible) {
      dot.style.opacity  = '0';
      ring.style.opacity = '0';
      return;
    }

    dot.style.opacity  = '1';
    ring.style.opacity = '1';

    rx += (mx - rx) * 0.13;
    ry += (my - ry) * 0.13;
    dot.style.left  = mx + 'px'; dot.style.top  = my + 'px';
    ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
  })();
}

/* ══════════════════════════════════════════════════════════════
   THREE.JS PARTICLE FIELD
   FIX: Loop never breaks — uses _landingVisible flag to skip render.
   FIX: Opacity reduced significantly for better content readability.
   FIX: Colours react to light/dark theme via _updateParticleTheme().
   FIX: Re-uses existing renderer if called again (no double-start).
══════════════════════════════════════════════════════════════ */
function _isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function _updateParticleTheme() {
  if (!_particleMat) return;
  // In light mode make particles slightly darker/less vivid and more transparent
  _particleMat.opacity = _isLightTheme() ? 0.12 : 0.22;
  _particleMat.needsUpdate = true;
}

function initParticleField() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  // If already running reuse the renderer — just make visible again
  if (_particleRunning) {
    canvas.style.display = _landingVisible ? '' : 'none';
    return;
  }
  _particleRunning = true;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  _particleRenderer = renderer;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 30;
  _particleScene  = scene;
  _particleCamera = camera;

  const N = 1200;
  const positions = new Float32Array(N * 3);
  const colors    = new Float32Array(N * 3);

  // Dark-theme base colours
  const cA = new THREE.Color('#1a7fff');
  const cB = new THREE.Color('#00e5a0');
  const cC = new THREE.Color('#ffffff');

  for (let i = 0; i < N; i++) {
    positions[i * 3]     = (Math.random() - .5) * 80;
    positions[i * 3 + 1] = (Math.random() - .5) * 60;
    positions[i * 3 + 2] = (Math.random() - .5) * 40;
    const t = Math.random();
    const c = t < .5 ? cA.clone().lerp(cB, t * 2) : cB.clone().lerp(cC, (t - .5) * 2);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  // ── KEY FIX: reduced opacity for better content readability ──
  const mat = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: _isLightTheme() ? 0.12 : 0.22,   // was 0.5 — much lower now
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  _particleMat = mat;

  const particles = new THREE.Points(geo, mat);
  scene.add(particles);

  // Connection lines — also lower opacity
  const lPositions = [], lColors = [];
  for (let i = 0; i < 60; i++) {
    const a = Math.floor(Math.random() * N), b = Math.floor(Math.random() * N);
    lPositions.push(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
    lPositions.push(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
    lColors.push(.1, .5, 1, .1, .9, .6);
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.Float32BufferAttribute(lPositions, 3));
  lGeo.setAttribute('color',    new THREE.Float32BufferAttribute(lColors, 3));
  const lMat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true,
    opacity: 0.04,          // was 0.07
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.LineSegments(lGeo, lMat));

  let mouseX = 0, mouseY = 0;
  document.addEventListener('mousemove', e => {
    mouseX = (e.clientX / window.innerWidth  - .5) * 2;
    mouseY = (e.clientY / window.innerHeight - .5) * 2;
  });

  const pos = geo.attributes.position;
  let t = 0;

  // Listen for theme changes and update opacity
  const themeObs = new MutationObserver(() => _updateParticleTheme());
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function animParticles() {
    requestAnimationFrame(animParticles);  // ← ALWAYS keep loop alive

    if (!_landingVisible) {
      canvas.style.display = 'none';
      return;                              // skip render when in dashboard
    }

    canvas.style.display = '';
    t += 0.0004;

    for (let i = 0; i < N; i++) {
      pos.array[i * 3 + 1] += Math.sin(t + i * .11) * 0.0018;
      pos.array[i * 3]     += Math.cos(t + i * .07) * 0.0009;
      if (pos.array[i * 3]     >  40) pos.array[i * 3]     = -40;
      if (pos.array[i * 3]     < -40) pos.array[i * 3]     =  40;
      if (pos.array[i * 3 + 1] >  30) pos.array[i * 3 + 1] = -30;
      if (pos.array[i * 3 + 1] < -30) pos.array[i * 3 + 1] =  30;
    }
    pos.needsUpdate = true;

    camera.position.x += (mouseX * 4 - camera.position.x) * .035;
    camera.position.y += (-mouseY * 3 - camera.position.y) * .035;
    camera.lookAt(0, 0, 0);

    particles.rotation.z += 0.00012;
    renderer.render(scene, camera);
  }
  animParticles();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

/* ══════════════════════════════════════════════════════════════
   MAIN INIT — single initLanding() function
══════════════════════════════════════════════════════════════ */
function initLanding() {
  _landingVisible = true;   // mark landing as visible on init

  initNavScroll();
  initLandingAnimations();
  initStickyCTA();
  initHeroAccents();
  initFAQ();
  initSmoothScroll();
  updateLandCalc();
  loadLandingPlans();

  /* Close mobile menu when clicking links */
  document.querySelectorAll('#land-mob-menu a').forEach(a => {
    a.addEventListener('click', () => {
      $('land-ham')?.classList.remove('open');
      $('land-mob-menu')?.classList.remove('open');
    });
  });

  /* Premium cursor — desktop only */
  initPremiumCursor();

  /* Three.js particle field — slight delay for fonts/layout to settle */
  setTimeout(initParticleField, 200);
}