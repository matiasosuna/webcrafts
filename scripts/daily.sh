#!/usr/bin/env bash
# Daily run in GitHub Actions (public repo: free minutes, so logs must never show leads, emails or replies).
# Private data (leads, audits, inbox state) lives in Cloudflare KV, not in the repo. The Worker cron does the emailing.
# 1) inbox: replies, opt-outs, bounces, and who was already emailed  2) if few previews are left to send: next city's leads
# 3) up to N new previews, each with its own photos and a page designed just for that business  4) report (GitHub issue)
set -uo pipefail
cd "$(dirname "$0")/.."
N=${N:-20}; MIN_READY=${MIN_READY:-40}
mkdir -p data
KV="npx -y wrangler@4 kv key put --remote --namespace-id 55a4be3b52bc4c04bcd686f40e79ad8a"
npx -y wrangler@4 kv key get --remote --namespace-id 55a4be3b52bc4c04bcd686f40e79ad8a data.tgz > data.tgz 2>/dev/null \
  && tar xzf data.tgz && rm -f data.tgz || { rm -f data.tgz; echo "sin datos previos"; }
save() { tar czf data.tgz --exclude='data/.*' --exclude=data/report.md data && $KV data.tgz --path data.tgz >/dev/null 2>&1 && rm -f data.tgz; }
trap save EXIT
d1() { npx -y wrangler@3 d1 execute webcrafts --remote --json --command "$1" 2>/dev/null |
  python3 -c 'import json,sys; t=sys.stdin.read(); print(json.dumps(json.loads(t[t.index("[\n"):])[0]["results"]))'; }
n() { d1 "$1" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["n"])'; }

# manual run with REDO="slug slug": only redesign those pages
if [ -n "${REDO:-}" ]; then python3 scripts/bespoke.py --redo $REDO 2>>data/run.log; echo "rehechas: $(echo $REDO | wc -w)"; exit 0; fi

INBOX=$(python3 scripts/inbox.py 2>>data/run.log || echo "(no se pudo leer el inbox: falta la clave de Zoho)")

READY=$(n "SELECT COUNT(*) n FROM sites WHERE status='preview' AND html IS NOT NULL AND sent_at IS NULL AND slug!='demo'")
BUILT=""
if [ "$READY" -lt "$MIN_READY" ]; then
  # cities in cities_done.txt are used up; each run audits at most 2 new cities (about 15 min each)
  DONE=data/cities_done.txt; touch "$DONE"
  build() {  # up to N previews from every audited city; a city that gives nothing new is used up
    for a in data/*.audit.jsonl; do
      [ -e "$a" ] || continue
      left=$((N - $(echo $BUILT | wc -w))); [ "$left" -le 0 ] && return
      out=$(python3 scripts/build_previews.py "$a" --limit "$left" --min-score 3 2>>data/run.log | sed -n 's|^https://\(.*\)\.webcrafts\.page$|\1|p')
      if [ -z "$out" ]; then basename "${a%.audit.jsonl}" >> "$DONE"; rm -f "$a" "${a%.audit.jsonl}.jsonl"; fi
      BUILT="$BUILT $out"
    done
  }
  build
  tries=0
  while [ "$(echo $BUILT | wc -w)" -lt "$N" ] && [ "$tries" -lt 2 ]; do
    next=""
    while IFS='|' read -r city iso; do
      c=$(echo "$city" | tr 'A-Z ' 'a-z-'); grep -qx "$c" "$DONE" || [ -s "data/$c.audit.jsonl" ] || { next="$city|$iso"; break; }
    done < scripts/cities.txt
    [ -z "$next" ] && break
    city=${next%|*}; iso=${next#*|}; f="data/$(echo "$city" | tr 'A-Z ' 'a-z-').jsonl"; a="${f%.jsonl}.audit.jsonl"
    tries=$((tries + 1))
    python3 scripts/osm_leads.py "$city" "$iso" "$f" 2>>data/run.log && python3 scripts/audit.py "$f" "$a" >/dev/null 2>>data/run.log
    [ -s "$a" ] || { basename "$f" .jsonl >> "$DONE"; continue; }
    # keep the stored data small: the site text is only needed for businesses we can email
    python3 - "$a" <<'PY2'
import json, sys
p = sys.argv[1]; rows = [json.loads(l) for l in open(p)]
open(p, "w").writelines(json.dumps(r if r.get("emails") else {k: v for k, v in r.items() if k != "content"}) + "\n" for r in rows)
PY2
    build
  done
  BUILT=$(echo $BUILT)
  if [ -n "$BUILT" ]; then
    python3 scripts/photos.py $BUILT 2>>data/run.log
    python3 scripts/bespoke.py $BUILT 2>>data/run.log
  fi
fi

# report of the last 24 h
SINCE=$(( $(date +%s) - 86400 ))
ev() { d1 "SELECT slug, type, detail FROM events WHERE created_at >= $SINCE AND type IN ($1) ORDER BY created_at" |
  python3 -c 'import json,sys; [print(f"- {r["slug"]}: {r["type"]} · {(r["detail"] or "")[:90]}") for r in json.load(sys.stdin)]'; }
SALES=$(ev "'activated','reserve','claim_click'")
SEEN=$(ev "'human_view'")
FAILS=$(ev "'send_fail'")
SENT=$(n "SELECT COUNT(*) n FROM events WHERE type='sent' AND created_at >= $SINCE")
NEWB=$(echo $BUILT | wc -w | tr -d ' ')
READY=$(n "SELECT COUNT(*) n FROM sites WHERE status='preview' AND html IS NOT NULL AND sent_at IS NULL AND slug!='demo'")
{
  echo "**Últimas 24 h:** $SENT mails enviados · $NEWB webs nuevas · $READY listas para mandar"
  [ -n "$SALES" ] && printf '\n### Compras y clicks en comprar\n%s\n' "$SALES"
  [ -n "$SEEN" ] && printf '\n### Personas que miraron su web (5 s o más)\n%s\n' "$SEEN"
  [ -n "$INBOX" ] && printf '\n### Mails recibidos\n%s\n' "$INBOX"
  [ -n "$FAILS" ] && printf '\n### Envíos fallados\n%s\n' "$FAILS"
  for s in $BUILT; do echo "- nueva: https://$s.webcrafts.page"; done
} > data/report.md
echo "listo: $NEWB webs nuevas, $SENT mails enviados, $READY listas"  # only counts in the public log
# the report goes by email to Matías only when something happened that he should look at
if [ -n "$SALES" ] || echo "$INBOX" | grep -q "\*\*" || [ -n "$FAILS" ]; then
  title="WebCrafts $(date +%d-%m):"
  [ -n "$SALES" ] && title="$title clicks en comprar"
  echo "$INBOX" | grep -q "REPLY" && title="$title respuestas"
  [ -n "$FAILS" ] && title="$title envíos fallados"
  python3 scripts/report_mail.py "$title" data/report.md 2>>data/run.log || echo "no se pudo mandar el reporte"
fi
