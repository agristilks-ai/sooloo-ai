// Run: node --test tests/studio.test.mjs  (Node 22+, no dependencies)
// Uses a real SQLite engine as a D1 stand-in and fake Supadata / Workers AI.
// These are local regression tests, NOT evidence that production providers work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, writeFileSync, mkdtempSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'studio-'));
const modPath = join(dir, 'studio.mjs');
writeFileSync(modPath, readFileSync(new URL('../functions/studio.js', import.meta.url)));
const {onRequest, SCHEMA, splitText} = await import(modPath);

const TOKEN = 'a'.repeat(64);
const ORIGIN = 'https://studio.test';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  let writes = 0;
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { const r = db.prepare(sql).get(...args); return r ? {...r} : null; },
    async all() { return {results: db.prepare(sql).all(...args).map(r => ({...r}))}; },
    async run() { const r = db.prepare(sql).run(...args); if (r.changes) writes++; return {meta: {changes: r.changes}}; },
  });
  return {raw: db, get writes() { return writes; }, prepare: sql => stmt(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; }};
}
function fakeAI(script = {}) {
  const calls = [];
  return {calls, async run(model, input) {
    calls.push({model, input});
    if (script.fail && script.fail(calls.length, input)) throw new Error('boom');
    if (model.includes('whisper')) return {text: 'hello world'};
    await new Promise(r => setTimeout(r, script.delay || 0));
    return {response: script.respond ? script.respond(calls.length, input) : 'Generated #' + calls.length, usage: {total_tokens: 10}};
  }};
}
function env(extra = {}) { return {STUDIO_ADMIN_TOKEN: TOKEN, DB: fakeD1(), AI: fakeAI(), SUPADATA_API_KEY: 'test-key', ...extra}; }
function post(e, body, {token = TOKEN, origin = ORIGIN, headers = {}} = {}) {
  const h = {'Content-Type': 'application/json', ...headers};
  if (token) h.Authorization = 'Bearer ' + token;
  if (origin) h.Origin = origin;
  const init = {method: 'POST', headers: h};
  if (body !== undefined) init.body = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
  return onRequest({request: new Request(ORIGIN + '/studio', init), env: e}).then(async r => ({status: r.status, data: await r.json()}));
}
let fetchLog = [];
function mockFetch(handler) {
  fetchLog = [];
  globalThis.fetch = async (url, init) => {
    // Cloudflare Workers reject redirect:'error' before sending anything; mirror that here.
    if (init?.redirect && !['follow', 'manual'].includes(init.redirect)) throw new TypeError('Invalid redirect value');
    fetchLog.push(String(url)); return handler(String(url), init);
  };
}
const jsonRes = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
async function newDraft(e, extra = {}) {
  const r = await post(e, {action: 'save', title: 'T', category: 'Inventory & Food Cost', sourceUrl: VIDEO, research: 'Some transcript text', body: '', ...extra});
  assert.equal(r.status, 200); return r.data.id;
}

test('GET serves the login shell with CSP and no data', async () => {
  const r = await onRequest({request: new Request(ORIGIN + '/studio'), env: env()});
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Security-Policy'), /script-src 'nonce-/);
  const html = await r.text();
  assert.match(html, /Studio v0\.11/);
  // Client script must be valid JavaScript.
  const script = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new Function(script));
});

test('auth: missing secret, bad token, wrong origin are rejected with no D1 writes or provider calls', async () => {
  mockFetch(() => { throw new Error('should not fetch'); });
  const e = env();
  assert.equal((await post({...e, STUDIO_ADMIN_TOKEN: undefined}, {action: 'list'})).status, 503);
  assert.equal((await post(e, {action: 'list'}, {token: 'b'.repeat(64)})).status, 401);
  assert.equal((await post(e, {action: 'list'}, {token: null})).status, 401);
  assert.equal((await post(e, {action: 'list'}, {origin: 'https://evil.test'})).status, 403);
  assert.equal((await post(e, {action: 'list'}, {origin: null})).status, 403);
  assert.equal((await post(e, {action: 'generate_asset', id: crypto.randomUUID(), format: 'article'}, {token: 'c'.repeat(64)})).status, 401);
  assert.equal(e.DB.writes, 0); assert.equal(e.AI.calls.length, 0); assert.equal(fetchLog.length, 0);
});

