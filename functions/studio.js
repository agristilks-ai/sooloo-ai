// SOOLOO Studio v0.1 — fail-closed administrator dashboard.
const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Robots-Tag': 'noindex, nofollow',
};
function json(data, status=200) {
  return Response.json(data, {status, headers: {...headers, Vary:'Authorization'}});
}
async function matches(expected, actual) {
  const encoder = new TextEncoder();
  const digest = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
  const [a,b] = await Promise.all([digest(expected),digest(actual)]);
  let diff=0;
  for(let i=0;i<a.length;i++) diff |= a[i]^b[i];
  return diff===0;
}
function page(nonce) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>SOOLOO Studio</title>
<style nonce="${nonce}">
:root{color-scheme:dark;--bg:#080b09;--panel:#111813;--border:#293b30;--text:#f5f7f5;--muted:#a1ada5;--green:#39e58c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,sans-serif}header{border-bottom:1px solid var(--border);padding:20px 5%;display:flex;align-items:center;justify-content:space-between;gap:16px}header a{color:var(--muted);font-size:14px;text-decoration:none}strong.brand{font-size:23px;letter-spacing:-.05em}strong.brand span,.eyebrow{color:var(--green)}main{max-width:1100px;margin:auto;padding:44px 5% 70px}.eyebrow{text-transform:uppercase;font-size:12px;font-weight:750;letter-spacing:.16em}h1{font-size:clamp(30px,5vw,54px);line-height:1.1;letter-spacing:-.05em;margin:12px 0}h2{font-size:20px;margin:0 0 12px}p{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:24px}.login{max-width:460px;margin-top:28px}label{display:block;margin-bottom:8px;font-weight:650}input{width:100%;background:var(--bg);color:var(--text);border:1px solid #45594a;border-radius:8px;padding:12px;font:inherit}button{font:inherit;font-weight:700;background:var(--green);color:var(--bg);border:0;border-radius:8px;padding:12px 18px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}button.secondary{background:transparent;color:var(--text);border:1px solid var(--border)}form button{margin-top:14px;width:100%}button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid var(--green);outline-offset:3px}.status{min-height:1.5em;margin:12px 0 0;overflow-wrap:anywhere}.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin:22px 0}.number{font-size:46px;font-weight:750;letter-spacing:-.06em;color:var(--green);margin:6px 0}.caption{color:var(--muted);font-size:14px}.coming{color:var(--muted);font-size:13px}section[hidden]{display:none!important}.actions{display:flex;gap:8px;flex-wrap:wrap}.foot{margin-top:24px;font-size:13px;color:var(--muted)}
</style></head><body>
<header><strong class="brand">SOOLOO<span>.AI</span> / Studio</strong><a href="/">Public website</a></header>
<main><div class="eyebrow">Private editorial workspace</div>
<section id="login"><h1>Studio access.</h1><p>Sign in with your private administrator access key.</p>
<form class="panel login" id="form" autocomplete="off"><label for="key">Administrator access key</label><input id="key" type="password" autocomplete="off" required minlength="64" maxlength="64" spellcheck="false" autocapitalize="off"><button id="submit" type="submit">Unlock Studio</button><p class="status" id="message" role="status" aria-live="polite"></p></form></section>
<section id="dashboard" hidden><div class="bar"><div><h1>Overview.</h1><p>Manage your independent media business.</p></div><div class="actions"><button class="secondary" id="refresh" type="button">Refresh</button><button class="secondary" id="logout" type="button">Sign out</button></div></div>
<div class="grid"><article class="panel"><div class="eyebrow">Newsletter</div><div class="number" id="total">—</div><div class="caption">Stored subscriber records, including test signups. Not verified email recipients.</div></article><article class="panel"><div class="eyebrow">Database</div><h2 id="dbState">—</h2><div class="caption">Live D1 query status</div></article></div>
<h2>Workspace roadmap</h2><div class="grid"><article class="panel"><h2>Content Factory</h2><p>Research and original content workflows.</p><span class="coming">Not implemented</span></article><article class="panel"><h2>Article Editor</h2><p>Drafts, review and publishing.</p><span class="coming">Not implemented</span></article><article class="panel"><h2>Newsletter</h2><p>Email delivery and consent management.</p><span class="coming">Not implemented</span></article><article class="panel"><h2>Affiliate Center</h2><p>Partner links and commission tracking.</p><span class="coming">Not implemented</span></article></div>
<p id="dashboardMessage" class="status" role="status" aria-live="polite"></p><div class="foot">Studio v0.1 · Access key is held in memory only. Reloading the page signs you out.</div></section></main>
<script nonce="${nonce}">
(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  let key='', generation=0, pending=null;
  const form=byId('form'), input=byId('key'), submit=byId('submit');
  function signOut(message=''){
    generation++; if(pending)pending.abort(); pending=null; key=''; input.value=''; submit.disabled=false; byId('refresh').disabled=false;
    byId('total').textContent='—';byId('dbState').textContent='—';byId('dashboardMessage').textContent='';
    byId('dashboard').hidden=true;byId('login').hidden=false;byId('message').textContent=message;
  }
  async function load(candidate, signingIn){
    const current=++generation; if(pending)pending.abort(); const controller=new AbortController();pending=controller;
    const status=signingIn?byId('message'):byId('dashboardMessage');
    status.textContent='Checking connection…';submit.disabled=true;byId('refresh').disabled=true;
    try{
      const response=await fetch('/studio',{method:'POST',headers:{Authorization:'Bearer '+candidate},cache:'no-store',credentials:'omit',signal:controller.signal,redirect:'error'});
      const data=await response.json();
      if(current!==generation)return;
      if(!response.ok){if(response.status===401){signOut('Invalid access key.');return;}throw Error(data.error||'Studio unavailable.');}
      if(!Number.isSafeInteger(data.total)||data.total<0)throw Error('Unexpected database response.');
      key=candidate;input.value='';byId('total').textContent=String(data.total);byId('dbState').textContent='Connected';
      byId('login').hidden=true;byId('dashboard').hidden=false;byId('dashboardMessage').textContent='Updated '+new Date().toLocaleTimeString();status===byId('message')&&(status.textContent='');
    }catch(e){if(current===generation){status.textContent=e.message||'Connection failed.';if(!signingIn){byId('total').textContent='—';byId('dbState').textContent='Unavailable';}}}
    finally{if(current===generation){submit.disabled=false;byId('refresh').disabled=false;pending=null;}}
  }
  form.addEventListener('submit',e=>{e.preventDefault();const candidate=input.value.trim();input.value='';load(candidate,true);});
  byId('refresh').addEventListener('click',()=>{if(key)load(key,false);});
  byId('logout').addEventListener('click',()=>signOut());
  window.addEventListener('pagehide',()=>signOut());
})();
</script></body></html>`;
}
export async function onRequest({request,env}) {
  if(request.method==='GET') {
    const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
    return new Response(page(nonce),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}});
  }
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  // The login shell is public, but no data is returned without a configured high-entropy secret.
  const expected=env.STUDIO_ADMIN_TOKEN;
  if(typeof expected!=='string'||!/^[a-f0-9]{64}$/.test(expected))return json({error:'Studio access is not configured.'},503);
  const origin=request.headers.get('Origin');
  if(origin!==new URL(request.url).origin)return json({error:'Invalid origin.'},403);
  const authorization=request.headers.get('Authorization')||'';
  const match=/^Bearer ([a-f0-9]{64})$/.exec(authorization);
  if(!match||!(await matches(expected,match[1])))return json({error:'Unauthorized.'},401);
  if(!env.DB)return json({error:'Database is not configured.'},503);
  try {
    const row=await env.DB.prepare('SELECT COUNT(*) AS total FROM subscribers').first();
    if(!Number.isSafeInteger(row?.total)||row.total<0)throw Error('Unexpected count');
    return json({total:row.total});
  } catch {return json({error:'Database query failed.'},500);}
}
