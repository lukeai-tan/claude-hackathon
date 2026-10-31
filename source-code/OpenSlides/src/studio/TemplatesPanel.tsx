import {useMemo,useState} from 'react';
import {Search,Plus} from 'lucide-react';
import {TEMPLATES,createFromTemplate} from '../model/templates';
import {SlideView} from '../render/SlideView';
import {currentSlide,mutate,setToast,useEditor} from '../store/editor';
import {getLayout,resolveElement} from '../model/resolve';
import {uid} from '../model/factory';
import {resizeDeck} from '../model/resize';
import {goToSlide} from '../store/actions';
export function TemplatesPanel(){
  const deck=useEditor(s=>s.deck)!;const [query,setQuery]=useState('');
  const samples=useMemo(()=>TEMPLATES.filter(t=>t.id!=='blank').map(info=>({info,deck:createFromTemplate(info.id)})),[]);
  const add=(id:string)=>{
    const source=resizeDeck(createFromTemplate(id),deck.size,false);const sample=source.slides[0];const layout=getLayout(source,sample.layoutId);
    const slide={...sample,id:uid(),layoutId:'blank',background:sample.background??layout.background,elements:[...layout.elements.filter(e=>!e.placeholder),...sample.elements.map(e=>resolveElement(e,layout))].map(e=>({...structuredClone(e),id:uid(),ph:undefined,placeholder:undefined,prompt:undefined}))};
    // Every template uses theme references, so the inserted cover adopts this deck's brand.
    mutate(d=>{if(!d.layouts.some(l=>l.id==='blank'))d.layouts.push({id:'blank',name:'Blank',elements:[],background:{kind:'solid',color:'theme:background'}});Object.assign(d.assets,source.assets);const idx=d.slides.findIndex(s=>s.id===currentSlide()?.id);d.slides.splice(idx+1,0,slide);});goToSlide(slide.id);setToast('Template cover added using your current theme.');
  };
  return <div className="studio-content"><label className="studio-search"><Search size={16}/><input placeholder="Search templates" aria-label="Search templates" value={query} onChange={e=>setQuery(e.target.value)}/></label><p className="studio-lead">Start with a story worth telling.</p><div className="studio-template-grid">{samples.filter(({info})=>`${info.name} ${info.description}`.toLowerCase().includes(query.toLowerCase())).map(({info,deck:d})=><button key={info.id} className="studio-template" onClick={()=>add(info.id)}><div><SlideView deck={d} slide={d.slides[0]} mode="thumb" scale={268/d.size.w} index={0}/></div><span><strong>{info.name}</strong><Plus size={15}/></span><small>{info.description}</small></button>)}</div><p className="studio-footnote">Click to insert a cover after this slide. Start a full template deck from the home screen.</p></div>;
}
