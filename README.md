# SOOLOO.AI — v0.1
English-language editorial MVP, black/green identity. No framework or build dependencies. Includes category filters, article reader, responsive navigation, newsletter endpoint and D1 schema. Editorial text is draft material; source links and independent verification still required.

## Local preview
From this folder: `python -m http.server 8000 --directory public` then visit http://localhost:8000. Static preview does not run the newsletter API; it correctly displays an error rather than a false signup confirmation.

## Cloudflare Pages
Create a Pages project connected to a GitHub repository containing this folder. Framework preset None, no build command, output directory `public`. Pages Functions are in `functions/`. Create a D1 database, apply schema.sql, bind the database as `DB` under Pages project Settings > Bindings, and redeploy. Alternatively use `npx wrangler pages dev public --d1 DB` for local development, initialize the database before testing. For a production deployment use the dashboard or Wrangler with your authenticated account.

## Before public launch
Confirm domain and trademark status; finalize legal controller/contact details, privacy notice and unsubscribe process; connect newsletter delivery provider; implement double opt-in and rate limiting/bot protection; test duplicate signups, invalid inputs and successful database persistence in the actual deployed environment; add source links and approve editorial drafts. No public deployment, email delivery, analytics or paid affiliate integration is included. Do not collect public emails until privacy and abuse prevention are ready.

## Newsletter deployment check
After creating the `subscribers` table and setting the production D1 binding `DB` to `sooloo-db`, deploy the latest main commit. Verify with a test email and confirm the record in D1 before enabling public signup. A successful deployment alone does not confirm database persistence or email delivery.

## Studio deployment
Set `STUDIO_ADMIN_TOKEN` as a production Cloudflare Pages Secret containing 64 lowercase hexadecimal characters generated from 32 random bytes. Redeploy and open `/studio`. The login shell is public; the subscriber count requires a valid bearer key. Verify login, rejection of an incorrect key, sign-out and the D1 count. Never commit the secret. Content editing and newsletter delivery are not implemented in Studio v0.1.
