// Free-tool email capture: a visitor gives an email (with explicit consent) to unlock a tool extra.
// Stores email + which tool + consent time only. No paid calls, no emails sent from here.
export const LEADS_TABLE = "CREATE TABLE IF NOT EXISTS leads (email TEXT NOT NULL, source TEXT NOT NULL, consented_at TEXT NOT NULL, PRIMARY KEY(email,source))";
const SOURCES = new Set(['food-cost']);

export async function onRequestPost({request, env}) {
  const json = (data, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store'}});
  try {
    if (!env.DB) return json({error: 'Storage is not configured.'}, 503);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({error: 'Invalid origin.'}, 403);
    const text = await request.text();
    if (text.length > 2000) return json({error: 'Request too large.'}, 413);
    let body; try { body = JSON.parse(text); } catch { return json({error: 'Invalid request.'}, 400); }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || body.consent !== true) return json({error: 'Valid email and consent required.'}, 400);
    if (!SOURCES.has(body.source)) return json({error: 'Unknown tool.'}, 400);
    await env.DB.prepare(LEADS_TABLE).run();
    await env.DB.prepare('INSERT OR IGNORE INTO leads(email,source,consented_at) VALUES (?,?,?)').bind(email, body.source, new Date().toISOString()).run();
    return json({ok: true});
  } catch {
    return json({error: 'Could not save.'}, 500);
  }
}