test('fresh database: overview and asset_list work without prior setup', async () => {
  const e = env({CF_PAGES_COMMIT_SHA: 'abcdef1234'});
  const o = await post(e, undefined, {headers: {'Content-Type': ''}});
  assert.equal(o.status, 200); assert.equal(o.data.total, 0); assert.equal(o.data.version, 'abcdef1');
  assert.deepEqual(o.data.integrations, {supadata: true, workersAI: true});
  assert.equal(JSON.stringify(o.data).includes('test-key'), false);
  assert.equal((await post(e, {action: 'asset_list', id: crypto.randomUUID()})).status, 404);
});

test('input validation: bad JSON, oversize, unsupported type, bad ids', async () => {
  const e = env();
  assert.equal((await post(e, '{bad')).status, 400);
  assert.equal((await post(e, JSON.stringify({action: 'save', research: 'x'.repeat(230000)}))).status, 413);
  assert.equal((await post(e, 'hello', {headers: {'Content-Type': 'text/plain'}})).status, 415);
  assert.equal((await post(e, {action: 'get', id: "1' OR '1'='1"})).status, 400);
  assert.equal((await post(e, {action: 'nope'})).status, 400);
  assert.equal((await post(e, {action: 'video_transcript', url: 'https://evil.test/x', mode: 'native'})).status, 400);
});

test('save with client newId is idempotent (retry does not duplicate the project)', async () => {
  const e = env(); const newId = crypto.randomUUID();
  const body = {action: 'save', title: 'Hello', category: 'Inventory & Food Cost', sourceUrl: '', research: 'r', body: '', newId};
  assert.equal((await post(e, body)).data.id, newId);
  assert.equal((await post(e, body)).data.id, newId);
  assert.equal((await post(e, {action: 'list'})).data.drafts.length, 1);
});

test('transcript: immediate result is stored and reused without a second provider charge', async () => {
  mockFetch(() => jsonRes(200, {content: 'Captions text', lang: 'en'}));
  const e = env();
  const a = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'native'});
  assert.equal(a.status, 200); assert.equal(a.data.status, 'completed'); assert.equal(a.data.text, 'Captions text');
  const b = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'native'});
  assert.equal(b.data.cached, true); assert.equal(b.data.text, 'Captions text');
  assert.equal(fetchLog.length, 1);
  const usage = e.DB.raw.prepare("SELECT provider,status FROM usage_events").all();
  assert.deepEqual(usage.map(u => [u.provider, u.status]), [['supadata', 'ok']]);
  assert.equal(fetchLog[0].includes('test-key'), false);
});

test('transcript: async job is persisted, resumable, and not restarted by a second click', async () => {
  let ready = false;
  mockFetch(url => url.includes('/transcript/job_123') ? jsonRes(200, ready ? {content: 'Late text', lang: 'en'} : {status: 'active'}) : jsonRes(202, {jobId: 'job_123'}));
  const e = env();
  const a = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'auto'});
  assert.equal(a.data.status, 'pending'); const jobId = a.data.jobId;
  // Simulated page reload: a fresh start request returns the same job, no new provider job.
  const again = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'auto'});
  assert.equal(again.data.jobId, jobId);
  assert.equal(fetchLog.filter(u => u.includes('?url=')).length, 1);
  assert.equal((await post(e, {action: 'video_transcript_status', jobId})).data.status, 'pending');
  ready = true;
  const done = await post(e, {action: 'video_transcript_status', jobId});
  assert.equal(done.data.status, 'completed'); assert.equal(done.data.text, 'Late text');
  const reuse = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'native'});
  assert.equal(reuse.data.cached, true);
});

