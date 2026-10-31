import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAiPlan,validateAgent,BUILTIN_AGENTS} from '../src/ai/schema.ts';
const parse=(operations,tools=['element','outline','rewrite','notes','theme'])=>parseAiPlan(JSON.stringify({summary:'A clear design',operations}),tools,['text-1'],['Inter']);
test('accepts permitted structured actions and fenced JSON',()=>{
 assert.equal(parse([{tool:'notes',text:'Introduce the problem.'}]).operations[0].text,'Introduce the problem.');
 assert.equal(parseAiPlan('```json\n{"summary":"Done","operations":[{"tool":"notes","text":"Notes"}]}\n```',['notes'],[],[]).summary,'Done');
});
test('agent tools are enforced and unsupported actions are rejected',()=>{
 assert.throws(()=>parse([{tool:'theme'}],['element']),/not allowed/);
 assert.throws(()=>parse([{tool:'shell',command:'arbitrary'}]),/not allowed/);
 assert.throws(()=>parse([{tool:'notes',text:'A'},{tool:'notes',text:'B'}]),/repeated/);
});
test('rewrites only reference unique known unlocked text IDs',()=>{
 assert.throws(()=>parse([{tool:'rewrite',changes:[{id:'missing',text:'A'}]}]),/unknown/);
 assert.throws(()=>parse([{tool:'rewrite',changes:[{id:'text-1',text:'A'},{id:'text-1',text:'B'}]}]),/repeated/);
 assert.equal(parse([{tool:'rewrite',changes:[{id:'text-1',text:'New copy'}]}]).operations[0].changes[0].text,'New copy');
});
test('themes require all seven colours and installed fonts',()=>{
 const theme={tool:'theme',name:'Test',colors:Object.fromEntries(['background','surface','text','muted','primary','secondary','accent'].map(k=>[k,'#abcdef'])),heading:'Inter',body:'Inter'};
 assert.equal(parse([theme]).operations[0].name,'Test');
 assert.throws(()=>parse([{...theme,body:'Missing font'}]),/not installed/);
 assert.throws(()=>parse([{...theme,colors:{...theme.colors,text:'url(https://example.com)'}}]),/colour/);
});
test('bounded responses and imported agents reject malformed data',()=>{
 assert.throws(()=>parse([]),/one to six/);
 assert.throws(()=>parse(Array.from({length:7},()=>({tool:'element',name:'X',svg:'<svg/>'}))),/one to six/);
 assert.throws(()=>validateAgent({id:'x',name:'x',instructions:'x',tools:['exec']}),/supported/);
 assert.throws(()=>validateAgent({id:'x',name:'x',instructions:'x',tools:[]}),/supported/);
 for(const a of BUILTIN_AGENTS)assert.deepEqual(validateAgent(a),a);
});
