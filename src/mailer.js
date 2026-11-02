// Cold-email sender that runs on the Worker cron (replaces send.py, which ran on the Mac).
// One email per cron tick (every 30 min in US business hours) so sends are naturally spread out.
// Off unless SEND_ENABLED = "1". Needs secrets ZOHO_SMTP_USER, ZOHO_SMTP_PASS (Zoho app password) and POSTAL_ADDRESS (CAN-SPAM).
import { connect } from 'cloudflare:sockets';

const enc = new TextEncoder();
const b64 = (s) => { const b = enc.encode(s); let o = ''; for (const x of b) o += String.fromCharCode(x); return btoa(o); };
const hdr = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

// v1: text Matías approved on 2026-10-29. v2 and the follow-up: approved on 2026-11-02, switched on in wrangler.toml
// (TEMPLATE = "v2", FOLLOWUP_ENABLED = "1").
// OSM sometimes lists several names ("Broken Spoke;The Broken Spoke"): keep the first.
export const cleanName = (n) => n.split(';')[0].trim().replace(/\.$/, '');
const poss = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);

export function compose(row, data, env, issue) {
  const name = cleanName(row.name);
  const url = `https://${row.slug}.webcrafts.page`;
  if (env.TEMPLATE === 'v2') {
    const opening = issue
      ? `I was looking at ${poss(name)} website and noticed ${issue}. So I made a new version that works well on phones, using what's already on your site:`
      : `I made a new version of ${poss(name)} website that works well on phones, using what's already on your site:`;
    return {
      subject: `${poss(name)} website`,
      text: `Hi,

${opening}

${url}

Anything can change: photos, text, colors. If you like it, I can keep it online for you for $49/month, hosting and changes included. Just reply.

Matias
webcrafts.page

--
${env.POSTAL_ADDRESS}
Reply "no" and I won't write again.
`,
    };
  }
  const where = data.city ? ` in ${data.city}` : '';
  const subject = `New website for ${name} (free preview)`;
  const text = `Hi ${name} team,

I made a new, mobile-friendly website for ${name}${where}, using the info that's already public about you. Take a look:

${url}

It's a first draft made just for you, so anything can change: photos, text, colors, sections. Tell me what you'd like and I'll do it.

If you want to keep it, it's $49/month with hosting and unlimited changes included, no contract. You can buy it right on the page, or just reply "yes".

If it's not for you, no worries. The preview is removed in 30 days.

Matias
WebCrafts · webcrafts.page

--
${env.POSTAL_ADDRESS}
Reply "no" and I won't email you again.
`;
  return { subject, text };
}

export function composeFollowup(row, env, firstSubject) {
  return {
    subject: firstSubject.startsWith('Re: ') ? firstSubject : `Re: ${firstSubject}`,
    text: `Hi, just checking this reached you:

https://${row.slug}.webcrafts.page

Happy to change anything on it, or take it down if you're not interested.

Matias

--
${env.POSTAL_ADDRESS}
Reply "no" and I won't write again.
`,
  };
}

