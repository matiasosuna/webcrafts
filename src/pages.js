import { esc } from './site.js';

const CSS = `
:root{--bg:#f7f5f0;--card:#fff;--ink:#1b1a17;--muted:#6b675e;--line:#e4e0d6;--a:#2f5d50;--a2:#e9f0ec}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 'Inter',system-ui,sans-serif;background:var(--bg);color:var(--ink)}
h1,h2,h3{font-family:'Fraunces',Georgia,serif;line-height:1.1;margin:0;text-wrap:balance}
a{color:inherit}.wrap{max-width:1040px;margin:0 auto;padding:0 20px}.muted{color:var(--muted)}
.nav{display:flex;justify-content:space-between;align-items:center;padding-block:18px}
.logo{font-family:'Fraunces',serif;font-weight:700;font-size:21px;text-decoration:none}.logo i{color:var(--a);font-style:normal}
.btn{display:inline-block;background:var(--a);color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;border:0;font:inherit;font-weight:600;cursor:pointer}
.btn.ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px}
section{padding:64px 0}h2{font-size:clamp(28px,4vw,40px);margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:800px){.grid{grid-template-columns:1fr}}
`;
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`;
const shell = (title, body, extraCss = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="Websites for local businesses. We build it, host it and keep it updated for $49/month.">
${FONTS}<style>${CSS}${extraCss}</style></head><body>${body}</body></html>`;

const nav = `<div class="wrap nav"><a class="logo" href="/">web<i>crafts</i></a><a class="btn ghost" href="mailto:matias@webcrafts.page">matias@webcrafts.page</a></div>`;

export function renderLanding(env) {
  return shell('WebCrafts — websites for local businesses', `${nav}
<header class="wrap" style="padding:56px 20px 40px"><p class="muted" style="font-weight:600;letter-spacing:.06em;text-transform:uppercase;font-size:13px">For plumbers, salons, cafés, cleaners, shops…</p>
<h1 style="font-size:clamp(40px,7vw,72px);max-width:14ch">Your business, online this week.</h1>
<p style="font-size:20px;max-width:46ch" class="muted">We build your website, host it and change anything you ask. One flat price: <b style="color:var(--ink)">${esc(env.PRICE_LABEL)}</b>. No setup fee, no contract.</p>
<p style="margin-top:26px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn" href="mailto:matias@webcrafts.page?subject=Website%20for%20my%20business">Get my free preview</a><a class="btn ghost" href="#how">How it works</a></p></header>
<section id="how"><div class="wrap"><h2>How it works</h2><div class="grid" style="margin-top:24px">
<div class="card"><h3>1. We build a preview</h3><p class="muted">Using your public business info. Free, no strings.</p></div>
<div class="card"><h3>2. You keep it if you like it</h3><p class="muted">One click to go live. Pay monthly by card through Stripe.</p></div>
<div class="card"><h3>3. Ask for changes anytime</h3><p class="muted">New photos, prices, hours, a new page — send it from your client panel.</p></div>
</div></div></section>
<section><div class="wrap"><h2>What's included</h2><div class="grid" style="margin-top:24px">
<div class="card"><h3>Hosting & security</h3><p class="muted">Fast global hosting, HTTPS, mobile-ready. Nothing to install.</p></div>
<div class="card"><h3>Unlimited small edits</h3><p class="muted">Text, photos, hours, prices, menus. Usually done within 2 business days.</p></div>
<div class="card"><h3>Your own address</h3><p class="muted">Free <i>yourname.webcrafts.page</i>, or we connect your own domain (.com) at cost.</p></div>
</div></div></section>
<section><div class="wrap"><h2>Questions</h2><div style="display:grid;gap:12px;margin-top:20px;max-width:720px">
<div class="card"><b>Can I cancel?</b><p class="muted" style="margin:6px 0 0">Yes, anytime from your panel. Your site stays up until the end of the paid month.</p></div>
<div class="card"><b>What if a payment fails?</b><p class="muted" style="margin:6px 0 0">We retry and email you. After 14 days unpaid the site is paused — never deleted — and comes back when you pay.</p></div>
<div class="card"><b>Who's behind this?</b><p class="muted" style="margin:6px 0 0">A small studio. Write to <a href="mailto:matias@webcrafts.page">matias@webcrafts.page</a> and a person answers.</p></div>
</div></div></section>
<footer class="wrap muted" style="padding:30px 20px;font-size:14px">© ${new Date().getFullYear()} WebCrafts</footer>`);
}

