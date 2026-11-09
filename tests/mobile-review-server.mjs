// Isolated visual-review fixture. Localhost only; excluded by .vercelignore.
// The fake identity and database transport are confined to this test process.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {handleSiteApi} from '../server/site-api.mjs';
const origin='http://127.0.0.1:3112';
const env={SITE_ORIGIN:origin,OWNER_EMAIL:'review@example.invalid',ADMIN_ENTRY_PIN:'111',DEMO_BRIDGE_SECRET:'q'.repeat(64),SUPABASE_URL:'https://review.invalid',SUPABASE_PUBLISHABLE_KEY:'review-only'};
let scene=await (await fetch('https://fx-signal-terminal.vercel.app/api/scene')).json(),events=[];
globalThis.fetch=async(url,options)=>{
 if(!url.endsWith('/rpc/site_demo_bridge'))return new Response(null,{status:202});
 const input=JSON.parse(options.body);if(input.operation==='read')return Response.json({scene,events});
 if(input.payload.expected_version!==scene.version)return Response.json({code:'PT409'},{status:409});
 scene={...scene,checkpoint:input.payload.new_checkpoint,signal:input.payload.new_signal,announcement:input.payload.new_announcement,version:scene.version+1,updated_at:new Date().toISOString()};
 events=[{version:scene.version,label:input.payload.event_label,created_at:scene.updated_at},...events].slice(0,30);return Response.json({scene,events});
};
const assets=new Set(['app.mjs','app.css','viewer.css','terminal.css','mobile.css','favicon.svg']);
http.createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,origin).pathname;
  if(path.startsWith('/api/')){
   if(path==='/api/live-config'){res.writeHead(200,{'content-type':'application/json'});res.end('{}');return}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
   const response=await handleSiteApi(request,env,{userId:'visual-review-owner',email:env.OWNER_EMAIL});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  const file=path==='/'?'index.html':['/admin','/admin/'].includes(path)?'admin/index.html':assets.has(path.slice(1))?path.slice(1):null;
  if(!file){res.writeHead(404);res.end();return}
  const type=file.endsWith('.mjs')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html';
  res.writeHead(200,{'content-type':type+';charset=utf-8','cache-control':'no-store'});res.end(await readFile(new URL('../public/'+file,import.meta.url)));
 }catch{res.writeHead(500);res.end('Local review error')}
}).listen(3112,'127.0.0.1',()=>console.log(origin+' — isolated visual review; production state is untouched'));
