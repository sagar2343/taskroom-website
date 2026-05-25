/* ═══════════════════════════════════════════════════════════════
   TASKROOM — AUTH: login, create org, upgrade
═══════════════════════════════════════════════════════════════ */

'use strict';

/* ── CREATE ORG ─────────────────────────────────────────────── */
async function submitCreate(e) {
  e.preventDefault();
  const name    = $('in-name').value.trim();
  const email   = $('in-email').value.trim();
  const mgrName = $('in-mgr-name').value.trim();
  const mgrUser = $('in-mgr-user').value.trim();
  const mgrPass = $('in-mgr-pass').value;
  const mgrMob  = $('in-mgr-mobile').value.trim();
  const domain  = $('in-domain').value.trim();

  ['fg-name','fg-email','fg-mgr-name','fg-mgr-user','fg-mgr-pass','fg-mgr-mobile']
    .forEach(id => $(id)?.classList.remove('field-error'));
  clearA('alert-create');

  let ok = true;
  if (!name)                              { $('fg-name')?.classList.add('field-error'); ok = false; }
  if (!email || !/[^@]+@[^@]+\.[^@]+/.test(email)) { $('fg-email')?.classList.add('field-error'); ok = false; }
  if (!mgrName)                           { $('fg-mgr-name')?.classList.add('field-error'); ok = false; }
  if (!mgrUser || mgrUser.length < 3)    { $('fg-mgr-user')?.classList.add('field-error'); ok = false; }
  if (!mgrPass || mgrPass.length < 6)    { $('fg-mgr-pass')?.classList.add('field-error'); ok = false; }
  if (!mgrMob  || mgrMob.length !== 10)  { $('fg-mgr-mobile')?.classList.add('field-error'); ok = false; }

  if (domain && domain.includes('@')) {
    showA('alert-create', 'amber', '⚠️ The <strong>Company Domain</strong> field should be like <code>company.com</code> — not an email address.');
    $('in-domain').focus(); return;
  }
  if (!ok) return;

  const btn = $('btn-create');
  const setBtn = (t) => { btn.innerHTML = t; btn.disabled = !!t.includes('spinner'); };
  setBtn('<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Checking…');
  btn.disabled = true;

  try {
    // Step 1: pre-check username
    setBtn('<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Checking username…');
    const checkRes = await api('POST', '/auth/check-username', { username: mgrUser }, null).catch(() => null);
    if (checkRes && !checkRes.available) {
      $('fg-mgr-user')?.classList.add('field-error');
      showA('alert-create', 'error', `Username <strong>"${esc(mgrUser)}"</strong> is already taken. Please choose another.`);
      return;
    }

    // Step 2: create org
    setBtn('<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Creating organization…');
    const orgBody = {
      name, contactEmail: email,
      contactPhone: $('in-phone').value.trim() || undefined,
      domain: domain || undefined,
      address: {
        city:    $('in-city')?.value.trim()    || undefined,
        state:   $('in-state')?.value.trim()   || undefined,
        pincode: $('in-pin')?.value.trim()     || undefined,
        country: $('in-country')?.value.trim() || 'India',
      },
    };
    const orgRes = await api('POST', '/organization/create', orgBody, null);
    if (!orgRes.success) { showA('alert-create', 'error', esc(orgRes.message || 'Could not create organization.')); return; }

    const rawOrg = orgRes.data?.organization || orgRes.data;
    const code   = rawOrg.code || '';
    if (!code) { showA('alert-create', 'error', 'Organization created but no code returned. Contact support.'); return; }

    // Step 3: register manager
    setBtn('<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Creating your account…');
    const regRes = await api('POST', '/auth/register', {
      username: mgrUser, password: mgrPass, fullName: mgrName,
      mobile: mgrMob, role: 'manager', organizationCode: code,
    }, null);

    if (!regRes.success) {
      showA('alert-create', 'error', `
        <strong>Account creation failed</strong><br>${esc(regRes.message || 'Please try again.')}<br><br>
        Your org code is <strong style="font-family:monospace;color:var(--primary-light)">${esc(code)}</strong>.
        ${regRes.field === 'username' ? '<br>Please try a different username.' : ''}
      `);
      if (regRes.field === 'username') $('fg-mgr-user')?.classList.add('field-error');
      if (regRes.field === 'mobile')   $('fg-mgr-mobile')?.classList.add('field-error');
      return;
    }

    // Step 4: store session
    _token = regRes.data?.token;
    _user  = regRes.data?.user;

    if (!_token || !_user) {
      // Fallback login
      setBtn('<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Signing in…');
      const loginRes = await api('POST', '/auth/login', { username: mgrUser, password: mgrPass, organizationCode: code }, null);
      if (!loginRes.success) {
        showA('alert-create', 'amber', `<strong>Almost there!</strong> Please <a href="#" onclick="closeM('modal-create');showLogin();return false" style="color:var(--primary-light);font-weight:700">sign in</a> with code <strong style="font-family:monospace">${esc(code)}</strong>.`);
        return;
      }
      _token = loginRes.data.token; _user = loginRes.data.user;
    }

    // Step 5: fetch full org
    try {
      const oid = _user.organization?._id || _user.organization || rawOrg._id;
      const od  = await api('GET', '/organization/detail/' + oid);
      _org = od.success ? (od.data?.organization || od.data) : rawOrg;
    } catch (_) { _org = rawOrg; }

    save();
    closeM('modal-create');

    // Step 6: success modal
    $('post-create-code').textContent = code;
    if ($('success-code')) $('success-code').textContent = code;

    const planOffer = $('post-create-plan-offer');
    const isTrial   = ['growth','business','enterprise'].includes(_selectedLandingPlan);
    if (planOffer) {
      const label = { growth:'Growth', business:'Business', enterprise:'Enterprise' }[_selectedLandingPlan] || 'Growth';
      planOffer.innerHTML = isTrial
        ? `<div class="alert alert-info" style="text-align:left;margin-bottom:0"><div><strong>✅ 14-day ${esc(label)} Trial Active!</strong><div style="font-size:12.5px;margin-top:4px;line-height:1.6">Full ${esc(label)} features for 14 days. Org Code: <strong style="font-family:monospace;color:var(--primary-light)">${esc(code)}</strong></div></div></div>`
        : `<div class="alert alert-success" style="text-align:left;margin-bottom:0"><div><strong>🎉 You're all set!</strong><div style="font-size:12.5px;margin-top:4px">Org Code: <strong style="font-family:monospace;color:var(--primary-light)">${esc(code)}</strong></div></div></div>`;
    }

    openM('modal-post-create');
  } catch (err) {
    console.error('[submitCreate]', err);
    showA('alert-create', 'error', 'Network error. Please check your connection and try again.');
  } finally {
    btn.innerHTML = '🚀 Create Organization &amp; Account';
    btn.disabled  = false;
  }
}

