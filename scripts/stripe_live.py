#!/usr/bin/env python3
"""Turn on real payments: creates (or reuses) the live product, $49/month price, webhook and customer portal
in the LoveWorker Stripe account, and stores everything as Worker secrets. Safe to run again.
The key is typed here (hidden) or read from STRIPE_LIVE_KEY; it is never printed or saved to disk.
Run from webcrafts/:  python3 scripts/stripe_live.py
"""
import getpass, json, os, shutil, subprocess, sys, urllib.parse, urllib.request

BASE = "https://webcrafts.page"
EVENTS = ["checkout.session.completed", "invoice.paid", "invoice.payment_failed",
          "customer.subscription.updated", "customer.subscription.deleted"]

key = os.environ.get("STRIPE_LIVE_KEY") or getpass.getpass("Pegá la clave secreta LIVE de Stripe (sk_live_…, no se ve al pegar): ").strip()
if not key.startswith(("sk_live_", "rk_live_")):
    sys.exit("Esa no es una clave live (tiene que empezar con sk_live_).")


def api(method, path, params=None):
    data = urllib.parse.urlencode(params or {}, doseq=True).encode() if method == "POST" else None
    q = "?" + urllib.parse.urlencode(params or {}, doseq=True) if method == "GET" and params else ""
    req = urllib.request.Request("https://api.stripe.com" + path + q, data=data, method=method,
                                 headers={"Authorization": "Bearer " + key})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Stripe {path}: {json.load(e).get('error', {}).get('message', e)}")


def secret(name, value):
    if shutil.which("boveda"):  # also keep a copy in Matías's encrypted vault
        subprocess.run(["boveda", "guardar", name, "-p", "webcrafts", "-s", "Stripe"], input=value, text=True, capture_output=True)
    r = subprocess.run(["wrangler", "secret", "put", name], input=value, text=True, capture_output=True)
    if r.returncode:
        sys.exit(f"wrangler secret put {name} falló:\n{r.stderr[-500:]}")
    print("  guardado", name)


acct = api("GET", "/v1/account")
print("Cuenta:", acct.get("settings", {}).get("dashboard", {}).get("display_name") or acct.get("business_profile", {}).get("name"),
      "· cobros activos:", acct.get("charges_enabled"))
if not acct.get("charges_enabled"):
    sys.exit("La cuenta todavía no puede cobrar en live (falta completar la activación en el dashboard de Stripe).")

# price: reused through its lookup_key
prices = api("GET", "/v1/prices", {"lookup_keys[]": "webcrafts_49_month", "active": "true"})["data"]
if prices:
    price = prices[0]
else:
    prod = api("POST", "/v1/products", {"name": "WebCrafts website", "description": "Website, hosting and unlimited small changes. Cancel anytime.",
                                        "statement_descriptor": "WEBCRAFTS.PAGE", "metadata[app]": "webcrafts",
                                        "tax_code": "txcd_10000000"})  # tax code: required by Stripe Managed Payments
    price = api("POST", "/v1/prices", {"product": prod["id"], "unit_amount": 4900, "currency": "usd",
                                       "recurring[interval]": "month", "lookup_key": "webcrafts_49_month"})
print("Precio:", price["id"], f"${price['unit_amount'] / 100:.0f}/{price['recurring']['interval']}")

# webhook: its signing secret is only shown on creation, so an old one of ours is replaced
for wh in api("GET", "/v1/webhook_endpoints", {"limit": 100})["data"]:
    if wh["url"] == BASE + "/api/stripe":
        api("DELETE", f"/v1/webhook_endpoints/{wh['id']}")
wh = api("POST", "/v1/webhook_endpoints", {"url": BASE + "/api/stripe", "enabled_events[]": EVENTS,
                                           "description": "WebCrafts Worker", "metadata[app]": "webcrafts"})
print("Webhook:", wh["id"])

portal = api("POST", "/v1/billing_portal/configurations", {
    "business_profile[headline]": "WebCrafts — manage your website subscription",
    "default_return_url": BASE,
    "features[invoice_history][enabled]": "true",
    "features[payment_method_update][enabled]": "true",
    "features[customer_update][enabled]": "true",
    "features[customer_update][allowed_updates][]": ["email", "address"],
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "metadata[app]": "webcrafts",
})
print("Portal:", portal["id"])

print("Guardando en el Worker…")
secret("STRIPE_PRICE", price["id"])
secret("STRIPE_WEBHOOK_SECRET", wh["secret"])
secret("STRIPE_PORTAL_CONFIG", portal["id"])
secret("STRIPE_SECRET_KEY", key)  # last: from here on the Buy button charges for real
print("\nListo: Stripe live activo. Avisale a Claude.")
