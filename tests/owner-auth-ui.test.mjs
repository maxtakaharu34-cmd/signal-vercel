import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {Window} from 'happy-dom';
import {mountApp} from '../web/app.mjs';import {initialCheckpoint,DEFAULT_SIGNAL} from '../web/engine.mjs';
const until=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setImmediate(r));assert.ok(predicate())};
test('owner email form binds verification to the requested address, guards immediate resends and still requires PIN',async()=>{
 const w=new Window({url:'https://example.test/admin',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});let requested=[],verified=null,identified=false,admin=false;
 w.WebSocket=undefined;w.document.write(readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8'));
 const scene={id:1,version:1,checkpoint:initialCheckpoint(),signal:{...DEFAULT_SIGNAL},announcement:'',updated_at:new Date().toISOString()};
 w.fetch=async(path,options={})=>{const body=options.body?JSON.parse(options.body):null;if(path==='/api/session')return identified?Response.json({user:{id:'verified-owner',email:'owner@example.test'},is_admin:admin}):Response.json({message:'Sign in',code:'SIGN_IN_REQUIRED'},{status:401});if(path==='/api/auth/request'){requested.push(body.email);return Response.json({ok:true})}if(path==='/api/auth/verify'){verified=body;identified=true;return Response.json({ok:true})}if(path==='/api/admin/login'){assert.equal(body.pin,'111');admin=true;return Response.json({session:'test-session'})}if(path==='/api/scene')return Response.json(scene);if(path==='/api/events')return Response.json([]);return Response.json({message:'Unavailable'},{status:404})};
 const app=await mountApp({window:w,document:w.document}),$=id=>w.document.getElementById(id),submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 try{
  $('ownerEmail').value=' OWNER@EXAMPLE.TEST ';submit('ownerEmailForm');await until(()=>!$('ownerVerifyForm').hidden);assert.deepEqual(requested,['owner@example.test']);assert.equal($('ownerEmail').readOnly,true);assert.equal($('ownerEmailForm').querySelector('button').disabled,true);
  submit('ownerEmailForm');await new Promise(r=>setImmediate(r));assert.equal(requested.length,1);
  $('changeOwnerEmail').click();assert.equal($('ownerVerifyForm').hidden,true);assert.equal($('ownerEmail').readOnly,false);
  $('ownerEmail').value='owner@example.test';submit('ownerEmailForm');await until(()=>requested.length===2&&!$('ownerVerifyForm').hidden);$('ownerEmail').value='other@example.test';$('ownerOtp').value='123456';submit('ownerVerifyForm');await until(()=>!$('pinForm').hidden);assert.deepEqual(verified,{email:'owner@example.test',token:'123456'});assert.equal($('adminContent').hidden,true);
  $('adminPin').value='111';submit('pinForm');await until(()=>app.state().isAdmin);assert.equal($('adminContent').hidden,false);
 }finally{app.destroy();await w.happyDOM.close()}
});
test('standard email links show completion guidance and never unlock PIN until the server confirms login',async()=>{
 const w=new Window({url:'https://example.test/admin',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});let identified=false;
 w.WebSocket=undefined;w.document.write(readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8'));
 w.fetch=async path=>{if(path==='/api/session')return identified?Response.json({user:{id:'owner',email:'owner@example.test'},is_admin:false}):Response.json({code:'SIGN_IN_REQUIRED'},{status:401});if(path==='/api/auth/request')return Response.json({ok:true,method:'link'});throw Error('Unexpected request')};
 const app=await mountApp({window:w,document:w.document}),$=id=>w.document.getElementById(id);
 try{
  $('ownerEmail').value='owner@example.test';$('ownerEmailForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>!$('ownerLinkPanel').hidden);assert.equal($('ownerVerifyForm').hidden,true);assert.equal($('pinForm').hidden,true);
  $('checkOwnerLogin').click();await until(()=>!$('checkOwnerLogin').disabled);assert.equal($('pinForm').hidden,true);assert.match($('ownerAuthMessage').textContent,/先に.*同じブラウザー/);
  identified=true;$('checkOwnerLogin').click();await until(()=>!$('pinForm').hidden);assert.equal($('ownerLinkPanel').hidden,true);assert.equal($('adminContent').hidden,true);
 }finally{app.destroy();await w.happyDOM.close()}
});
