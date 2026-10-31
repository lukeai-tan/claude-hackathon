import {useState} from 'react';
import {Search,Type} from 'lucide-react';
import {FONTS,fontStack} from '../model/theme';
import {makeText,paragraphs,uid} from '../model/factory';
import {addElements,editSelected,insertText} from '../store/actions';
import {mutate,useEditor,setToast} from '../store/editor';
import {stripInline} from '../render/richtext';
export const FONT_PAIRINGS=[
  {name:'The editorial',heading:'DM Serif Display',body:'Instrument Sans',top:'Tell a better',bottom:'story.',bg:'#f2eadd',color:'#4e372b'},
  {name:'Bold ideas',heading:'Space Grotesk',body:'Inter',top:'MAKE IT',bottom:'MATTER.',bg:'#cff06b',color:'#24311e'},
  {name:'Modern studio',heading:'Bricolage Grotesque',body:'Poppins',top:'Good things',bottom:'start here',bg:'#eee7ff',color:'#6345bd'},
  {name:'Natural rhythm',heading:'Fraunces',body:'Lora',top:'Slow down.',bottom:'Grow together.',bg:'#dfe8dc',color:'#355843'},
  {name:'Research notes',heading:'Playfair Display',body:'Source Serif 4',top:'A new',bottom:'perspective',bg:'#e8eef5',color:'#28405b'},
  {name:'Built different',heading:'JetBrains Mono',body:'Inter',top:'HELLO,',bottom:'FUTURE_',bg:'#17202b',color:'#8ce6c1'},
];
export function TextPanel(){
  const deck=useEditor(s=>s.deck)!;const selection=useEditor(s=>s.selection);
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all');
  const insertPair=(p:typeof FONT_PAIRINGS[number])=>{const u=Math.min(deck.size.w,deck.size.h)/1080,g=uid();addElements([makeText(deck.size.w*.17,deck.size.h*.32,deck.size.w*.66,150*u,paragraphs(p.top),{fontFamily:p.heading,fontSize:110*u,bold:true,lineHeight:1.05},{groupId:g,autoHeight:false}),makeText(deck.size.w*.17,deck.size.h*.32+165*u,deck.size.w*.66,100*u,paragraphs(p.bottom),{fontFamily:p.body,fontSize:58*u},{groupId:g,autoHeight:false})]);};
  const choose=(name:string)=>{const s=useEditor.getState(),target=s.target;const els=target.kind==='layout'?deck.layouts.find(l=>l.id===target.layoutId)?.elements:deck.slides.find(sl=>sl.id===s.slideId)?.elements;const has=els?.some(e=>selection.includes(e.id)&&e.type==='text');if(has)editSelected(e=>{if(e.type==='text'){e.style.fontFamily=name;e.html=stripInline(e.html,['font-family']);}},{touches:['style']});else{const u=Math.min(deck.size.w,deck.size.h)/1080;addElements([makeText(deck.size.w*.2,deck.size.h*.4,deck.size.w*.6,120*u,paragraphs('Your words here'),{fontFamily:name,fontSize:70*u})]);}};
  return <div className="studio-content"><button className="btn primary full" onClick={()=>insertText('body')}><Type size={16}/>Add a text box</button><div className="text-presets"><button onClick={()=>insertText('heading')}>Add a heading</button><button onClick={()=>insertText('body')}>Add body text</button></div><h3>Font combinations</h3><div className="pairing-grid">{FONT_PAIRINGS.map(p=><div className="pairing-card" key={p.name}><button style={{background:p.bg,color:p.color}} onClick={()=>insertPair(p)} title={`Add ${p.name} text pairing`}><strong style={{fontFamily:fontStack(p.heading)}}>{p.top}</strong><span style={{fontFamily:fontStack(p.body)}}>{p.bottom}</span></button><div><small>{p.name}</small><button title={`Use ${p.name} as brand fonts`} onClick={()=>{mutate(d=>{d.theme.fonts={heading:p.heading,body:p.body};d.theme.id='custom';});setToast('Brand fonts updated across the deck.');}}>Use fonts</button></div></div>)}</div><div className="studio-section-head"><h3>Explore fonts</h3><span>{FONTS.length} bundled</span></div><label className="studio-search"><Search size={16}/><input aria-label="Search fonts" placeholder="Search fonts" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="studio-chips">{['all','sans','serif','display','mono'].map(c=><button key={c} className={category===c?'on':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="studio-fonts">{FONTS.filter(f=>(category==='all'||f.category===category)&&f.name.toLowerCase().includes(query.toLowerCase())).map(f=><button key={f.name} onClick={()=>choose(f.name)} style={{fontFamily:fontStack(f.name)}}><span>{f.name}</span><small>{f.category}</small></button>)}</div><p className="studio-footnote">Select a text box to change its font, or click a font to add text. Fonts are bundled for offline use.</p></div>;
}
