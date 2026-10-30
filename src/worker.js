import { renderSite, renderPaused, photoList, wrapBespoke } from './site.js';
import { sendNext } from './mailer.js';
import { renderLanding, renderWelcome, renderPanel, renderMsg, renderReserve } from './pages.js';

const APEX = 'webcrafts.page';
const now = () => Math.floor(Date.now() / 1000);
const html = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...extra } });
const redirect = (url, status = 303) => Response.redirect(url, status);
const BOT = /bot|crawl|spider|preview|scan|python|curl|wget|headless|go-http|java\/|okhttp|axios|proofpoint|mimecast|barracuda|safelinks/i;
const who = (req) => {
  const ua = req.headers.get('user-agent') || '';
  return { bot: !ua || BOT.test(ua), detail: `${req.cf?.country || '?'} · ${req.cf?.asOrganization || '?'} · ${ua.slice(0, 110)}` };
};
const testMode = (env) => !/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '');

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const host = url.hostname.toLowerCase();
    try {
      if (host === APEX || host === 'www.' + APEX || host.endsWith('.workers.dev') || host === 'localhost') {
        if (host === 'www.' + APEX) return redirect(`https://${APEX}${url.pathname}${url.search}`, 301);
        return await apex(req, env, ctx, url);
      }
      if (host.endsWith('.' + APEX)) {
        const slug = host.slice(0, -(APEX.length + 1));
        return await site(req, env, ctx, url, slug);
      }
      // custom domain of a client
      const row = await env.DB.prepare('SELECT * FROM sites WHERE custom_domain = ?').bind(host).first();
      if (row) return await site(req, env, ctx, url, row.slug, row);
      return html(renderMsg('Not found', 'This site does not exist.'), 404);
    } catch (e) {
      console.error(e.stack || e);
      return html(renderMsg('Something went wrong', 'Please try again in a minute.'), 500);
    }
  },
  async scheduled(ev, env) {
    if (ev.cron.startsWith('*/30')) return console.log('send:', await sendNext(env, now()));
    // daily: previews that were never claimed are removed 30 days after we emailed them, as the email says
    await env.DB.prepare(`UPDATE sites SET status = 'expired', updated_at = ? WHERE status = 'preview' AND slug != 'demo' AND sent_at IS NOT NULL AND sent_at < ?`)
      .bind(now(), now() - 30 * 86400).run();
  },
};

