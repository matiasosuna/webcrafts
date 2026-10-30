// Client site template. Four layouts × palettes × font pairs, picked per business so no two previews look alike.
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// a preview counts as seen by a person only after 5s open with JS (mail link scanners don't wait)
const SEEN = `<script>setTimeout(function(){try{navigator.sendBeacon('/_seen')}catch(e){}},5000)</script>`;

// display face, its Google Fonts query, weight, body face; caps = set headings in uppercase
const FONTS = [
  { h: 'Fraunces', q: 'Fraunces:wght@600', w: 600, b: 'Inter' },
  { h: 'Playfair Display', q: 'Playfair+Display:wght@700', w: 700, b: 'Source Sans 3' },
  { h: 'DM Serif Display', q: 'DM+Serif+Display', w: 400, b: 'DM Sans' },
  { h: 'Archivo Black', q: 'Archivo+Black', w: 400, b: 'Archivo' },
  { h: 'Bricolage Grotesque', q: 'Bricolage+Grotesque:wght@800', w: 800, b: 'Work Sans' },
  { h: 'Cormorant Garamond', q: 'Cormorant+Garamond:wght@600', w: 600, b: 'Karla' },
  { h: 'Oswald', q: 'Oswald:wght@600', w: 600, b: 'Nunito Sans', caps: 1 },
  { h: 'Syne', q: 'Syne:wght@800', w: 800, b: 'Manrope' },
  { h: 'Young Serif', q: 'Young+Serif', w: 400, b: 'Figtree' },
  { h: 'Anton', q: 'Anton', w: 400, b: 'Barlow', caps: 1 },
];

// bg, ink, accent, text-on-accent, soft surface
const PALETTES = [
  ['#fbf7f1', '#2a1d14', '#b4441c', '#fff', '#f2e6d6'],
  ['#16130f', '#f4ecdf', '#e0a43a', '#16130f', '#231e18'],
  ['#102019', '#eef3ea', '#c9d66b', '#102019', '#183028'],
  ['#f6f5ee', '#22261a', '#5b6b2b', '#fff', '#e8e9d9'],
  ['#f5f7fb', '#0f1b33', '#1f4fd1', '#fff', '#e2e9f8'],
  ['#ffffff', '#0e2529', '#0f8a8a', '#fff', '#e4f3f2'],
  ['#fff8f6', '#3a1f25', '#b03a5b', '#fff', '#f7e3e6'],
  ['#1d1220', '#f6eaf2', '#e7a1c0', '#1d1220', '#2a1b2e'],
  ['#ffffff', '#141414', '#f2b705', '#141414', '#f3f3f0'],
  ['#f7f4f0', '#1b1b1b', '#c0392b', '#fff', '#ebe5de'],
  ['#12161c', '#e9edf2', '#ff7a1a', '#12161c', '#1b222b'],
  ['#f4f7f3', '#1f2a22', '#2f7a4f', '#fff', '#e0ebe2'],
];

const BY_THEME = {
  food:    { fonts: [0, 1, 2, 5, 8, 9], pal: [0, 1, 2, 3, 9, 10], lay: ['cover', 'editorial', 'split', 'cover'] },
  beauty:  { fonts: [1, 2, 5, 8, 0], pal: [6, 7, 0, 11, 3], lay: ['cover', 'editorial', 'split'] },
  trades:  { fonts: [3, 6, 9, 4], pal: [8, 9, 10, 4], lay: ['bold', 'split', 'cover'] },
  auto:    { fonts: [3, 6, 9, 4], pal: [10, 8, 9, 1], lay: ['bold', 'cover', 'split'] },
  health:  { fonts: [4, 7, 0, 8, 2], pal: [4, 5, 11, 6], lay: ['split', 'editorial', 'cover'] },
  clean:   { fonts: [4, 7, 8], pal: [5, 4, 11], lay: ['split', 'bold'] },
  outdoor: { fonts: [8, 4, 0, 3], pal: [11, 3, 2, 0], lay: ['cover', 'bold', 'split'] },
  pets:    { fonts: [8, 4, 0], pal: [0, 11, 6, 3], lay: ['split', 'cover', 'editorial'] },
  pro:     { fonts: [4, 7, 0, 8, 2, 1], pal: [4, 5, 1, 3, 10], lay: ['split', 'editorial', 'bold', 'cover'] },
};