test('transcript: provider errors are truthful and not retried endlessly', async () => {
  mockFetch(() => jsonRes(206, {error: 'transcript-unavailable'}));
  const e = env();
  const r = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'native'});
  assert.equal(r.status, 422); assert.match(r.data.error, /No existing captions/);
  mockFetch(() => jsonRes(401, {error: 'unauthorized'}));
  const r2 = await post(e, {action: 'video_transcript', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', mode: 'native'});
  assert.equal(r2.status, 502); assert.match(r2.data.error, /denied access/);
  assert.equal((await post({...e, SUPADATA_API_KEY: ''}, {action: 'video_transcript', url: VIDEO, mode: 'native'})).status, 503);
});

test('package: six formats are generated and stored server-side; rerun costs nothing', async () => {
  const e = env(); const id = await newDraft(e);
  for (const format of ['article', 'linkedin', 'newsletter', 'video', 'thread', 'short']) {
    const r = await post(e, {action: 'generate_asset', id, format});
    assert.equal(r.status, 200); assert.equal(r.data.saved, true);
  }
  const list = await post(e, {action: 'asset_list', id});
  assert.equal(list.data.assets.length, 6);
  assert.equal(e.AI.calls.length, 6);
  for (const format of ['article', 'short']) assert.equal((await post(e, {action: 'generate_asset', id, format})).data.skipped, true);
  assert.equal(e.AI.calls.length, 6);
  assert.match((await post(e, {action: 'asset_get', id, format: 'thread'})).data.asset.content, /Generated/);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM generation_locks').get().n, 0);
});

test('package: partial failure keeps saved formats and releases the lock; resume fills only the gap', async () => {
  const e = env({AI: fakeAI({fail: n => n === 3})}); const id = await newDraft(e);
  const formats = ['article', 'linkedin', 'newsletter'];
  assert.equal((await post(e, {action: 'generate_asset', id, format: formats[0]})).status, 200);
  assert.equal((await post(e, {action: 'generate_asset', id, format: formats[1]})).status, 200);
  const fail = await post(e, {action: 'generate_asset', id, format: formats[2]});
  assert.equal(fail.status, 502);
  assert.equal((await post(e, {action: 'asset_list', id})).data.assets.length, 2);
  // Manual edit of an existing format must survive a resume.
  await post(e, {action: 'asset_save', id, format: 'article', content: 'My manual edit'});
  for (const f of formats) await post(e, {action: 'generate_asset', id, format: f});
  assert.equal((await post(e, {action: 'asset_list', id})).data.assets.length, 3);
  assert.equal((await post(e, {action: 'asset_get', id, format: 'article'})).data.asset.content, 'My manual edit');
  assert.equal(e.AI.calls.length, 4);
});

