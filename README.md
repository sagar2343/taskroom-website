# TaskRoom — Frontend Codebase

Production-level SaaS frontend for TaskRoom field workforce management platform.

---

## 📁 File Structure

```
taskroom/
├── index.html              ← Single-page app (landing + dashboard SPA)
├── robots.txt              ← Crawl rules for all search engines
├── sitemap.xml             ← XML sitemap for indexing
├── manifest.json           ← PWA web app manifest
├── app_icon.png            ← App icon (place here)
├── og-image.png            ← OpenGraph share image (1200×630)
│
├── assets/
│   ├── css/
│   │   ├── tokens.css      ← Design tokens (CSS variables, dark+light)
│   │   ├── base.css        ← Reset, typography, buttons, forms, utilities
│   │   ├── landing.css     ← Landing page: hero, sections, footer
│   │   └── dashboard.css   ← Dashboard: sidebar, pages, modals, panels
│   │
│   ├── js/
│   │   ├── core.js         ← Config, state, utils, api(), storage, theme
│   │   ├── landing.js      ← Landing animations, pricing, FAQ, calc
│   │   ├── auth.js         ← Login, create org, billing upgrade flow
│   │   └── dashboard.js    ← All dashboard pages, panels, maps, mobile nav
│   │
│   └── (img, fonts — add as needed)
│       ├── hero-poster.jpg ← Static poster frame for hero video
│       ├── taskroom-promo.webm  ← Hero background video (WebM)
│       └── taskroom-promo.mp4  ← Hero background video (MP4 fallback)
```

---

## 🎨 Design System

All colours, spacing, radii, and typography live in `assets/css/tokens.css`.  
Both dark (default) and light themes are defined there — no other file should
define raw colour values.

**Typography stack:**
| Variable          | Font                  | Use                        |
|-------------------|-----------------------|----------------------------|
| `--font-sans`     | DM Sans               | Body copy, UI text         |
| `--font-display`  | Instrument Serif      | Headlines, hero h1/h2      |
| `--font-ui`       | Sora                  | Buttons, labels, nav       |
| `--font-mono`     | IBM Plex Mono         | Code, tags, metadata       |

---

## 🚀 Architecture

### Single-Page Application
The app is a fully self-contained SPA — no build step required.  
One HTML file, four CSS files, four JS files.

### View Routing
- **Landing view** (`#landing-view`) — shown to unauthenticated visitors
- **Dashboard view** (`#dashboard-view`) — shown after login
- Switching is handled by `showLanding()` / `showDash()` in `dashboard.js`

### Auth flow
1. User fills Create Org form → `submitCreate()` in `auth.js`
2. Pre-checks username → creates org → registers manager → auto-logs in
3. Session stored in `localStorage` as `taskroom_v3` JSON
4. On page load, `loadStorage()` checks for existing session → routes to dash

### API
All API calls go through `api(method, path, body, token)` in `core.js`.  
Base URL: `https://api.taskroom.in/api`

---

## 🌐 SEO

| Element              | Implementation                                   |
|----------------------|--------------------------------------------------|
| Title & meta         | Full primary/OG/Twitter tags in `<head>`         |
| Canonical URL        | `<link rel="canonical">`                         |
| Schema markup        | JSON-LD: SoftwareApplication, Organization, FAQ  |
| Semantic HTML        | `<section>`, `<article>`, `<nav>`, `<footer>`    |
| Heading hierarchy    | Single `<h1>` per view, proper h2/h3 nesting     |
| Accessibility        | ARIA labels, roles, `aria-hidden`, `tabindex`    |
| robots.txt           | `/robots.txt` with sitemap reference             |
| sitemap.xml          | `/sitemap.xml` with all indexable sections       |
| PWA manifest         | `/manifest.json` with icons and metadata         |
| Image ALT text       | All decorative images marked `aria-hidden="true"`|

---

## 🎬 Hero Video

Place your video files at:
```
assets/taskroom-promo.webm   (primary — better compression)
assets/taskroom-promo.mp4    (fallback — universal compat)
assets/hero-poster.jpg       (static frame shown while video loads)
```

The hero works fully without the video — the overlay grid pattern
(`hero-grid-overlay`) provides a clean dark background fallback.

---

## 💡 Adding Features

**New dashboard page:**
1. Add page HTML inside `#dashboard-view > .dash-main` with `id="page-{name}"`
2. Add sidebar item in `<aside class="sidebar">` with `id="nav-{name}"`
3. Add loader function in `dashboard.js` `showPage()` loaders object
4. Add mobile nav button if needed

**New CSS component:**
- Landing components → `assets/css/landing.css`
- Dashboard components → `assets/css/dashboard.css`
- Shared primitives → `assets/css/base.css`
- Never add raw colour values outside `tokens.css`

---

## 🔧 Deployment

This is a static site — no build step, no bundler.

**Nginx example:**
```nginx
server {
  listen 80;
  server_name taskroom.in www.taskroom.in;
  root /var/www/taskroom;
  index index.html;

  # SPA routing — serve index.html for all routes
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Cache static assets
  location ~* \.(css|js|png|jpg|webp|webm|mp4|ico|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Security headers
  add_header X-Frame-Options "SAMEORIGIN";
  add_header X-Content-Type-Options "nosniff";
  add_header Referrer-Policy "strict-origin-when-cross-origin";
  add_header Permissions-Policy "geolocation=(), microphone=()";
}
```

**CDN / Static host (Vercel, Netlify, Cloudflare Pages):**
- Root: `taskroom/`
- No build command
- Output: same folder

---

## 📦 Dependencies (CDN — no install needed)

| Library      | Version  | Usage                    | Load            |
|--------------|----------|--------------------------|-----------------|
| DM Sans      | —        | Body font                | Google Fonts    |
| Instrument Serif | —    | Display font             | Google Fonts    |
| Sora         | —        | UI font                  | Google Fonts    |
| IBM Plex Mono| —        | Mono font                | Google Fonts    |
| Leaflet.js   | 1.9.4    | GPS map                  | Lazy (on demand)|
| Razorpay SDK | latest   | Payment checkout         | Lazy (on demand)|

No npm, no webpack, no TypeScript — pure vanilla JS.

---

## 🐛 Known Constraints

- Hero video requires you to add `assets/taskroom-promo.webm` and `.mp4`
- GPS map (Leaflet) loads lazily when user opens GPS modal — not bundled
- Razorpay SDK loads lazily when user initiates upgrade — not bundled
- `localStorage` is used for session persistence — cleared on logout
- All modals are in `index.html` — intentional for zero network requests

---

*Built for TaskRoom — Made in India 🇮🇳*
