// Matías's call list: businesses with a preview, best ones first, with tap-to-call, WhatsApp and SMS.
// Private: lives at /llamar/<CALL_KEY> (Worker secret). Results are logged as 'call' events.
import { esc } from './site.js';

const C = 'America/Chicago', M = 'America/Denver', P = 'America/Los_Angeles';
const TZ = {
  AL: C, AR: C, IA: C, IL: C, KS: C, LA: C, MN: C, MO: C, MS: C, ND: C, NE: C, OK: C, SD: C, TN: C, TX: C, WI: C,
  AZ: 'America/Phoenix', CO: M, ID: 'America/Boise', MT: M, NM: M, UT: M, WY: M,
  CA: P, NV: P, OR: P, WA: P, AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
};
const tzOf = (region) => TZ[String(region || '').toUpperCase()] || 'America/New_York';
const RESULTS = { nadie: 'No atendió', luego: 'Otro día', si: 'Le interesa', no: 'No le interesa' };
const FINAL = new Set(['si', 'no']);

function localTime(tz) {
  const d = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(d));
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d);
  const label = new Intl.DateTimeFormat('es-AR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  return { hour, day, label, good: day !== 'Sun' && hour >= 9 && hour < 17 };
}

const digits = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? '1' + d : d;
};

export async function callList(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.slug, s.name, s.email, s.data, s.sent_at,
       (SELECT COUNT(*) FROM events e WHERE e.slug = s.slug AND e.type = 'human_view') AS seen,
       (SELECT detail FROM events e WHERE e.slug = s.slug AND e.type = 'call' ORDER BY created_at DESC LIMIT 1) AS last_call,
       (SELECT created_at FROM events e WHERE e.slug = s.slug AND e.type = 'call' ORDER BY created_at DESC LIMIT 1) AS last_call_at
     FROM sites s
     WHERE s.status = 'preview' AND s.slug != 'demo' AND s.html IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM suppress x WHERE x.email = lower(s.email) AND x.why IN ('opt-out', 'replied'))
     ORDER BY seen DESC, s.sent_at IS NULL, s.sent_at DESC LIMIT 150`
  ).all();
  const now = Math.floor(Date.now() / 1000);
  const rows = [];
  for (const r of results) {
    const d = JSON.parse(r.data || '{}');
    if (!digits(d.phone)) continue;
    if (FINAL.has(r.last_call)) continue;
    if (r.last_call_at && now - r.last_call_at < 20 * 3600) continue;
    const t = localTime(tzOf(d.region));
    rows.push({ ...r, d, t });
  }
  // the ones you can call right now go first; inside each group the order above stays (seen > emailed recently > rest)
  rows.sort((a, b) => Number(b.t.good) - Number(a.t.good));
  return rows.slice(0, 20);
}

export function renderCalls(rows, key) {
  const cards = rows.map((r) => {
    const url = `https://${r.slug}.webcrafts.page`;
    const tel = '+' + digits(r.d.phone);
    const sms = `Hi, this is Matias from WebCrafts. Here's the new version of your website I made: ${url} Anything on it can change. Just reply here.`;
    const tags = [
      r.seen ? '<b class="hot">abrió su web</b>' : '',
      r.sent_at ? `mail ${Math.max(0, Math.round((Date.now() / 1000 - r.sent_at) / 86400))} días atrás` : 'sin mail',
      r.last_call ? `antes: ${esc(RESULTS[r.last_call] || r.last_call)}` : '',
    ].filter(Boolean).join(' · ');
    const hours = (r.d.hours || []).map((h) => esc(h.join(' '))).join('<br>');
    const btn = (k, l) => `<button name="r" value="${k}">${l}</button>`;
    return `<section class="${r.t.good ? '' : 'later'}">
<h2>${esc(r.name.split(';')[0])}</h2>
<p class="meta">${esc(r.d.category || '')} · ${esc(r.d.city || '')}, ${esc(r.d.region || '')} · allá son las <b>${r.t.label}</b>${r.t.good ? '' : ' (fuera de horario)'}</p>
<p class="meta">${tags}</p>
${hours ? `<p class="hours">${hours}</p>` : ''}
<div class="row">
<a class="call" href="tel:${tel}">📞 ${esc(r.d.phone)}</a>
<a href="${url}" target="_blank">Ver su web nueva</a>
</div>
<div class="row">
<a href="https://wa.me/${digits(r.d.phone)}?text=${encodeURIComponent(sms)}">WhatsApp</a>
<a href="sms:${tel}?&body=${encodeURIComponent(sms)}">SMS</a>
</div>
<form method="post" action="/llamar/${key}/${r.slug}" class="row res">${Object.entries(RESULTS).map(([k, l]) => btn(k, l)).join('')}</form>
</section>`;
  }).join('\n');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Para llamar</title>
<style>
body{margin:0;font:16px/1.4 -apple-system,system-ui,sans-serif;background:#f4f1ea;color:#1d1b18}
main{max-width:560px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:4px 0 12px}
details{background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:14px}
summary{font-weight:600}
details p{margin:8px 0}
section{background:#fff;border-radius:12px;padding:14px;margin-bottom:12px}
section.later{opacity:.6}
h2{font-size:19px;margin:0 0 4px}
.meta{margin:2px 0;color:#5d574e;font-size:14px}
.hot{color:#b4410f}
.hours{font-size:13px;color:#5d574e;margin:6px 0}
.row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.row a,.row button{flex:1;text-align:center;padding:11px 8px;border-radius:10px;border:1px solid #d6cfc2;background:#fbfaf7;color:#1d1b18;text-decoration:none;font:inherit;font-size:15px}
.row a.call{background:#1f6f43;border-color:#1f6f43;color:#fff;font-weight:600}
.res button{font-size:13px;padding:9px 4px}
</style></head><body><main>
<h1>Para llamar (${rows.length})</h1>
<details><summary>Qué decir</summary>
<p><i>"Hi, is this the owner? This is Matias from WebCrafts."</i></p>
<p><i>"I made a new version of your website, using what's already on it."</i> Si dice "mail X días atrás": <i>"I sent it to you by email. Did you get a chance to see it?"</i></p>
<p><i>"Anything on it can change. If you like it, it's $49 a month, hosting and changes included. No contract."</i></p>
<p><i>"Can I text you the link?"</i> → botón WhatsApp o SMS.</p>
<p>Si no está el dueño: <i>"When is a good time to reach the owner?"</i> → "Otro día".</p>
</details>
${cards || '<p>No hay nadie para llamar ahora.</p>'}
</main></body></html>`;
}

export async function logCall(env, slug, result) {
  if (!RESULTS[result]) return;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT email FROM sites WHERE slug = ?').bind(slug).first();
  if (!row) return;
  const batch = [env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(slug, 'call', result, now)];
  // once they answered on the phone, no more cold emails (no follow-up either): Matías takes it from there
  if (FINAL.has(result) && row.email)
    batch.push(env.DB.prepare('INSERT OR IGNORE INTO suppress (email, why, created_at) VALUES (?, ?, ?)').bind(row.email.toLowerCase(), 'call: ' + result, now));
  await env.DB.batch(batch);
}
