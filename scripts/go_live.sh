#!/bin/zsh
# One-time setup, run by Matías: updates the database, publishes the Worker, switches Stripe to live
# and stores the keys the cloud needs (Worker + GitHub Actions). Keys come from ~/.config/webcrafts/keys.env
# (left there by the Tarot session) or are typed hidden; they are never printed or committed.
set -e
cd "$(dirname $0)/.."
REPO=matiasosuna/webcrafts
export PATH="$HOME/.local/bin:$PATH"
KEYS=~/.config/webcrafts/keys.env
[ -f $KEYS ] && { set -a; source $KEYS; set +a; }
# keys already in Matías's encrypted vault (~/Developer/boveda) are reused; new ones are saved there too
command -v boveda >/dev/null && { set -a; source <(boveda dotenv -p webcrafts 2>/dev/null); set +a; }
keep() { command -v boveda >/dev/null && print -rn "${(P)1}" | boveda guardar $1 -p webcrafts -s "$2" >/dev/null 2>&1 || true; }
ask() { [ -n "${(P)1}" ] && return; echo "  $3"; read -rs "$1?$2 (no se ve al pegar): "; echo; keep $1 "$4"; }

echo "1/4 Base de datos y Worker"
wrangler d1 execute webcrafts --remote --file migrate-2026-10-29.sql || echo "  (la migración ya estaba hecha)"
wrangler deploy

echo "\n2/4 Stripe live (cuenta LoveWorker)"
ask STRIPE_LIVE_KEY "Clave secreta LIVE de Stripe (sk_live_…)" "La pestaña de Stripe en Chrome → Create secret key → nombre: webcrafts" Stripe
STRIPE_LIVE_KEY=$STRIPE_LIVE_KEY python3 scripts/stripe_live.py

echo "\n3/4 Mail (Zoho)"
ask ZOHO_SMTP_PASS "Contraseña de app de Zoho" "La pestaña de Zoho en Chrome → Generate New Password → nombre: webcrafts" Zoho
print -rn "matias@webcrafts.page" | wrangler secret put ZOHO_SMTP_USER
print -rn "$ZOHO_SMTP_PASS" | wrangler secret put ZOHO_SMTP_PASS
print -rn "${POSTAL_ADDRESS:-WebCrafts, 9010 Patterson Ave, Henrico, VA 23229}" | wrangler secret put POSTAL_ADDRESS
print -rn "$ZOHO_SMTP_PASS" | gh secret set ZOHO_SMTP_PASS -R $REPO

echo "\n4/4 GitHub Actions"
ask CLOUDFLARE_API_TOKEN "Token de Cloudflare" "La pestaña de Cloudflare en Chrome → Create Token (ya está armado)" Cloudflare
print -rn "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN -R $REPO
ask GEMINI_API_KEY "Clave de Gemini" "La pestaña de Google AI Studio en Chrome → copiar una clave gratis" Gemini
print -rn "$GEMINI_API_KEY" | gh secret set GEMINI_API_KEY -R $REPO

echo "\nListo: Stripe live, mails y GitHub Actions configurados. Avisale a Claude."
