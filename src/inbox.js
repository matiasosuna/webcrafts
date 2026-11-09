// Mail to matias@webcrafts.page arrives here (Cloudflare Email Routing → this Worker; replaced Zoho on 2026-11-08).
// Everything is forwarded to Matías's Gmail (secret MATIAS_EMAIL, a verified destination). Replies, opt-outs, bounces and
// auto-replies are also logged in D1 (events, type 'mail_in') for the daily report, and whoever answered or said no
// goes to `suppress`, so they never get another email.

const OPTOUT = /^\s*(no|nope|no thanks|not interested|stop|unsubscribe|remove( me)?)\b/i;
const BOUNCE = /mailer-daemon|postmaster/i;
// "We've got your message!", out-of-office, "Thanks for contacting us"…: a machine answered, not a person
const AUTO = new RegExp(
  "auto(matic|matische)?[ -]?(reply|response|antwort)|out of (the )?office|away from|on vacation|" +
    "(we('ve| have)|i('ve| have)) (got|received) your (message|e-?mail|inquiry)|thanks? (you )?for (contacting|reaching out|your (message|e-?mail|inquiry))|" +
    'message received|this is an automated',
  'i'
);
export const KIND = { reply: 'Respondió', optout: 'Baja', auto: 'Respuesta automática', bounce: 'Rebote' };

const bytes = (bin) => Uint8Array.from(bin, (c) => c.charCodeAt(0) & 255);
function decode(body, cte = '', charset = 'utf-8') {
  let bin;
  if (/base64/i.test(cte)) {
    try { bin = atob(body.replace(/[^A-Za-z0-9+/=]/g, '')); } catch { return ''; }
  } else if (/quoted-printable/i.test(cte)) {
    bin = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  } else return body;
  try { return new TextDecoder(charset).decode(bytes(bin)); } catch { return new TextDecoder().decode(bytes(bin)); }
}

// "=?UTF-8?B?…?=" subjects
const words = (s) =>
  s.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, enc, t) =>
    /b/i.test(enc) ? decode(t, 'base64', cs) : decode(t.replace(/_/g, ' '), 'quoted-printable', cs));

const addr = (s = '') => ((s.match(/<([^>]+)>/) || [, s])[1] || '').trim().toLowerCase();

// The readable text of a MIME message, without a library: the first text/plain part, else the HTML without tags.
export function plainText(raw) {
  const parts = [];
  const walk = (chunk, depth) => {
    const i = chunk.search(/\r?\n\r?\n/);
    const head = (i < 0 ? chunk : chunk.slice(0, i)).replace(/\r?\n[ \t]+/g, ' ');
    const body = i < 0 ? '' : chunk.slice(i).replace(/^\r?\n\r?\n/, '');
    const type = ((head.match(/^content-type:\s*([^;\s]+)/im) || [])[1] || 'text/plain').toLowerCase();
    const b = head.match(/boundary="?([^";\r\n]+)"?/i);
    if (type.startsWith('multipart/') && b && depth < 6) {
      for (const p of body.split('--' + b[1]).slice(1)) if (!p.startsWith('--')) walk(p.replace(/^[ \t]*\r?\n/, ''), depth + 1);
      return;
    }
    const cte = (head.match(/^content-transfer-encoding:\s*(\S+)/im) || [])[1];
    const cs = (head.match(/charset="?([^";\s]+)/i) || [])[1] || 'utf-8';
    if (type.startsWith('text/')) parts.push({ type, text: decode(body, cte, cs) });
  };
  walk(raw, 0);
  const p = parts.find((x) => x.type === 'text/plain') || parts.find((x) => x.type === 'text/html');
  if (!p) return '';
  if (p.type === 'text/plain') return p.text;
  return p.text
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}

function isAuto(h, subject, first) {
  if ((h.get('auto-submitted') || 'no').trim().toLowerCase() !== 'no' || h.get('x-autoreply') || h.get('x-autorespond')) return true;
  if (['auto_reply', 'bulk', 'junk'].includes((h.get('precedence') || '').trim().toLowerCase())) return true;
  return AUTO.test(subject) || AUTO.test(first);
}

// What kind of mail it is, and which address (if any) must never be emailed again.
export async function classify(env, h, raw) {
  const from = addr(h.get('from') || '');
  const subject = words(h.get('subject') || '').trim();
  const text = plainText(raw).trim();
  const first = (text.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('>')) || '').trim();
  if (BOUNCE.test(from) || /report-type="?delivery-status/i.test(h.get('content-type') || '')) {
    // the bounced address is somewhere in the report: the one we have on file
    const found = [...new Set((raw.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || []).map((s) => s.toLowerCase()))].slice(0, 50);
    let bad = null;
    for (const e of found) {
      if (await env.DB.prepare('SELECT 1 FROM sites WHERE lower(email) = ?').bind(e).first()) { bad = e; break; }
    }
    return { kind: 'bounce', from, subject, first, who: bad, why: bad && 'bounce' };
  }
  if (OPTOUT.test(first) || /unsubscribe/i.test(subject)) return { kind: 'optout', from, subject, first, who: from, why: 'opt-out' };
  if (isAuto(h, subject, first)) return { kind: 'auto', from, subject, first }; // not suppressed: the follow-up still goes
  return { kind: 'reply', from, subject, first, who: from, why: 'replied' }; // no follow-up once they answered: Matías takes it
}

export async function receive(message, env, now) {
  const h = message.headers;
  // deliverability (DMARC) reports are for machines, not for Matías
  if (/dmarc/i.test(h.get('from') || '') || /^report domain:/i.test(h.get('subject') || '')) return;
  let c = null;
  try {
    const raw = (await new Response(message.raw).text()).slice(0, 400000);
    c = await classify(env, h, raw);
    const site = await env.DB.prepare('SELECT slug FROM sites WHERE lower(email) = ?').bind(c.who || c.from).first();
    const detail = `${KIND[c.kind]} · ${c.from} — ${c.subject} — ${c.first}`.slice(0, 400);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)').bind(site?.slug || null, 'mail_in', detail, now),
      ...(c.who ? [env.DB.prepare('INSERT OR IGNORE INTO suppress (email, why, created_at) VALUES (?, ?, ?)').bind(c.who, c.why, now)] : []),
    ]);
  } catch (e) {
    console.error('inbox:', e.stack || e); // never lose the mail because of a parsing problem: it is still forwarded
  }
  try {
    await message.forward(env.MATIAS_EMAIL);
  } catch (e) {
    await env.DB.prepare('INSERT INTO events (slug, type, detail, created_at) VALUES (?, ?, ?, ?)')
      .bind(null, 'forward_fail', `${String(e.message || e).slice(0, 120)} · ${c?.from || addr(h.get('from') || '')}`, now).run();
    throw e;
  }
}
