// Cold-email sender that runs on the Worker cron (replaces send.py, which ran on the Mac).
// One email per cron tick (every 30 min in US business hours) so sends are naturally spread out.
// Off unless SEND_ENABLED = "1". Needs secrets ZOHO_SMTP_USER, ZOHO_SMTP_PASS (Zoho app password) and POSTAL_ADDRESS (CAN-SPAM).
import { connect } from 'cloudflare:sockets';

const enc = new TextEncoder();
const b64 = (s) => { const b = enc.encode(s); let o = ''; for (const x of b) o += String.fromCharCode(x); return btoa(o); };
const hdr = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export function compose(row, data, env) {
  const name = row.name.replace(/\.$/, '');
  const where = data.city ? ` in ${data.city}` : '';
  const url = `https://${row.slug}.webcrafts.page`;
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

export async function smtpSend(env, to, subject, text) {
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
    `List-Unsubscribe: <mailto:${user}?subject=unsubscribe>`,
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

// called from the cron: sends at most one email per run, at most SEND_MAX per day
export async function sendNext(env, now) {
  if (env.SEND_ENABLED !== '1' || !env.POSTAL_ADDRESS || !env.ZOHO_SMTP_PASS) return 'off';
  const day = now - (now % 86400);
  const max = Number(env.SEND_MAX || 15);
  const today = await env.DB.prepare('SELECT COUNT(*) n FROM sites WHERE sent_at >= ?').bind(day).first();
  if (today.n >= max) return 'cap';
  // SEND_FROM (unix time) skips older batches whose sends were logged only on the Mac
  const row = await env.DB.prepare(
    `SELECT * FROM sites s WHERE status = 'preview' AND html IS NOT NULL AND sent_at IS NULL AND email IS NOT NULL AND slug != 'demo'
     AND created_at >= ? AND NOT EXISTS (SELECT 1 FROM suppress x WHERE x.email = lower(s.email) OR x.email = lower(substr(s.email, instr(s.email, '@') + 1)))
     ORDER BY created_at LIMIT 1`
  ).bind(Number(env.SEND_FROM || 0)).first();
  if (!row) return 'empty';
  // claim it first so a retry never double-sends
  await env.DB.prepare('UPDATE sites SET sent_at = ? WHERE slug = ?').bind(now, row.slug).run();
  const { subject, text } = compose(row, JSON.parse(row.data), env);
  try {
    const id = await smtpSend(env, row.email, subject, text);
    await env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(row.slug, 'sent', `${row.email} ${id}`, now).run();
    return 'sent ' + row.slug;
  } catch (e) {
    await env.DB.batch([
      env.DB.prepare('UPDATE sites SET sent_at = NULL WHERE slug = ?').bind(row.slug),
      env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(row.slug, 'send_fail', String(e.message || e).slice(0, 300), now),
      // a rejected address is skipped from now on
      ...(/smtp RCPT/.test(e.message) ? [env.DB.prepare('INSERT OR IGNORE INTO suppress (email, why, created_at) VALUES (?, ?, ?)').bind(row.email.toLowerCase(), 'rejected', now)] : []),
    ]);
    throw e;
  }
}