const ICONS = {
  trades: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  clean: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z"/>',
  beauty: '<path d="M6 3l6 9 6-9M12 12v9M8 21h8"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M17 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
  health: '<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/>',
  auto: '<path d="M5 16l1.5-5h11L19 16M3 16h18v4H3zM7 20v1M17 20v1"/>',
  outdoor: '<path d="M12 3l7 10h-4l4 6H5l4-6H5z M12 19v3"/>',
  pro: '<path d="M4 7h16v12H4zM9 7V4h6v3M4 12h16"/>',
  pets: '<path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 20c-3 0-5-1.5-5-3.5S9 12 12 12s5 2.5 5 4.5S15 20 12 20z"/>',
};
const icon = (k, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.pro}</svg>`;

const telHref = (p) => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
const mapsHref = (d, name) =>
  'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([name, d.address, d.city, d.region].filter(Boolean).join(', '));
const fmtPhone = (p) => {
  const n = String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return n.length === 10 ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : p;
};
const txt = (v) => (Array.isArray(v) ? v.join(' ') : v || '').replace(/\.,/g, '. ');
const hash = (s, salt) => [...(salt + s)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 7);

// the business's own photos; served through /_p/<i> on the site so http-only and hotlink-protected images still load
export const photoList = (d) => (d.photos && d.photos.length ? d.photos : d.image ? [d.image] : []).slice(0, 8);

export function pickDesign(slug, d, nPhotos) {
  const o = BY_THEME[d.theme] || BY_THEME.pro;
  const lays = nPhotos ? o.lay : o.lay.filter((l) => l !== 'cover');
  return {
    layout: d.layout || lays[hash(slug, 'l') % lays.length],
    font: FONTS[d.font ?? o.fonts[hash(slug, 'f') % o.fonts.length]],
    pal: PALETTES[d.palette ?? o.pal[hash(slug, 'p') % o.pal.length]],
  };
}

export function renderSite(row, d, opt) {
  d = { ...d, phone: d.phone && fmtPhone(d.phone), about: txt(d.about), tagline: txt(d.tagline) };
  const photos = photoList(d).map((_, i) => `/_p/${i}`);
  const { layout, font: F, pal: P } = pickDesign(row.slug, d, photos.length);
  const [bg, ink, acc, on, soft] = P;
  const name = esc(row.name);
  const place = esc([d.city, d.region].filter(Boolean).join(', '));
  const services = (d.services || []).slice(0, 6);
  const hours = d.hours || [];
  const areas = d.areas || [];
  const hero = photos[0];
  const gallery = layout === 'editorial' ? photos : photos.slice(1);
  const call = (label, cls = 'btn') => (d.phone ? `<a class="${cls}" href="${telHref(d.phone)}">${label}</a>` : '');
  const dirs = `<a class="btn ghost" href="${mapsHref(d, row.name)}" target="_blank" rel="noopener">Get directions</a>`;
  const eyebrow = `<span class="eyebrow">${esc(d.category || '')}${place ? ' · ' + place : ''}</span>`;
  const h1 = `<h1>${esc(d.headline || row.name)}</h1>`;
  const lead = `<p class="lead">${esc(d.tagline)}</p>`;
  const r = layout === 'bold' ? '0' : '18px';

  const banner = opt.preview
    ? `<div class="wc-bar"><div class="wc-in"><span>👋 <b>This is a free preview</b> of a new website for ${name.replace(/\.$/, '')}. Like it? It's yours for ${esc(opt.price)}.</span><a class="wc-btn" href="${esc(opt.claimUrl)}">${esc(opt.cta)} →</a></div></div>${SEEN}`
    : '';
  const buy = opt.preview
    ? `<section class="wc-buy"><div class="wrap"><div><h2>Want this website?</h2><p>This is a first draft: photos, text, colors and sections can all change, just tell us. Keep it live for <b>${esc(opt.price)}</b> with hosting and unlimited changes included. No setup fee, cancel anytime. You can also use your own domain.</p></div>
      <div class="wc-buy-cta"><a class="wc-btn wc-big" href="${esc(opt.claimUrl)}">${esc(opt.cta)} →</a><small>${esc(opt.note)}</small></div></div></section>`
    : '';

  const heroes = {
    cover: `<section class="h-cover" style="background-image:linear-gradient(180deg,rgba(0,0,0,.2),rgba(0,0,0,.75)),url('${hero}')"><div class="wrap">
      ${eyebrow}${h1}${lead}<div class="cta">${call('Call now')}${dirs}</div></div></section>`,
    split: `<section class="h-split"><div class="wrap"><div>${eyebrow}${h1}${lead}<div class="cta">${call('Call now')}${dirs}</div></div>
      ${hero ? `<img src="${hero}" alt="${name}" class="h-img">` : `<div class="h-mark">${icon(d.theme, 120)}</div>`}</div></section>`,
    editorial: `<section class="h-ed"><div class="wrap">${eyebrow}${h1}<div class="h-ed-row">${lead}<div class="cta">${call('Call now')}${dirs}</div></div></div></section>`,
    bold: `<section class="h-bold"><div class="wrap"><div>${eyebrow}${h1}${lead}<div class="cta">${call(d.phone ? 'Call ' + esc(d.phone) : '')}${dirs}</div></div>
      ${hero ? `<img src="${hero}" alt="${name}" class="h-img">` : ''}</div></section>`,
  };

  const rows = `<div class="rows">${services.map((s) => `<div class="row"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join('')}</div>`;
  const svc = {
    split: `<div class="grid">${services.map((s) => `<div class="svc"><div class="ic">${icon(d.theme)}</div><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join('')}</div>`,
    cover: rows,
    editorial: rows,
    bold: `<div class="tiles">${services.map((s) => `<div class="tile"><h3>${esc(s.t)}</h3><p>${esc(s.d)}</p></div>`).join('')}</div>`,
  };
  const svcTitle = { food: 'On the menu', beauty: 'Services', health: 'How we help', trades: 'What we do', auto: 'What we fix' }[d.theme] || 'What we offer';

  const info = `<div class="info">
    ${d.address ? `<div><span>Address</span><b>${esc(d.address)}${place ? '<br>' + place : ''}</b></div>` : ''}
    ${d.phone ? `<div><span>Phone</span><b><a href="${telHref(d.phone)}">${esc(d.phone)}</a></b></div>` : ''}
    ${d.email ? `<div><span>Email</span><b>${esc(d.email)}</b></div>` : ''}
    ${hours.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}${d.category ? ' — ' + esc(d.category) : ''}${d.city ? ' in ' + esc(d.city) : ''}</title>
<meta name="description" content="${esc(d.tagline || `${row.name} — ${d.category || ''} in ${d.city || ''}`)}">
${opt.preview ? '<meta name="robots" content="noindex">' : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=${F.q}&family=${F.b.replace(/ /g, '+')}:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:${bg};--ink:${ink};--a:${acc};--on:${on};--soft:${soft};--line:color-mix(in srgb,var(--ink) 14%,transparent);--muted:color-mix(in srgb,var(--ink) 70%,var(--bg))}
*{box-sizing:border-box}html{scroll-behavior:smooth}img{max-width:100%;display:block}
body{margin:0;font:17px/1.65 '${F.b}',system-ui,sans-serif;color:var(--ink);background:var(--bg)}
h1,h2,h3{font-family:'${F.h}',Georgia,serif;font-weight:${F.w};line-height:1.05;margin:0;text-wrap:balance;${F.caps ? 'text-transform:uppercase;letter-spacing:.01em;' : ''}}
a{color:inherit}.wrap{max-width:1140px;margin:0 auto;padding:0 22px}
.wc-bar{position:sticky;top:0;z-index:20;background:#111;color:#fff;font:14px/1.4 system-ui,sans-serif}
.wc-in{max-width:1140px;margin:0 auto;padding:10px 22px;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.wc-btn{background:#22c55e;color:#06210f;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;white-space:nowrap;font-family:system-ui,sans-serif}
.wc-buy{background:#111;color:#fff;padding:64px 0;font-family:system-ui,sans-serif}.wc-buy .wrap{display:flex;justify-content:space-between;align-items:center;gap:32px;flex-wrap:wrap}
.wc-buy h2{font:800 clamp(28px,4vw,40px)/1.1 system-ui,sans-serif;text-transform:none;margin-bottom:10px}.wc-buy p{margin:0;max-width:52ch;color:#d4d4d4;font-size:18px}
.wc-buy-cta{display:grid;gap:8px;justify-items:start}.wc-big{font-size:19px;padding:16px 28px}.wc-buy small{color:#a3a3a3}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:18px}
.brand{font-family:'${F.h}',serif;font-weight:${F.w};font-size:22px;text-decoration:none;${F.caps ? 'text-transform:uppercase;' : ''}}
.btn{display:inline-flex;align-items:center;background:var(--a);color:var(--on);text-decoration:none;font-weight:600;padding:13px 22px;border-radius:${layout === 'bold' ? '0' : layout === 'editorial' ? '999px' : '10px'};border:2px solid var(--a)}
.btn.ghost{background:transparent;color:inherit;border-color:currentColor}
.cta{display:flex;gap:12px;flex-wrap:wrap}
.eyebrow{display:inline-block;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--a);margin-bottom:16px}
.lead{font-size:20px;color:var(--muted);max-width:40ch;margin:18px 0 28px}
section{padding:84px 0}section>.wrap>h2{font-size:clamp(30px,4.5vw,48px);margin-bottom:28px}
.h-cover{min-height:78vh;display:flex;align-items:flex-end;background-size:cover;background-position:center;color:#fff;padding:120px 0 64px}
.h-cover h1{font-size:clamp(44px,8vw,96px);max-width:14ch}.h-cover .lead{color:rgba(255,255,255,.9)}.h-cover .eyebrow{color:#fff}
.h-cover .btn:not(.ghost){background:#fff;color:#111;border-color:#fff}
.h-split .wrap{display:grid;grid-template-columns:1.1fr 1fr;gap:48px;align-items:center}.h-split h1{font-size:clamp(40px,6vw,68px)}
.h-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:${r}}
.h-mark{aspect-ratio:4/3;border-radius:18px;background:var(--soft);color:var(--a);display:grid;place-items:center}
.h-ed{padding:96px 0 72px;border-bottom:1px solid var(--line)}.h-ed h1{font-size:clamp(52px,11vw,150px);letter-spacing:-.02em}
.h-ed-row{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;flex-wrap:wrap;margin-top:28px}.h-ed .lead{margin:0}
.h-bold{background:var(--a);color:var(--on);padding:72px 0}.h-bold .wrap{display:grid;grid-template-columns:1.2fr 1fr;gap:40px;align-items:center}
.h-bold h1{font-size:clamp(44px,7.5vw,92px)}.h-bold .lead{color:inherit;opacity:.85}.h-bold .eyebrow{color:inherit;opacity:.8}
.h-bold .btn:not(.ghost){background:var(--on);color:var(--a);border-color:var(--on)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
.svc{border:1px solid var(--line);border-radius:16px;padding:24px;background:var(--soft)}
.svc .ic{color:var(--a);margin-bottom:14px}.svc h3{font-size:21px;margin-bottom:6px}.svc p{margin:0;color:var(--muted);font-size:16px}
.rows .row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:24px;padding:22px 0;border-top:1px solid var(--line)}
.rows .row h3{font-size:clamp(22px,3vw,30px)}.rows .row p{margin:0;color:var(--muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));border:2px solid var(--ink)}
.tile{padding:28px;border:1px solid var(--ink)}.tile h3{font-size:24px;margin-bottom:8px}.tile p{margin:0;color:var(--muted)}
.tile:hover{background:var(--a);color:var(--on)}.tile:hover p{color:inherit}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));grid-auto-rows:220px;gap:10px}
.gal img{width:100%;height:100%;object-fit:cover;border-radius:${layout === 'bold' ? '0' : '12px'}}
.gal img:first-child{grid-column:span 2;grid-row:span 2}
.about{background:var(--soft)}.about .wrap{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start}
.about h2{font-size:clamp(30px,4.5vw,48px)}.about p{font-size:19px;margin:0}.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:15px;background:var(--bg)}
.contact .wrap{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start}.contact h2{font-size:clamp(30px,4.5vw,48px);margin-bottom:16px}
.info{display:grid;border-top:1px solid var(--line)}.info div{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid var(--line)}
.info span{color:var(--muted)}.info b{font-weight:600;text-align:right}
footer{border-top:1px solid var(--line);padding:28px 0;font-size:14px;color:var(--muted)}
footer .wrap{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.callfab{display:none}
@media (max-width:820px){.h-split .wrap,.h-bold .wrap,.about .wrap,.contact .wrap,.rows .row{grid-template-columns:1fr}.rows .row{gap:6px}
section{padding:56px 0}.h-cover{min-height:70vh}.gal{grid-auto-rows:160px;grid-template-columns:1fr 1fr}
.callfab{display:flex;position:fixed;left:16px;right:16px;bottom:16px;z-index:15;justify-content:center;box-shadow:0 10px 30px -10px rgba(0,0,0,.4)}body{padding-bottom:84px}header.top .btn{display:none}}
</style></head><body>
${banner}
<header class="top"><div class="wrap"><a class="brand" href="#">${name}</a>${call(d.phone ? 'Call ' + esc(d.phone) : '')}</div></header>
<main>
${heroes[layout]}
${services.length ? `<section id="services"><div class="wrap"><h2>${svcTitle}</h2>${svc[layout]}</div></section>` : ''}
${gallery.length >= 2 ? `<section style="padding-top:0"><div class="wrap"><div class="gal">${gallery.map((p) => `<img src="${p}" alt="${name}" loading="lazy" onerror="this.remove()">`).join('')}</div></div></section>` : ''}
<section class="about"><div class="wrap"><h2>About ${name}</h2>
<div><p>${esc(d.about)}</p>${areas.length ? `<h3 style="margin-top:28px;font-size:20px">Areas we serve</h3><div class="chips">${areas.map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}</div></div></section>
<section class="contact" id="contact"><div class="wrap"><div><h2>Visit or call</h2><p class="lead" style="margin-top:0">${esc(d.contact_line || 'Call us and talk to a real person.')}</p>
<div class="cta">${call('Call now')}${dirs}</div></div>${info}</div></section></main>
${buy}
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${name}${place ? ' · ' + place : ''}</span><a href="https://webcrafts.page" style="text-decoration:none">Website by WebCrafts</a></div></footer>
${call('Call ' + esc(d.phone || ''), 'btn callfab')}
</body></html>`;
}

export function renderPaused(row) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(row.name)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;background:#f6f6f7;color:#222;padding:20px}div{max-width:420px;text-align:center}</style></head>
<body><div><h1 style="font-size:24px">${esc(row.name)}</h1><p>This website is temporarily unavailable.</p></div></body></html>`;
}