// ---------- client sites ----------
async function site(req, env, ctx, url, slug, row) {
  row = row || (await env.DB.prepare('SELECT * FROM sites WHERE slug = ?').bind(slug).first());
  if (!row) return html(renderMsg('Not found', 'This site does not exist.'), 404);
  const pm = url.pathname.match(/^\/_p\/(\d)$/);
  if (pm) {
    const src = photoList(JSON.parse(row.data))[+pm[1]];
    if (!src || row.status === 'expired' || row.status === 'canceled') return new Response('', { status: 404 });
    const r = await fetch(src, { headers: { 'user-agent': 'Mozilla/5.0 WebCrafts' }, cf: { cacheEverything: true, cacheTtl: 604800 } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return new Response('', { status: 404 });
    return new Response(r.body, { headers: { 'content-type': type, 'cache-control': 'public, max-age=604800' } });
  }
  if (url.pathname === '/_seen' && req.method === 'POST') {
    if (row.status === 'preview') { const w = who(req); if (!w.bot) ctx.waitUntil(event(env, row.slug, 'human_view', w.detail)); }
    return new Response(null, { status: 204 });
  }
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    if (url.pathname === '/robots.txt')
      return new Response(row.status === 'active' ? 'User-agent: *\nAllow: /\n' : 'User-agent: *\nDisallow: /\n');
    return redirect(`${url.origin}/`, 302);
  }
  const data = JSON.parse(row.data);
  if (row.status === 'preview') {
    const w = who(req);
    ctx.waitUntil(
      env.DB.batch([
        ...(w.bot ? [] : [env.DB.prepare('UPDATE sites SET views = views + 1 WHERE slug = ?').bind(row.slug)]),
        env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(row.slug, w.bot ? 'bot_view' : 'preview_view', w.detail, now()),
      ])
    );
    const t = testMode(env);
    const opt = {
      preview: true, claimUrl: `${env.BASE}/claim/${row.slug}`, price: env.PRICE_LABEL,
      cta: t ? 'Get this website' : 'Buy this website',
      note: t ? 'One click. We email you a secure Stripe link and it goes live the same day.' : 'Secure payment by Stripe. Online in 1 minute.',
    };
    if (row.html && url.searchParams.get('v') !== 'classic') return html(wrapBespoke(row, row.html, opt), 200, { 'x-robots-tag': 'noindex' });
    return html(renderSite(row, data, opt), 200, {
      'x-robots-tag': 'noindex',
    });
  }
  if (row.status === 'active' || row.status === 'past_due') return html(row.html ? wrapBespoke(row, row.html, {}) : renderSite(row, data, {}));
  return html(renderPaused(row, data), 200, { 'x-robots-tag': 'noindex' });
}

// ---------- webcrafts.page ----------
async function apex(req, env, ctx, url) {
  const p = url.pathname;
  if (p === '/' && req.method === 'GET') return html(renderLanding(env));
  if (p === '/robots.txt') return new Response('User-agent: *\nAllow: /\n');

  let m;
  if ((m = p.match(/^\/claim\/([a-z0-9-]+)$/))) {
    const row = await env.DB.prepare('SELECT * FROM sites WHERE slug = ?').bind(m[1]).first();
    if (!row) return html(renderMsg('Not found', 'That preview does not exist.'), 404);
    if (row.status === 'active') return html(renderMsg('Already live', 'This site is already active.'));
    const w = who(req);
    if (testMode(env)) {
      if (req.method === 'POST') {
        const f = await req.formData();
        const text = `RESERVE: ${String(f.get('email') || row.email || '').slice(0, 120)} ${String(f.get('note') || '').slice(0, 300)}`;
        await env.DB.batch([
          env.DB.prepare('INSERT INTO requests (slug, kind, text, status, created_at) VALUES (?, ?, ?, ?, ?)').bind(row.slug, 'reserve', text, 'open', now()),
          env.DB.prepare('INSERT INTO events (slug, type, created_at) VALUES (?, ?, ?)').bind(row.slug, 'reserve', now()),
        ]);
        return html(renderMsg('Reserved!', `Thanks. We'll email you a secure payment link today, and ${row.name}'s new website goes live as soon as you pay.`));
      }
      ctx.waitUntil(event(env, row.slug, w.bot ? 'bot_claim' : 'claim_click', w.detail));
      return html(renderReserve(row, env.PRICE_LABEL));
    }
    const s = await stripe(env, 'POST', '/v1/checkout/sessions', {
      mode: 'subscription',
      'line_items[0][price]': env.STRIPE_PRICE,
      'line_items[0][quantity]': 1,
      success_url: `${env.BASE}/welcome?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://${row.slug}.${APEX}/`,
      client_reference_id: row.slug,
      'metadata[slug]': row.slug,
      'subscription_data[metadata][slug]': row.slug,
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      // we already know their email: one field less at checkout
      ...(row.email && !row.stripe_customer && { customer_email: row.email }),
      ...(row.stripe_customer && { customer: row.stripe_customer }),
      // no custom_text: LoveWorker has Stripe Managed Payments on, which rejects it
    });
    ctx.waitUntil(event(env, row.slug, w.bot ? 'bot_claim' : 'claim_click', w.detail));
    return redirect(s.url);
  }

  if (p === '/welcome') {
    const id = url.searchParams.get('session_id') || '';
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return redirect(env.BASE);
    const s = await stripe(env, 'GET', `/v1/checkout/sessions/${id}`);
    if (s.payment_status !== 'paid' && s.status !== 'complete') return html(renderMsg('Payment pending', 'We will email you when it clears.'));
    const row = await activate(env, s);
    return html(renderWelcome(row, env));
  }

  if (p === '/api/stripe' && req.method === 'POST') return stripeWebhook(req, env);

  if ((m = p.match(/^\/panel\/([A-Za-z0-9_-]{20,})(\/billing)?$/))) {
    const row = await env.DB.prepare('SELECT * FROM sites WHERE panel_token = ?').bind(m[1]).first();
    if (!row) return html(renderMsg('Link expired', 'Reply to any of our emails and we will send a new one.'), 404);
    if (m[2]) {
      const s = await stripe(env, 'POST', '/v1/billing_portal/sessions', {
        customer: row.stripe_customer,
        ...(env.STRIPE_PORTAL_CONFIG && { configuration: env.STRIPE_PORTAL_CONFIG }),
        return_url: `${env.BASE}/panel/${row.panel_token}`,
      });
      return redirect(s.url);
    }
    let sent = false;
    if (req.method === 'POST') {
      const f = await req.formData();
      const text = String(f.get('text') || '').trim().slice(0, 4000);
      const kind = ['change', 'domain', 'other'].includes(f.get('kind')) ? f.get('kind') : 'change';
      if (text) {
        await env.DB.prepare('INSERT INTO requests (slug, kind, text, created_at) VALUES (?, ?, ?, ?)')
          .bind(row.slug, kind, text, now()).run();
        ctx.waitUntil(event(env, row.slug, 'request', kind));
      }
      return redirect(`${url.origin}/panel/${row.panel_token}?sent=1`);
    }
    sent = url.searchParams.has('sent');
    const reqs = await env.DB.prepare('SELECT * FROM requests WHERE slug = ? ORDER BY id DESC LIMIT 20').bind(row.slug).all();
    return html(renderPanel(row, reqs.results, { sent, env }));
  }

  return html(renderMsg('Not found', 'Nothing here.'), 404);
}

async function activate(env, s) {
  const slug = s.client_reference_id || s.metadata?.slug;
  const row = await env.DB.prepare('SELECT * FROM sites WHERE slug = ?').bind(slug).first();
  if (!row) throw new Error('no site for ' + slug);
  const token = row.panel_token || randomToken();
  await env.DB.prepare(
    `UPDATE sites SET status = 'active', email = COALESCE(?, email), stripe_customer = ?, stripe_sub = ?, panel_token = ?, updated_at = ? WHERE slug = ?`
  ).bind(s.customer_details?.email || null, s.customer, s.subscription, token, now(), slug).run();
  if (row.status !== 'active') await event(env, slug, 'activated', s.id);
  return { ...row, status: 'active', panel_token: token, stripe_customer: s.customer };
}

async function stripeWebhook(req, env) {
  const body = await req.text();
  const ok = await verifyStripe(body, req.headers.get('stripe-signature') || '', env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response('bad signature', { status: 400 });
  const ev = JSON.parse(body);
  const o = ev.data.object;
  const slugOf = async () =>
    o.metadata?.slug ||
    (o.subscription && (await env.DB.prepare('SELECT slug FROM sites WHERE stripe_sub = ?').bind(o.subscription).first())?.slug) ||
    (o.id && (await env.DB.prepare('SELECT slug FROM sites WHERE stripe_sub = ?').bind(o.id).first())?.slug);
  switch (ev.type) {
    case 'checkout.session.completed':
      await activate(env, o);
      break;
    case 'invoice.payment_failed': {
      const slug = await slugOf();
      if (slug) await setStatus(env, slug, 'past_due', ev.type);
      break;
    }
    case 'invoice.paid': {
      const slug = await slugOf();
      if (slug) await setStatus(env, slug, 'active', ev.type);
      break;
    }
    case 'customer.subscription.updated': {
      const slug = await slugOf();
      const map = { active: 'active', past_due: 'past_due', unpaid: 'paused', canceled: 'canceled', incomplete_expired: 'canceled' };
      if (slug && map[o.status]) await setStatus(env, slug, map[o.status], ev.type);
      break;
    }
    case 'customer.subscription.deleted': {
      const slug = await slugOf();
      if (slug) await setStatus(env, slug, 'paused', ev.type);
      break;
    }
  }
  return new Response('ok');
}

async function setStatus(env, slug, status, why) {
  await env.DB.prepare('UPDATE sites SET status = ?, updated_at = ? WHERE slug = ?').bind(status, now(), slug).run();
  await event(env, slug, 'status_' + status, why);
}

const event = (env, slug, type, detail = null) =>
  env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(slug, type, detail, now()).run();

async function stripe(env, method, path, params) {
  const body = params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : undefined;
  const r = await fetch('https://api.stripe.com' + path, {
    method,
    headers: { authorization: 'Bearer ' + env.STRIPE_SECRET_KEY, ...(body && { 'content-type': 'application/x-www-form-urlencoded' }) },
    body: method === 'GET' ? undefined : body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error('stripe ' + path + ': ' + (j.error?.message || r.status));
  return j;
}

async function verifyStripe(payload, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = header.split(',').filter((x) => x.startsWith('v1=')).map((x) => x.slice(3));
  if (!parts.t || !sigs.length || !secret) return false;
  if (Math.abs(now() - Number(parts.t)) > 600) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parts.t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return sigs.some((s) => s.length === hex.length && timingSafeEq(s, hex));
}
const timingSafeEq = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
