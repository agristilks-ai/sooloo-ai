# SOOLOO.AI

Independent English-language media site for solopreneurs, plus a private editorial Studio.
Hosted on Cloudflare Pages (project `sooloo-ai`), auto-deployed from `main`.

## What is where

| Path | What it is |
|---|---|
| `public/` | Public static site (no build step). Articles in `app.js` are hard-coded samples. |
| `functions/api/subscribe.js` | Newsletter signup → D1 `subscribers`. **Legal/privacy workflow not finished.** |
| `functions/studio.js` | Private Studio at `/studio`: login shell (GET) and authenticated JSON API (POST). |
| `migrations/0001_studio_schema.sql` | Full current schema. Non-destructive (`IF NOT EXISTS` only). |
| `tests/studio.test.mjs` | Local regression tests (SQLite stands in for D1; providers are faked). |
| `schema.sql` | Legacy v0.1 file; superseded by `migrations/`. |
| `SOOLOO-AI-v0.1.zip` | Historical upload. Do not deploy from it. |

## Cloudflare settings (dashboard-managed)

Framework: None · Build command: empty · Output directory: `public` · Root: repository root.

| Name | Type | Notes |
|---|---|---|
| `DB` | D1 binding | `sooloo-db` (id `03a7ce3f-0425-4422-a909-c7abfac13038`) |
| `AI` | Workers AI binding | text: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, speech: `@cf/openai/whisper-large-v3-turbo` |
| `STUDIO_ADMIN_TOKEN` | Secret | exactly 64 lowercase hex chars. Never commit or paste it anywhere. |
| `SUPADATA_API_KEY` | Secret | Supadata transcript API key |
| `STUDIO_DAILY_AI_LIMIT` | Variable (optional) | Max Workers AI calls per UTC day. Default 40. |
| `STUDIO_DAILY_TRANSCRIPT_LIMIT` | Variable (optional) | Max Supadata requests per UTC day. Default 10. |

The Studio creates any missing tables itself on first authenticated request (same SQL as the migration),
so no manual database step is needed after deploying. It never drops or rewrites existing data.

## How the video → content package works (v0.10)

1. **Transcript.** `video_transcript` records a `transcript_jobs` row *before* calling Supadata.
   A finished transcript for the same video is reused for 7 days (no new charge). An in-flight job is
   resumed instead of restarted, so a reload or second click does not pay twice.
2. **Project.** The draft is saved with a browser-chosen ID, so a retried save cannot create duplicates.
3. **Six formats.** `generate_asset` reads the *saved* draft, calls Workers AI and stores the result in
   `content_assets` in the same server request. Existing formats (including manual edits) are skipped
   without an AI call. A short lock stops two tabs generating the same format.
4. **Long transcripts (over 30,000 characters).** The full transcript is stored once. `transcript_digest`
   does one AI step per request: each ~36,000-character part becomes bullet notes (`transcript_notes`),
   notes are condensed further if needed, then one structured research brief is stored in
   `transcript_briefs`. Every step is saved, so an interrupted run resumes without repeating paid work.
   The brief (not the raw transcript) feeds the six formats.
5. **Spend guard.** Every paid call writes a `usage_events` row first; daily caps return HTTP 429 before
   any charge. Today's usage is shown on the Studio overview with the deployed build ID.

Errors return a short reference ID; the server logs only action + reference, never keys or source text.

## Testing

```
node --test tests/studio.test.mjs      # Node 22+, no install needed
```

These tests prove the logic, not that the live providers work. A real end-to-end check needs the
deployed Studio, a signed-in owner and a short video the owner has rights to use, then verifying the
rows in D1 (`editorial_drafts`, `content_assets`, `transcript_jobs`, `usage_events`).

## Rollback

Every deploy is a Cloudflare Pages deployment: Pages → `sooloo-ai` → Deployments → previous build →
"Rollback to this deployment". The new tables are additive, so older code keeps working with them.

## Known gaps (see audit)

Newsletter signup is paused (returns "open soon", stores nothing) until privacy notice, double opt-in and unsubscribe exist; reopen with variable `NEWSLETTER_SIGNUPS_OPEN=true`. Admin access is a
single long-lived key (Cloudflare Access recommended). No publishing flow, research engine, revision
history or source versioning yet.

## Production verification log

| Date (UTC) | Check | Result |
|---|---|---|
| 2026-11-24 | Live `/studio` serves v0.10; invalid key → 401; signup paused → 503 "open soon" | PASS |
| 2026-11-24 | Workers AI, 6 formats from original test note → 6 `content_assets` rows; second run → 0 AI calls, 6 preserved | PASS |
| 2026-11-24 | Supadata native captions: first attempt failed instantly (`redirect:'error'` unsupported in Workers) → fixed | FIXED |
| 2026-11-24 | 6-hour video: real transcript returned, over editor limit → now stored, not re-charged | FIXED |
| 2026-11-24 | Owner Short `x8GMoBkcTQM`: 1 Supadata call → 451-char transcript → draft saved → 6 AI outputs stored in D1 | PASS |
| — | Instagram transcript, Whisper audio, async (202) job, reload-and-resume in UI | NOT YET RUN |