// A page designed just for this business (sites.html). We only add our preview bar + buy section, or a small credit once paid.
export function wrapBespoke(row, h, opt) {
  const name = esc(row.name).replace(/\.$/, '');
  const css = `<style>.wcx,.wcx *{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;letter-spacing:normal;text-transform:none}
.wcx-bar{position:sticky;top:0;z-index:2147483000;background:#111;color:#fff;font-size:14px;line-height:1.4}
.wcx-in{max-width:1140px;margin:0 auto;padding:10px 20px;display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.wcx-btn{background:#22c55e;color:#06210f!important;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px;white-space:nowrap}
.wcx-buy{background:#111;color:#fff;padding:64px 20px}.wcx-buy .wcx-w{max-width:1140px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:32px;flex-wrap:wrap}
.wcx-buy h2{font:800 clamp(28px,4vw,40px)/1.1 system-ui,sans-serif;margin:0 0 10px;color:#fff}.wcx-buy p{margin:0;max-width:52ch;color:#d4d4d4;font-size:18px}
.wcx-big{font-size:19px;padding:16px 28px;display:inline-block}.wcx-buy small{display:block;color:#a3a3a3;margin-top:8px}
.wcx-credit{text-align:center;font-size:12px;padding:12px;opacity:.7}.wcx-credit a{color:inherit}</style>`;
  let top = '', bottom = `<div class="wcx wcx-credit"><a href="https://webcrafts.page">Website by WebCrafts</a></div>`;
  if (opt.preview) {
    top = `<div class="wcx wcx-bar"><div class="wcx-in"><span>👋 <b>This is a free preview</b> of a new website for ${name}. Like it? It's yours for ${esc(opt.price)}.</span><a class="wcx-btn" href="${esc(opt.claimUrl)}">${esc(opt.cta)} →</a></div></div>${SEEN}`;
    bottom = `<section class="wcx wcx-buy"><div class="wcx-w"><div><h2>Want this website?</h2><p>This is a first draft: photos, text, colors and sections can all change, just tell us. Keep it live for <b>${esc(opt.price)}</b> with hosting and unlimited changes included. No setup fee, cancel anytime. You can also use your own domain.</p></div>
<div><a class="wcx-btn wcx-big" href="${esc(opt.claimUrl)}">${esc(opt.cta)} →</a><small>${esc(opt.note)}</small></div></div></section>`;
  }
  if (opt.preview) h = h.replace(/<head([^>]*)>/i, '<head$1><meta name="robots" content="noindex">');
  h = h.replace(/<\/head>/i, css + '</head>');
  h = h.replace(/<body([^>]*)>/i, `<body$1>${top}`);
  return /<\/body>/i.test(h) ? h.replace(/<\/body>/i, bottom + '</body>') : h + bottom;
}