test('package: two tabs generating the same format trigger only one AI call', async () => {
  const e = env({AI: fakeAI({delay: 30})}); const id = await newDraft(e);
  const [a, b] = await Promise.all([post(e, {action: 'generate_asset', id, format: 'thread'}), post(e, {action: 'generate_asset', id, format: 'thread'})]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(e.AI.calls.length, 1);
});

test('spend cap: daily AI limit blocks the call before any charge', async () => {
  const e = env({STUDIO_DAILY_AI_LIMIT: '2'}); const id = await newDraft(e);
  await post(e, {action: 'generate_asset', id, format: 'article'});
  await post(e, {action: 'generate_asset', id, format: 'linkedin'});
  const r = await post(e, {action: 'generate_asset', id, format: 'thread'});
  assert.equal(r.status, 429); assert.match(r.data.error, /Daily AI limit/);
  assert.equal(e.AI.calls.length, 2);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM generation_locks').get().n, 0);
});

test('audio: oversize rejected before inference; valid upload transcribed and logged', async () => {
  const e = env();
  const big = await post(e, new Uint8Array(2000001), {headers: {'Content-Type': 'application/octet-stream', 'X-Studio-Action': 'transcribe'}});
  assert.equal(big.status, 413); assert.equal(e.AI.calls.length, 0);
  const ok = await post(e, new Uint8Array([1, 2, 3]), {headers: {'Content-Type': 'application/octet-stream', 'X-Studio-Action': 'transcribe'}});
  assert.equal(ok.status, 200); assert.equal(ok.data.text, 'hello world');
});

test('migration file matches the runtime schema', () => {
  const files = readdirSync(new URL('../migrations/', import.meta.url));
  const sql = files.map(f => readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8')).join('\n').replace(/\s+/g, ' ');
  for (const s of SCHEMA) assert.ok(sql.includes(s.replace(/\s+/g, ' ')), 'missing in migrations: ' + s.slice(0, 60));
});

test('newsletter signup is paused unless explicitly reopened', async () => {
  writeFileSync(join(dir, 'sub.mjs'), readFileSync(new URL('../functions/api/subscribe.js', import.meta.url)));
  const {onRequestPost} = await import(join(dir, 'sub.mjs'));
  const e = {DB: fakeD1()};
  const req = () => new Request(ORIGIN + '/api/subscribe', {method: 'POST', headers: {'Content-Type': 'application/json', Origin: ORIGIN}, body: JSON.stringify({email: 'a@b.co', consent: true})});
  const r = await onRequestPost({request: req(), env: e});
  assert.equal(r.status, 503); assert.equal((await r.json()).paused, true); assert.equal(e.DB.writes, 0);
});

test('outbound server fetches use a redirect mode the Workers runtime accepts', () => {
  const src = readFileSync(new URL('../functions/studio.js', import.meta.url), 'utf8');
  const server = src.slice(src.indexOf('// Server side.'));
  assert.equal(/redirect:\s*'error'/.test(server), false);
});

test('long transcript is stored once and never charged again', async () => {
  mockFetch(() => jsonRes(200, {content: 'word. '.repeat(20000), lang: 'en'}));
  const e = env();
  const a = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'native'});
  assert.equal(a.status, 200); assert.equal(a.data.status, 'too_long'); assert.equal(a.data.chars, 120000); assert.equal(a.data.parts, 4);
  assert.equal(a.data.text, undefined);
  const b = await post(e, {action: 'video_transcript', url: VIDEO, mode: 'native'});
  assert.equal(b.data.status, 'too_long'); assert.equal(b.data.cached, true);
  assert.equal(fetchLog.length, 1);
});

async function longJob(e, chars = 120000) {
  mockFetch(() => jsonRes(200, {content: 'This is a sentence about tools. '.repeat(Math.ceil(chars / 32)).slice(0, chars), lang: 'en'}));
  return (await post(e, {action: 'video_transcript', url: VIDEO, mode: 'native'})).data.jobId;
}
async function digestAll(e, jobId, max = 40) {
  let r;
  for (let i = 0; i < max; i++) { r = await post(e, {action: 'transcript_digest', jobId}); if (r.status !== 200 || r.data.status === 'completed') break; }
  return r;
}

test('splitText keeps every character and respects the part size', () => {
  const text = 'Alpha beta. Gamma delta? '.repeat(9000);
  const parts = splitText(text, 36000);
  assert.ok(parts.every(p => p.length <= 36000));
  assert.equal(parts.join(' ').replace(/\s+/g, ''), text.replace(/\s+/g, ''));
});

test('long transcript → saved notes per part → research brief; rerun costs nothing', async () => {
  const e = env({AI: fakeAI({respond: n => 'Note or brief #' + n})});
  const jobId = await longJob(e);
  const r = await digestAll(e, jobId);
  assert.equal(r.status, 200); assert.equal(r.data.status, 'completed'); assert.equal(r.data.parts, 4);
  assert.equal(e.AI.calls.length, 5);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM transcript_notes').get().n, 4);
  const again = await post(e, {action: 'transcript_digest', jobId});
  assert.equal(again.data.text, r.data.text); assert.equal(e.AI.calls.length, 5);
  assert.ok(r.data.text.length < 30000);
});

