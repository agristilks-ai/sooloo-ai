// Temporary single-use production smoke test. No customer data or user input.
const response=(status,body)=>new Response('<!doctype html><html><head><meta name="robots" content="noindex,nofollow"><title>Studio AI check</title></head><body><pre>'+JSON.stringify(body,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</pre></body></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Content-Security-Policy':"default-src 'none'"}});
export async function onRequest({request,env}){
  if(request.method!=='GET')return response(405,{status:'method not allowed'});
  if(!env.DB||!env.AI||typeof env.AI.run!=='function')return response(503,{status:'binding unavailable'});
  const id='ai-check-2026-11-24-v1';
  try{
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS studio_diagnostic (id TEXT PRIMARY KEY, state TEXT NOT NULL, result TEXT NOT NULL DEFAULT \'\')').run();
    const claimed=await env.DB.prepare("INSERT OR IGNORE INTO studio_diagnostic(id,state) VALUES (?, 'running')").bind(id).run();
    if(claimed.meta?.changes!==1){
      const row=await env.DB.prepare('SELECT state,result FROM studio_diagnostic WHERE id=?').bind(id).first();
      return response(200,{status:row?.state||'unavailable',output:row?.result||''});
    }
    try{
      const result=await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast',{messages:[{role:'system',content:'You are an independent English-language editor for SOOLOO.AI. Write original, practical content without invented facts or statistics.'},{role:'user',content:'Write a short LinkedIn post for solopreneurs on using AI to turn one original idea into a useful article, newsletter and short video. Include a concrete three-step workflow and a reminder to verify claims. 100–140 words.'}],max_tokens:350,temperature:0.5});
      const output=result?.response;
      if(typeof output!=='string'||!output.trim())throw Error('empty');
      await env.DB.prepare("UPDATE studio_diagnostic SET state='complete',result=? WHERE id=?").bind(output.slice(0,4000),id).run();
      return response(200,{status:'complete',model:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',output:output.slice(0,4000)});
    }catch{
      await env.DB.prepare("UPDATE studio_diagnostic SET state='failed' WHERE id=?").bind(id).run();
      return response(502,{status:'AI generation failed'});
    }
  }catch{return response(500,{status:'diagnostic storage failed'});}
}