async function postCreateGoDash() {
  if (_token && _user) { await refreshOrgData(); showDash(); return; }
  const code = ($('post-create-code')?.textContent || '').trim();
  showLogin();
  if (code && code !== '—') {
    const lcode = $('in-lcode'); if (lcode) lcode.value = code;
    toast('Please sign in with your new manager credentials.', 'info');
  }
}

/* ── LOGIN ──────────────────────────────────────────────────── */
async function submitLogin(e) {
  e.preventDefault();
  const code = $('in-lcode').value.trim().toUpperCase();
  const user = $('in-luser').value.trim();
  const pass = $('in-lpass').value;

  ['fg-lcode','fg-luser','fg-lpass'].forEach(id => $(id)?.classList.remove('field-error'));
  let ok = true;
  if (!code) { $('fg-lcode')?.classList.add('field-error'); ok = false; }
  if (!user) { $('fg-luser')?.classList.add('field-error'); ok = false; }
  if (!pass) { $('fg-lpass')?.classList.add('field-error'); ok = false; }
  if (!ok) return;

  const btn = $('btn-login');
  btn.innerHTML = '<span class="spinner spinner-xs" style="display:inline-block;border-top-color:#fff;margin:0 5px -2px 0"></span> Signing in…';
  btn.disabled  = true;
  clearA('alert-login');

  try {
    const d = await api('POST', '/auth/login', { username: user, password: pass, organizationCode: code }, null);
    if (d.success) {
      if (d.data?.user?.role === 'employee') {
        const name = d.data.user.fullName || d.data.user.username || 'there';
        $('alert-login').innerHTML = `
          <div style="background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(245,158,11,.04));border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:20px;text-align:center">
            <div style="font-size:36px;margin-bottom:10px">📱</div>
            <div style="font-size:15px;font-weight:800;color:var(--amber);margin-bottom:6px">Hey ${esc(name)}, use the mobile app!</div>
            <div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:16px">This dashboard is for <strong style="color:var(--text)">managers only</strong>.<br>Employees use the <strong style="color:var(--text)">TaskRoom mobile app</strong>.</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <a href="/download/TaskRoom_v1.apk" download style="display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(61,220,132,.12);border:1px solid rgba(61,220,132,.3);color:#3ddc84;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76a2 2 0 0 0 2.73.75l10.49-6.07-2.9-2.9-10.32 8.22zm17.29-13.53L17.03 8l-3.06 3.06 3.06 3.06 3.5-2.01a1.5 1.5 0 0 0-.06-2.88zM2.12.46A1.5 1.5 0 0 0 2 1.12V22.9a1.5 1.5 0 0 0 .12.65l.07.07L13.5 12 2.19.39l-.07.07zM15.97 5.03l-10.06-5.8A2 2 0 0 0 3.18.22L13.5 12l2.47-6.97z"/></svg>
                Download for Android
              </a>
              <div style="display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:var(--text3);padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600">iOS — Coming Soon</div>
            </div>
            <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(245,158,11,.15);font-size:12px;color:var(--text3)">Are you a manager? Make sure you're using the correct account.</div>
          </div>`;
        $('in-lpass').value = ''; return;
      }

      _user = d.data.user; _token = d.data.token;
      const oid = _user.organization?._id || _user.organization;
      const od  = await api('GET', '/organization/detail/' + oid);
      _org = od.success ? (od.data?.organization || od.data) : _user.organization || {};
      save();
      closeM('modal-login');
      await refreshOrgData();
      showDash();
    } else {
      showA('alert-login', 'error', esc(d.message || 'Invalid credentials'));
    }
  } catch (err) {
    showA('alert-login', 'error', 'Network error. Please try again.');
  } finally {
    btn.innerHTML = 'Sign In →'; btn.disabled = false;
  }
}

