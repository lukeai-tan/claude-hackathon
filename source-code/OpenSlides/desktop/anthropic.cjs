'use strict';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
function validateRequest(body, version) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid request.');
  if (typeof version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error('Invalid API version.');
  if (typeof body.model !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(body.model)) throw new Error('Invalid model ID.');
  if (!Number.isInteger(body.max_tokens) || body.max_tokens < 128 || body.max_tokens > 16384) throw new Error('Invalid output limit.');
  if (typeof body.system !== 'string' || body.system.length > 20000) throw new Error('Invalid instructions.');
  if (!Array.isArray(body.messages) || body.messages.length !== 1 || body.messages[0]?.role !== 'user' || typeof body.messages[0]?.content !== 'string' || body.messages[0].content.length > 80000) throw new Error('Invalid design request.');
  // Construct a fresh allowlisted payload; never forward tools, endpoints or arbitrary renderer fields.
  return { model:body.model, max_tokens:body.max_tokens, system:body.system, messages:[{role:'user',content:body.messages[0].content}] };
}
async function callAnthropic(key, body, version, signal, fetchImpl = fetch) {
  if (!key) throw new Error('Add your Anthropic API key in AI settings.');
  const payload = validateRequest(body, version);
  const response = await fetchImpl(ENDPOINT, {method:'POST', headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':version},body:JSON.stringify(payload),signal,redirect:'error'});
  let text=''; const reader=response.body?.getReader();
  if (reader) {
    const decoder=new TextDecoder();let bytes=0;
    while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1_000_000){await reader.cancel();throw new Error('Claudia response is too large.');}text+=decoder.decode(value,{stream:true});}
    text+=decoder.decode();
  }
  let data;try{data=JSON.parse(text.split(key).join('[redacted]'));}catch{data={};}
  return {ok:response.ok,status:response.status,data};
}
module.exports={validateRequest,callAnthropic,ENDPOINT};
