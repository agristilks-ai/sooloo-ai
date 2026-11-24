# SOOLOO.AI — v0.1
English-language editorial MVP, black/green identity. No framework or build dependencies. Includes category filters, article reader, responsive navigation, newsletter endpoint and D1 schema. Editorial text is draft material; source links and independent verification still required.

## Local preview
From this folder: `python -m http.server 8000 --directory public` then visit http://localhost:8000. Static preview does not run the newsletter API; it correctly displays an error rather than a false signup confirmation.

## Cloudflare Pages
Create a Pages project connected to a GitHub repository containing this folder. Framework preset None, no build command, output directory `public`. Pages Functions are in `functions/`. Create a D1 database, apply schema.sql, bind the database as `DB` under Pages project Settings > Bindings, and redeploy. Alternatively use `npx wrangler pages dev public --d1 DB` for local development, initialize the database before testing. For a production deployment use the dashboard or Wrangler with your authenticated account.

## Before public launch
Confirm domain and trademark status; finalize legal controller/contact details, privacy notice and unsubscribe process; connect newsletter delivery provider; implement double opt-in and rate limiting/bot protection; test duplicate signups, invalid inputs and successful database persistence in the actual deployed environment; add source links and approve editorial drafts. No public deployment, email delivery, analytics or paid affiliate integration is included. Do not collect public emails until privacy and abuse prevention are ready.
