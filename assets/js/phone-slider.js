/* ═══════════════════════════════════════════════════════════════
   TASKROOM — PHONE SCREEN SLIDESHOW (landing page)

   Shows several app screenshots one after another inside the phone frame.
   • Slides are the <img class="tr-slide" data-base="…"> tags in index.html.
     data-base is the file path WITHOUT extension (png / jpg / jpeg / webp
     are tried in that order). Comma-separate alternatives.
   • Timing: data-interval on .tr-slides = total ms per slide (default 3200,
     of which ~0.8 s is the transition). data-v busts the browser cache.
   • Pauses while the pointer is over the phone, while the tab is hidden and
     while the phone is scrolled out of view; resumes with the time that was
     left. Missing images are skipped automatically.
   • prefers-reduced-motion: no autoplay (dots still switch slides).
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var EXTS = ['png', 'jpg', 'jpeg', 'webp'];
  var FADE_MS = 900;                                   // must be ≥ the CSS transition on .tr-slide

  function probe(img, version) {                       // find the first existing file for this slide
    var cands = [];
    (img.getAttribute('data-base') || '').split(',').forEach(function (b) {
      b = b.trim(); if (!b) return;
      EXTS.forEach(function (e) { cands.push(b + '.' + e + (version ? '?v=' + version : '')); });
    });
    return new Promise(function (resolve) {
      var i = 0, p = new Image();
      p.onload = function () { img.src = p.src; resolve(true); };
      p.onerror = function () { if (++i < cands.length) p.src = cands[i]; else resolve(false); };
      if (!cands.length) return resolve(false);
      p.src = cands[0];
    });
  }

  function init() {
    var box = document.querySelector('.tr-slides');
    if (!box) return;
    var screen = box.closest('.tr-phone-screen'), frame = box.closest('.tr-phone-frame') || screen;
    var wrap = box.closest('.l-app-phone-wrap');
    var version = box.getAttribute('data-v') || '';
    var interval = Math.max(1500, parseInt(box.getAttribute('data-interval'), 10) || 3200);
    var imgs = Array.prototype.slice.call(box.querySelectorAll('.tr-slide'));

    Promise.all(imgs.map(function (im) { return probe(im, version); })).then(function (ok) {
      var slides = imgs.filter(function (im, i) { if (!ok[i]) { im.remove(); return false; } return true; });
      if (!slides.length) return;                      // nothing found → built-in preview stays visible
      screen.classList.add('has-shot');

      var cur = 0, timer = null, dueAt = 0, remaining = interval;
      var hovering = false, hidden = document.hidden, offscreen = false, started = false;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      var dots = [];

      if (slides.length > 1 && wrap) {                 // progress dots (also clickable)
        var bar = document.createElement('div'); bar.className = 'tr-dots'; bar.setAttribute('role', 'tablist');
        bar.style.setProperty('--tr-int', interval + 'ms');
        slides.forEach(function (_, i) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'tr-dot';
          b.setAttribute('role', 'tab'); b.setAttribute('aria-label', 'Show screen ' + (i + 1));
          b.innerHTML = '<i></i>'; b.addEventListener('click', function () { go(i, true); });
          bar.appendChild(b); dots.push(b);
        });
        wrap.appendChild(bar);
        wrap.__trBar = bar;
      }

      function show(i, instant) {
        var prev = slides[cur], next = slides[i];
        if (prev !== next) {
          slides.forEach(function (s) { s.classList.remove('prev'); });
          prev.classList.remove('on'); prev.classList.add('prev');        // old slide stays opaque underneath → no dip to black
          if (instant) next.classList.add('instant');
          next.classList.add('on');
          if (instant) { void next.offsetWidth; next.classList.remove('instant'); }
          setTimeout(function () { prev.classList.remove('prev'); }, FADE_MS);
        } else next.classList.add('on');
        cur = i;
        dots.forEach(function (d, k) {                 // restart the active dot's fill animation
          d.classList.remove('on'); if (k === i) { void d.offsetWidth; d.classList.add('on'); }
          d.setAttribute('aria-selected', k === i ? 'true' : 'false');
        });
      }

      function canRun() { return !hovering && !hidden && !offscreen && !reduce && slides.length > 1 && started; }
      function schedule(ms) {
        clearTimeout(timer); dueAt = Date.now() + ms;
        timer = setTimeout(function () { show((cur + 1) % slides.length); remaining = interval; schedule(interval); }, ms);
      }
      function sync() {                                // single place that pauses / resumes
        var paused = !canRun();
        if (dotsBar()) dotsBar().classList.toggle('paused', paused);
        if (paused) { if (timer) { remaining = Math.max(200, dueAt - Date.now()); clearTimeout(timer); timer = null; } }
        else if (!timer) schedule(remaining);
      }
      function dotsBar() { return wrap && wrap.__trBar; }
      function go(i, manual) {
        show(i, false); remaining = interval; clearTimeout(timer); timer = null;
        if (dotsBar()) { dotsBar().classList.remove('paused'); }
        sync();
      }

      show(0, true);
      started = true;
      remaining = interval;
      sync();

      frame.addEventListener('pointerenter', function (e) { if (e.pointerType === 'touch') return; hovering = true; sync(); });
      frame.addEventListener('pointerleave', function (e) { if (e.pointerType === 'touch') return; hovering = false; sync(); });
      document.addEventListener('visibilitychange', function () { hidden = document.hidden; sync(); });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { offscreen = !en[0].isIntersecting; sync(); }, { threshold: 0.35 }).observe(frame);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
