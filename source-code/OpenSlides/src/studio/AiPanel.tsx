import {useEffect,useRef,useState} from 'react';
import {Sparkles,Settings2,ArrowUp,Square,Check,Bookmark,KeyRound} from 'lucide-react';
import {currentSlide,useEditor,setToast} from '../store/editor';
import {BUILTIN_AGENTS,validateAgent,type DesignAgent} from '../ai/schema';
import {requestPlan,type AiResult} from '../ai/client';
import {preparePlan,applyPreparedPlan} from '../ai/apply';
import {getSettings,saveSettings,setApiKey,hasApiKey,type AiSettings} from '../ai/settings';
import {readPreference} from './preferences';
import {SlideView} from '../render/SlideView';
import type {Deck} from '../model/types';
import {svgDataUrl} from './svg';
import {saveGraphic} from './library';
import {uid} from '../model/factory';
export function availableAgents():DesignAgent[]{const raw=readPreference<unknown[]>('df-design-agents',[]);const custom:DesignAgent[]=[];if(Array.isArray(raw))for(const a of raw){try{custom.push(validateAgent(a));}catch{/* ignore damaged profiles */}}return [...BUILTIN_AGENTS,...custom];}
export function AiSettingsForm({onReady}:{onReady:()=>void}){
  const [settings,setSettings]=useState<AiSettings>(getSettings),[key,setKey]=useState(''),[remember,setRemember]=useState(false),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
  return <form className="ai-settings" onSubmit={async e=>{e.preventDefault();setBusy(true);try{if(!/^[\w.:-]{1,100}$/.test(settings.model)||!/^\d{4}-\d{2}-\d{2}$/.test(settings.version))throw new Error('Check the model ID and API date.');if(key.trim())await setApiKey(key,remember);saveSettings(settings);setKey('');setStatus('Settings saved.');onReady();}catch(error){setStatus((error as Error).message);}finally{setBusy(false);}}}>
    <label><span>Anthropic API key</span><input type="password" autoComplete="off" spellCheck={false} value={key} placeholder="Enter a key to connect or replace" onChange={e=>setKey(e.target.value)} aria-label="Anthropic API key"/></label>
    {window.deckforgeDesktop?<label className="check-row"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember with OS encryption</label>:<p className="small muted">The browser keeps your key in memory for this session only. Requests go directly to Anthropic.</p>}
    <label><span>Model ID</span><input value={settings.model} onChange={e=>setSettings({...settings,model:e.target.value})}/></label>
    <label><span>API version</span><input value={settings.version} onChange={e=>setSettings({...settings,version:e.target.value})}/></label>
    <label><span>Maximum output tokens</span><select value={settings.maxTokens} onChange={e=>setSettings({...settings,maxTokens:+e.target.value})}>{[2048,4096,8192,16384].map(n=><option key={n} value={n}>{n.toLocaleString()}</option>)}</select></label>
    <div className="row-btns"><button className="btn primary small" disabled={busy} type="submit">{busy?'Saving…':'Save settings'}</button><button type="button" className="btn small ghost" onClick={async()=>{try{await setApiKey('',false);setKey('');setStatus('Key removed.');onReady();}catch{setStatus('Could not remove the key.');}}}>Forget key</button></div>
    {status&&<p role="status" className="small">{status}</p>}
  </form>;
}
export function AiPanel(){
  const deck=useEditor(s=>s.deck)!;const target=useEditor(s=>s.target);useEditor(s=>s.slideId);
  const agents=availableAgents();const [agentId,setAgentId]=useState(()=>readPreference('df-selected-agent','designer'));
  const [prompt,setPrompt]=useState(''),[task,setTask]=useState<'agent'|'element'>(()=>readPreference('df-selected-agent','')?'agent':'element'),[showSettings,setShowSettings]=useState(false),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [proposal,setProposal]=useState<{result:AiResult;source:Deck;next:Deck;slideId:string}|null>(null);
  const [saved,setSaved]=useState(false);
  const controller=useRef<AbortController|null>(null);
  const refresh=()=>{hasApiKey().then(setConnected).catch(()=>setConnected(false));};
  useEffect(()=>{refresh();return()=>controller.current?.abort();},[]);
  const run=async()=>{
    const state=useEditor.getState(),source=state.deck,slide=currentSlide();
    if(!source||!slide||state.target.kind!=='slide')return;
    if(!connected){setShowSettings(true);setError('Add your Anthropic API key to generate.');return;}
    controller.current?.abort();const c=new AbortController();controller.current=c;
    setBusy(true);setError('');setProposal(null);setSaved(false);
    const agent=task==='element'?{id:'element-maker',name:'Element maker',instructions:'Create an original, polished graphic suitable for a slide deck. Use a transparent background. Return exactly one element action.',tools:['element' as const]}:agents.find(a=>a.id===agentId)||BUILTIN_AGENTS[0];
    try{const result=await requestPlan(prompt,agent,source,slide,c.signal);if(c.signal.aborted)return;const next=preparePlan(result.plan,source,slide.id);setProposal({result,source,next,slideId:slide.id});}catch(e){if(!c.signal.aborted)setError((e as Error).message);}finally{if(controller.current===c){setBusy(false);controller.current=null;}}
  };
  const stale=!!proposal&&deck!==proposal.source;
  return <div className="studio-content ai-panel"><div className="ai-connection"><span className={connected?'connected':''}><i/>{connected?'Claudia connected':'Connect Claudia'}</span><button className="icon-btn" aria-label="AI settings" aria-expanded={showSettings} onClick={()=>setShowSettings(!showSettings)}><Settings2 size={17}/></button></div>
    {showSettings&&<AiSettingsForm onReady={refresh}/>}
    <div className="ai-hero"><span className="ai-orb"><Sparkles size={27}/></span><h2>What will you<br/><em>create today?</em></h2><p>Your ideas. A little help from Claudia.</p></div>
    <div className="seg"><button className={task==='element'?'on':''} onClick={()=>setTask('element')}>Create element</button><button className={task==='agent'?'on':''} onClick={()=>setTask('agent')}>Design agent</button></div>
    {task==='agent'&&<label className="agent-select"><span>Run with</span><select value={agentId} onChange={e=>setAgentId(e.target.value)}>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
    <div className="ai-quick-actions">{(task==='element'?['A playful rocket in violet and mint','A simple growth chart icon','A botanical leaf illustration']:['Make this slide clearer and more concise','Suggest a fresh theme for this deck','Draft a five-slide hackathon pitch']).map(p=><button key={p} onClick={()=>setPrompt(p)}><Sparkles size={14}/>{p}</button>)}</div>
    <div className="ai-composer"><textarea aria-label="Describe your idea" placeholder={task==='element'?'Describe your element, colours and style…':'What should your design agent do?'} value={prompt} maxLength={6000} onChange={e=>setPrompt(e.target.value)} rows={5}/><div><small>{prompt.length}/6000</small>{busy?<button className="generate-btn" onClick={()=>{controller.current?.abort();setBusy(false);}} aria-label="Cancel generation"><Square size={16}/></button>:<button className="generate-btn" onClick={run} disabled={!prompt.trim()||target.kind!=='slide'} aria-label="Generate with Claudia"><ArrowUp size={19}/></button>}</div></div>
    {target.kind==='layout'&&<p className="error-text">Finish editing the layout to use AI on a slide.</p>}
    <p className="studio-footnote"><KeyRound size={12}/> Uses your Anthropic credits. One request per click. Slide text and theme settings are sent to Anthropic; changes are previewed first.</p>
    {busy&&<div className="ai-working" role="status"><span/>Claudia is designing…</div>}
    {error&&<div className="ai-error" role="alert">{error}</div>}
    {proposal&&<div className="ai-proposal"><h3>Your proposal</h3><p>{proposal.result.plan.summary}</p>{proposal.result.plan.operations.map((op,i)=><div className="proposal-operation" key={i}><span className="tool-label">{op.tool}</span>{op.tool==='element'?<><img src={svgDataUrl(op.svg)} alt={op.name}/><strong>{op.name}</strong></>:op.tool==='outline'?<pre>{op.outline}</pre>:op.tool==='rewrite'?op.changes.map(c=><p key={c.id}>{c.text}</p>):op.tool==='notes'?<p className="pre-wrap">{op.text}</p>:<div className="palette-row">{Object.values(op.colors).map((c,i)=><i key={i} style={{background:c}}/>)}</div>}</div>)}
      <div className="preview-caption">Slide preview</div><div className="proposal-slide"><SlideView deck={proposal.next} slide={proposal.next.slides.find(s=>s.id===proposal.slideId)!} mode="thumb" scale={240/proposal.next.size.w} index={proposal.next.slides.findIndex(s=>s.id===proposal.slideId)}/></div>
      <p className="small muted">{proposal.result.model} · {proposal.result.inputTokens.toLocaleString()} input / {proposal.result.outputTokens.toLocaleString()} output tokens</p>
      {stale&&<p className="error-text">This deck has changed. Generate a fresh proposal to preserve your edits.</p>}
      <div className="row-btns"><button className="btn primary small" disabled={stale||busy} onClick={()=>{try{applyPreparedPlan(proposal.source,proposal.next);setProposal(null);setToast('AI changes applied. Ctrl+Z undoes the entire proposal.');}catch(e){setError((e as Error).message);}}}><Check size={14}/>Apply changes</button><button className="btn small ghost" onClick={()=>setProposal(null)}>Discard</button></div>
      {proposal.result.plan.operations.some(o=>o.tool==='element')&&<button className="btn full small" disabled={saved} onClick={async()=>{try{for(const op of proposal.result.plan.operations)if(op.tool==='element')await saveGraphic({id:uid(),name:op.name,svg:op.svg,createdAt:Date.now()});setSaved(true);setToast('Saved in Elements → Your generated elements.');}catch(e){setError('Could not save the graphic. Device storage may be full.');}}}><Bookmark size={14}/>{saved?'Saved to your elements':'Save graphics for reuse'}</button>}
    </div>}
  </div>;
}
