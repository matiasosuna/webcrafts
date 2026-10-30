# WebCrafts

Websites for local businesses, built one by one and hosted on Cloudflare: [webcrafts.page](https://webcrafts.page).

- `src/`: Cloudflare Worker (sites, Stripe checkout, client panel, daily emails from its cron).
- `scripts/`: daily pipeline run by GitHub Actions (find businesses, read their current site, design a custom page).

No keys or customer data live here: secrets are in the Worker and GitHub, data in Cloudflare D1/KV.