// One short, true observation about their current site, for the v2 opening line (null if nothing clear).
export async function observe(url) {
  if (!url) return null;
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0' } });
    const h = (await r.text()).slice(0, 400000);
    if (!/<meta[^>]+name=["']viewport/i.test(h)) return "it doesn't adjust to phone screens";
    if (!r.url.startsWith('https://')) return 'browsers mark it as "Not secure"';
    const years = [...h.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => +m[1]);
    const y = years.length ? Math.max(...years) : null;
    if (y && y <= new Date().getUTCFullYear() - 4) return `it still says © ${y}`;
  } catch {}
  return null;
}

export async function smtpSend(env, to, subject, text, inReplyTo) {
  const user = env.ZOHO_SMTP_USER;
  const sock = connect({ hostname: env.ZOHO_SMTP_HOST || 'smtppro.zoho.com', port: 465 }, { secureTransport: 'on' });
  const w = sock.writable.getWriter();
  const r = sock.readable.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const reply = async () => {
    for (;;) {
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++)
        if (/^\d{3} /.test(lines[i])) { buf = lines.slice(i + 1).join('\r\n'); return { code: +lines[i].slice(0, 3), text: lines[i] }; }
      const { value, done } = await r.read();
      if (done) throw new Error('smtp closed');
      buf += dec.decode(value, { stream: true });
    }
  };
  const cmd = async (line, ok) => {
    if (line != null) await w.write(enc.encode(line + '\r\n'));
    const res = await reply();
    if (!ok.includes(res.code)) throw new Error(`smtp ${(line || 'greeting').split(' ')[0]}: ${res.text}`);
  };
  const id = `<${crypto.randomUUID()}@webcrafts.page>`;
  const body = b64(text).replace(/.{1,76}/g, '$&\r\n');
  const msg = [
    `From: Matias at WebCrafts <${user}>`, `To: ${to}`, `Subject: ${hdr(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${id}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', body,
  ].join('\r\n');
  try {
    await cmd(null, [220]);
    await cmd('EHLO webcrafts.page', [250]);
    await cmd('AUTH LOGIN', [334]);
    await cmd(b64(user), [334]);
    await cmd(b64(env.ZOHO_SMTP_PASS), [235]);
    await cmd(`MAIL FROM:<${user}>`, [250]);
    await cmd(`RCPT TO:<${to}>`, [250, 251]);
    await cmd('DATA', [354]);
    await cmd(msg + '\r\n.', [250]);
    await cmd('QUIT', [221]).catch(() => {});
  } finally {
    await sock.close().catch(() => {});
  }
  return id;
}

// Addresses nobody reads for this (press, jobs, billing...) and domains with no mail server are skipped for good.
const ROLE = /^(press|media|pr|news|jobs|careers|career|hr|recruiting|employment|billing|invoices?|accounting|ap|ar|noreply|no-reply|donotreply|do-not-reply|abuse|privacy|legal|webmaster|security|postmaster)$/i;
const FREE = /^(gmail|yahoo|aol|hotmail|outlook|icloud|live|msn|me|att|sbcglobal|comcast|verizon|bellsouth|earthlink)\.(com|net)$/i;

async function hasMx(domain) {
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000),
    });
    const j = await r.json();
    return j.Status === 0 && (j.Answer || []).some((a) => a.type === 15 && !/^0 \.$/.test(a.data));
  } catch {
    return true; // DNS hiccup: don't drop a good lead
  }
}

const suppress = (env, email, why, now) =>
  env.DB.prepare('INSERT OR IGNORE INTO suppress (email, why, created_at) VALUES (?, ?, ?)').bind(email.toLowerCase(), why, now).run();

async function deliver(env, row, now, type, subject, text, inReplyTo) {
  try {
    const id = await smtpSend(env, row.email, subject, text, inReplyTo);
    await env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(row.slug, type, `${row.email} ${id} ${subject}`, now).run();
    return `${type} ${row.slug}`;
  } catch (e) {
    await env.DB.batch([
      ...(type === 'sent' ? [env.DB.prepare('UPDATE sites SET sent_at = NULL WHERE slug = ?').bind(row.slug)] : []),
      env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(row.slug, 'send_fail', String(e.message || e).slice(0, 300), now),
      // a rejected address is skipped from now on
      ...(/smtp RCPT/.test(e.message) ? [env.DB.prepare('INSERT OR IGNORE INTO suppress (email, why, created_at) VALUES (?, ?, ?)').bind(row.email.toLowerCase(), 'rejected', now)] : []),
    ]);
    throw e;
  }
}

const NOT_SUPPRESSED = `NOT EXISTS (SELECT 1 FROM suppress x WHERE x.email = lower(s.email) OR x.email = lower(substr(s.email, instr(s.email, '@') + 1)))`;

// called from the cron: sends at most one email per run (a due follow-up first), at most SEND_MAX per day
export async function sendNext(env, now) {
  if (env.SEND_ENABLED !== '1' || !env.POSTAL_ADDRESS || !env.ZOHO_SMTP_PASS) return 'off';
  const day = now - (now % 86400);
  const max = Number(env.SEND_MAX || 15);
  const today = await env.DB.prepare("SELECT COUNT(*) n FROM events WHERE type IN ('sent', 'followup') AND created_at >= ?").bind(day).first();
  if (today.n >= max) return 'cap';

  if (env.FOLLOWUP_ENABLED === '1') {
    // one nudge, 4+ days after the first email, only if they haven't replied (replies and opt-outs land in suppress)
    const f = await env.DB.prepare(
      `SELECT s.*, e.detail FROM sites s JOIN events e ON e.slug = s.slug AND e.type = 'sent'
       WHERE s.status = 'preview' AND s.sent_at IS NOT NULL AND s.sent_at < ? AND s.sent_at > ? AND ${NOT_SUPPRESSED}
       AND NOT EXISTS (SELECT 1 FROM events y WHERE y.slug = s.slug AND y.type IN ('followup', 'claim_click', 'reserve', 'activated'))
       ORDER BY s.sent_at LIMIT 1`
    ).bind(now - 4 * 86400, now - 20 * 86400).first();
    if (f) {
      const [, msgId, ...subj] = f.detail.split(' ');
      const { subject, text } = composeFollowup(f, env, subj.join(' ') || `New website for ${cleanName(f.name)} (free preview)`);
      return deliver(env, f, now, 'followup', subject, text, msgId);
    }
  }

  // SEND_FROM (unix time) skips older batches whose sends were logged only on the Mac
  const { results } = await env.DB.prepare(
    `SELECT * FROM sites s WHERE status = 'preview' AND html IS NOT NULL AND sent_at IS NULL AND email IS NOT NULL AND slug != 'demo'
     AND created_at >= ? AND ${NOT_SUPPRESSED} ORDER BY created_at LIMIT 5`
  ).bind(Number(env.SEND_FROM || 0)).all();
  for (const row of results) {
    const [local, domain] = row.email.toLowerCase().split('@');
    if (ROLE.test(local)) { await suppress(env, row.email, 'role address', now); continue; }
    if (!(await hasMx(domain))) { await suppress(env, row.email, 'no mail server', now); continue; }
    // claim it first so a retry never double-sends
    await env.DB.prepare('UPDATE sites SET sent_at = ? WHERE slug = ?').bind(now, row.slug).run();
    const data = JSON.parse(row.data);
    const site = data.old_site || (FREE.test(domain) ? null : `https://${domain}`);
    const issue = env.TEMPLATE === 'v2' ? await observe(site) : null;
    const { subject, text } = compose(row, data, env, issue);
    return deliver(env, row, now, 'sent', subject, text);
  }
  return 'empty';
}