export function renderWelcome(row, env) {
  const panel = `${env.BASE}/panel/${row.panel_token}`;
  return shell('Welcome to WebCrafts', `${nav}<main class="wrap" style="padding-block:40px"><div class="card" style="max-width:620px">
<h1 style="font-size:34px">You're live 🎉</h1>
<p>${esc(row.name)} is now online at <a href="https://${esc(row.slug)}.webcrafts.page">${esc(row.slug)}.webcrafts.page</a>.</p>
<p>Your client panel (bookmark it — it's your private link):</p>
<p><a class="btn" href="${esc(panel)}">Open my panel</a></p>
<p class="muted" style="font-size:14px">From there you can ask for changes, connect your own domain, see invoices or cancel.</p></div></main>`);
}

export function renderPanel(row, reqs, { sent }) {
  const label = { active: 'Live', past_due: 'Payment issue — still live', paused: 'Paused', canceled: 'Canceled', preview: 'Preview' }[row.status] || row.status;
  return shell(`${row.name} — panel`, `${nav}<main class="wrap" style="padding-block:24px 60px;display:grid;gap:16px;max-width:760px">
<div class="card"><p class="muted" style="margin:0">Your website</p><h1 style="font-size:30px;margin:4px 0 8px">${esc(row.name)}</h1>
<p style="margin:0">Status: <b>${esc(label)}</b> · <a href="https://${esc(row.custom_domain || row.slug + '.webcrafts.page')}">${esc(row.custom_domain || row.slug + '.webcrafts.page')}</a></p></div>
<form class="card" method="post"><h2 style="font-size:24px">Request a change</h2>
${sent ? '<p style="background:var(--a2);padding:10px 14px;border-radius:10px">Got it — we will email you when it is done.</p>' : ''}
<p><label>Type <select name="kind" style="font:inherit;padding:6px"><option value="change">Change something on the site</option><option value="domain">Connect / buy my own domain</option><option value="other">Other</option></select></label></p>
<textarea name="text" rows="5" required placeholder="E.g. change Saturday hours to 9–2, add our new service ‘Water heater repair’…" style="width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px"></textarea>
<p class="muted" style="font-size:14px">Photos or files? Reply to any email from matias@webcrafts.page with them attached.</p>
<button class="btn">Send request</button></form>
${reqs.length ? `<div class="card"><h2 style="font-size:22px">Your requests</h2>${reqs.map((r) => `<p style="border-top:1px solid var(--line);padding-top:10px"><b>${r.status === 'done' ? '✅ Done' : '⏳ In progress'}</b> · <span class="muted">${new Date(r.created_at * 1000).toLocaleDateString('en-US')}</span><br>${esc(r.text)}</p>`).join('')}</div>` : ''}
<div class="card"><h2 style="font-size:22px">Billing</h2><p class="muted">Invoices, card, or cancel — handled securely by Stripe.</p>
${row.stripe_customer ? `<a class="btn ghost" href="/panel/${esc(row.panel_token)}/billing">Manage billing</a>` : ''}</div></main>`);
}

export function renderMsg(title, text) {
  return shell(title, `${nav}<main class="wrap" style="padding-block:60px"><div class="card" style="max-width:520px"><h1 style="font-size:30px">${esc(title)}</h1><p class="muted">${esc(text)}</p></div></main>`);
}

// shown while Stripe is in test mode: take the order, we send a payment link by email
export function renderReserve(row, price) {
  const host = `${row.slug}.webcrafts.page`;
  return shell(`Get ${row.name}'s website`, `${nav}<main class="wrap" style="padding-block:48px"><div class="card" style="max-width:560px">
<p class="muted" style="margin:0 0 6px">${esc(host)}</p>
<h1 style="font-size:30px">Keep this website for ${esc(row.name)}</h1>
<ul class="muted" style="padding-left:20px;margin:14px 0">
<li><b style="color:var(--ink)">${esc(price)}</b>, cancel anytime. No setup fee, no contract.</li>
<li>Hosting, security and unlimited small changes included.</li>
<li>Want your own .com? We connect it for you.</li></ul>
<form method="post" style="display:grid;gap:12px;margin-top:18px">
<label class="muted" style="font-size:14px">Send the payment link to
<input name="email" type="email" required value="${esc(row.email || '')}" placeholder="you@business.com" style="display:block;width:100%;margin-top:4px;padding:12px 14px;border:1px solid #ccc;border-radius:10px;font-size:16px"></label>
<textarea name="note" rows="2" placeholder="Anything you'd like changed first? (optional)" style="padding:12px 14px;border:1px solid #ccc;border-radius:10px;font:inherit"></textarea>
<button class="btn" style="font-size:17px;padding:14px">Yes, I want it</button></form>
<p class="muted" style="font-size:14px;margin-top:14px">You'll get a secure Stripe link by email today. Nothing is charged until you open it and pay. Questions? Write to <a href="mailto:matias@webcrafts.page">matias@webcrafts.page</a>.</p></div></main>`);
}