test('long transcript: failure mid-way resumes from the last saved part', async () => {
  const e = env({AI: fakeAI({fail: n => n === 2})});
  const jobId = await longJob(e);
  assert.equal((await post(e, {action: 'transcript_digest', jobId})).data.status, 'working');
  assert.equal((await post(e, {action: 'transcript_digest', jobId})).status, 502);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM generation_locks').get().n, 0);
  const r = await digestAll(e, jobId);
  assert.equal(r.data.status, 'completed');
  assert.equal(e.AI.calls.length, 6); // 4 parts + 1 failed attempt + brief
});

test('very long transcript is condensed in extra levels when notes are too large', async () => {
  const e = env({AI: fakeAI({respond: (n, input) => input.messages[1].content.startsWith('Transcript part') ? 'n'.repeat(9000) : 'short summary ' + n})});
  const jobId = await longJob(e, 250000);
  const r = await digestAll(e, jobId);
  assert.equal(r.data.status, 'completed');
  const levels = e.DB.raw.prepare('SELECT DISTINCT level FROM transcript_notes ORDER BY level').all().map(x => x.level);
  assert.deepEqual(levels, [0, 1]);
});

test('digest rejects unknown or unfinished jobs', async () => {
  const e = env();
  assert.equal((await post(e, {action: 'transcript_digest', jobId: crypto.randomUUID()})).status, 404);
  assert.equal((await post(e, {action: 'transcript_digest', jobId: 'nope'})).status, 400);
});

test('client only polls when the job is really pending', () => {
  const src = readFileSync(new URL('../functions/studio.js', import.meta.url), 'utf8');
  assert.match(src, /if\(d\.status==='pending'&&d\.jobId\)/);
});

test('leading "Here is ..." preamble is removed from AI output', async () => {
  const e = env({AI: {calls: [], async run() { return {response: "Here's a LinkedIn post based on the material:\n\nReal post text"}; }}});
  const id = await newDraft(e);
  const r = await post(e, {action: 'generate_asset', id, format: 'linkedin'});
  assert.equal(r.data.output, 'Real post text');
});

test('legacy draft categories can still be saved', async () => {
  const e = env();
  const r = await post(e, {action: 'save', title: 'Old', category: 'AI Workflows', sourceUrl: '', research: 'r', body: ''});
  assert.equal(r.status, 200);
  assert.equal((await post(e, {action: 'save', title: 'Bad', category: 'Nope', sourceUrl: '', research: 'r', body: ''})).status, 400);
});

test('Media OS: authenticated research records and idea pipeline persist without provider calls', async () => {
  const e=env(), channel='Animated Science', id=crypto.randomUUID(), competitorId=crypto.randomUUID();
  const empty=await post(e,{action:'media_list'});
  assert.equal(empty.status,200);assert.equal(empty.data.channels.length,4);
  const competitor={action:'media_competitor',id:competitorId,channel,name:'Example',url:'https://www.youtube.com/@example',notes:'Research'};
  assert.equal((await post(e,competitor)).status,200);
  assert.equal((await post(e,{...competitor,id:crypto.randomUUID(),notes:'Updated'})).status,200);
  const idea={action:'media_idea',id,channel,title:'Original science explainer',url:'',notes:'Audience question'};
  assert.equal((await post(e,idea)).status,200);assert.equal((await post(e,idea)).status,200);
  assert.equal((await post(e,{action:'media_status',id,status:'approved'})).status,200);
  const list=await post(e,{action:'media_list'});
  assert.equal(list.data.competitors.length,1);assert.equal(list.data.competitors[0].notes,'Updated');
  assert.equal(list.data.ideas.length,1);assert.equal(list.data.ideas[0].status,'approved');
  assert.equal(list.data.channels[0].competitors,1);assert.equal(list.data.channels[0].ideas,1);
  assert.equal(e.AI.calls.length,0);
  assert.equal((await post(e,{action:'media_list'},{token:null})).status,401);
  assert.equal((await post(e,{...idea,channel:'invalid'})).status,400);
  assert.equal((await post(e,{...competitor,url:'https://evil.test'})).status,400);
  assert.equal((await post(e,{action:'media_status',id,status:'published'})).status,400);
  assert.equal((await post(e,{action:'media_status',id:crypto.randomUUID(),status:'approved'})).status,404);
});