/* ── BILLING UPGRADE ─────────────────────────────────────────── */
async function startUpgrade(plan, label, amount) {
  if (!window.Razorpay) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    } catch (err) { toast('Failed to load payment gateway', 'error'); return; }
  }

  const defaultEmail = _org?.billingEmail || _org?.contactEmail || _user?.email || '';
  const userEmail    = await showEmailDialog(label, amount, defaultEmail);
  if (!userEmail) return;

  try {
    toast('Creating payment order…', 'info');
    const d = await api('POST', '/billing/create-order', { plan, billingCycle: _billingCycle, billingEmail: userEmail });
    if (!d.success) { toast(d.message || 'Failed to create order', 'error'); return; }

    const o   = d.data;
    if (!o.razorpayKeyId) { toast('Payment gateway not configured on server', 'error'); return; }

    const rzp = new window.Razorpay({
      key: o.razorpayKeyId, amount: o.totalAmountPaise, currency: 'INR',
      name: 'TaskRoom', order_id: o.orderId,
      description: `${o.planLabel || label} — ${_billingCycle === 'annual' ? 'Annual (Save 16%)' : 'Monthly'}`,
      prefill: { email: userEmail, contact: _user?.mobile || '' },
      notes: { plan, billingCycle: _billingCycle, orgId: _org?._id || '' },
      theme: { color: '#137fec' },
      handler: async function(resp) {
        toast('Verifying payment…', 'info');
        try {
          const v = await api('POST', '/billing/verify-payment', {
            razorpayOrderId: resp.razorpay_order_id,
            razorpayPaymentId: resp.razorpay_payment_id,
            razorpaySignature: resp.razorpay_signature,
            subscriptionId: o.subscriptionId,
          });
          if (v.success) {
            toast(`🎉 Payment successful! You are now on the ${label} plan.`, 'success');
            await loadBillingStatus();
            setTimeout(loadBilling, 800);
          } else { toast(v.message || 'Payment verification failed', 'error'); }
        } catch (e) { toast('Verification error: ' + e.message, 'error'); }
      },
      modal: { ondismiss: () => toast('Payment cancelled', 'amber') },
    });
    rzp.open();
  } catch (e) {
    toast(e.message || 'Payment error — please try again', 'error');
    console.error('[startUpgrade]', e);
  }
}

function showEmailDialog(label, amount, defaultEmail) {
  return new Promise(resolve => {
    const amtDisplay = _billingCycle === 'annual'
      ? `₹${amount.toLocaleString('en-IN')} for 12 months (billed now)`
      : `₹${amount.toLocaleString('en-IN')}/month`;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border2);border-radius:var(--r3);padding:28px;width:100%;max-width:420px;font-family:'Sora',sans-serif">
      <div style="font-size:19px;font-weight:800;margin-bottom:6px;letter-spacing:-.3px">Upgrade to ${esc(label)}</div>
      <div style="font-size:13.5px;color:var(--text2);margin-bottom:20px">You'll be charged <strong style="color:var(--text)">${amtDisplay}</strong>. A receipt will be emailed to you.</div>
      <label style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:7px">Billing Email</label>
      <input id="upg-email" type="email" value="${esc(defaultEmail)}" placeholder="billing@yourcompany.com"
        style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:11px 13px;font-size:14px;color:var(--text);font-family:'Sora',sans-serif;margin-bottom:18px;outline:none;transition:border .2s"
        onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'"/>
      <div style="display:flex;gap:10px">
        <button id="upg-cancel" class="btn btn-ghost w-full">Cancel</button>
        <button id="upg-confirm" class="btn btn-primary w-full">Continue to Payment →</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    const confirm = overlay.querySelector('#upg-confirm');
    const cancel  = overlay.querySelector('#upg-cancel');
    const input   = overlay.querySelector('#upg-email');
    const done = val => { overlay.remove(); resolve(val); };
    confirm.onclick = () => {
      const v = input.value.trim();
      if (!v || !/\S+@\S+\.\S+/.test(v)) { input.style.borderColor = 'var(--red)'; input.focus(); return; }
      done(v);
    };
    cancel.onclick  = () => done(null);
    overlay.addEventListener('click', e => { if (e.target === overlay) done(null); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm.click(); });
    setTimeout(() => input?.focus(), 50);
  });
}

function setBillingCycle(cycle) {
  _billingCycle = cycle;
  loadBilling();
}
