import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {validateRequest,callAnthropic,ENDPOINT}=createRequire(import.meta.url)('../desktop/anthropic.cjs');
const version='2026-10-21';const body={model:'claude-opus-5-5',max_tokens:1024,system:'Propose a design',messages:[{role:'user',content:'A leaf'}]};
test('desktop proxy allowlists payload and fixes the endpoint',async()=>{
 let sent;
 const result=await callAnthropic('test-key',{...body,url:'https://example.com',tools:[{name:'shell'}]},version,undefined,async(url,options)=>{sent={url,...options};return new Response(JSON.stringify({content:[{type:'text',text:'🌿'}]}),{status:200});});
 assert.equal(sent.url,ENDPOINT);assert.equal(sent.redirect,'error');assert.equal(sent.headers['x-api-key'],'test-key');assert.equal(sent.headers['anthropic-version'],version);assert.deepEqual(JSON.parse(sent.body),body);assert.equal(result.data.content[0].text,'🌿');
});
test('rejects unbounded, malformed or role-injected requests',()=>{
 for(const altered of [{...body,max_tokens:999999},{...body,model:'bad\r\nheader'},{...body,system:'x'.repeat(20001)},{...body,messages:[{role:'system',content:'x'}]}])assert.throws(()=>validateRequest(altered,version));
 assert.throws(()=>validateRequest(body,'bad date'));
});
test('propagates HTTP error status and redacts key in response',async()=>{
 const r=await callAnthropic('test-secret',body,version,undefined,async()=>new Response(JSON.stringify({error:{message:'test-secret denied'}}),{status:401}));
 assert.equal(r.ok,false);assert.equal(r.status,401);assert.equal(r.data.error.message,'[redacted] denied');
});
test('caps response bytes and passes cancellation through',async()=>{
 await assert.rejects(callAnthropic('test',body,version,undefined,async()=>new Response('x'.repeat(1000001))),/too large/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(callAnthropic('test',body,version,controller.signal,async(_url,options)=>{options.signal.throwIfAborted();}),/abort/i);
});
