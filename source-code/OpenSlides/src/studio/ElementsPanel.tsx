import {useEffect,useState} from 'react';
import {Search,Star,Sparkles,Trash2} from 'lucide-react';
import {useEditor,setToast} from '../store/editor';
import {ELEMENTS,ELEMENT_DRAG_TYPE,graphicSvg,insertLibraryElement,insertGraphic,loadGraphics,removeGraphic,type LibraryElement,type SavedGraphic} from './library';
import {svgDataUrl} from './svg';
import {shapePath} from '../render/shapes';
import {readPreference,usePreference} from './preferences';
export function ElementTile({item,color}:{item:LibraryElement;color:string}){
  return <div className="element-art" aria-hidden="true">{item.graphic?<img src={svgDataUrl(graphicSvg(item.graphic,color))} alt=""/>:item.kind?<svg viewBox="-6 -6 112 112">{item.category==='Lines'?<><path d="M8 50 H88" stroke={color} strokeWidth="7" strokeLinecap="round"/>{item.kind==='arrow'&&<path d="M70 32 L94 50 L70 68Z" fill={color}/>}</>:<path d={shapePath(item.kind,100,100,22)} fill={color}/>}</svg>:<div className={`element-symbol ${item.category.toLowerCase()}`}>{item.category==='Frames'?<div className={item.id==='circle-frame'?'circle':''}><span>▧</span></div>:item.id==='funnel'?<span className="funnel-symbol"><i/><i/><i/></span>:item.id==='progress-bar'?<span className="progress-symbol"/>:item.category==='Charts'?<span className="bars-symbol"><i/><i/><i/></span>:<span className="steps-symbol">●—●—●</span>}</div>}</div>;
}
export function ElementsPanel(){
  const [query,setQuery]=useState(''),[category,setCategory]=useState('All'),[color,setColor]=useState('#6654d9');
  const [favorites,setFavorites]=usePreference<string[]>('df-favorite-elements',[]);
  const [recent,setRecent]=useState<string[]>(()=>readPreference('df-recent-elements',[]));
  const [graphics,setGraphics]=useState<SavedGraphic[]>([]);
  useEffect(()=>{loadGraphics().then(setGraphics).catch(()=>setToast('Could not load your generated graphics.'));},[]);
  const insert=(id:string)=>{insertLibraryElement(id,color);setRecent(readPreference('df-recent-elements',[]));};
  const filtered=ELEMENTS.filter(e=>(category==='All'||category===e.category||category==='Favorites'&&favorites.includes(e.id))&&`${e.name} ${e.tags}`.toLowerCase().includes(query.toLowerCase()));
  const cards=(items:LibraryElement[])=> <div className="element-grid">{items.map(item=><div className="element-card" key={item.id}><button className="element-add" title={`Add ${item.name}`} aria-label={`Add ${item.name}`} draggable onDragStart={e=>{e.dataTransfer.setData(ELEMENT_DRAG_TYPE,JSON.stringify({id:item.id,color}));e.dataTransfer.effectAllowed='copy';}} onClick={()=>insert(item.id)}><ElementTile item={item} color={color}/><span>{item.name}</span></button><button className={`favorite-btn ${favorites.includes(item.id)?'on':''}`} title={favorites.includes(item.id)?'Remove favorite':'Favorite'} aria-label={`${favorites.includes(item.id)?'Unfavorite':'Favorite'} ${item.name}`} onClick={()=>setFavorites(favorites.includes(item.id)?favorites.filter(id=>id!==item.id):[...favorites,item.id])}><Star size={12}/></button></div>)}</div>;
  return <div className="studio-content">
    <label className="studio-search"><Search size={16}/><input placeholder="Search elements" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search elements"/></label>
    <button className="ai-invite" onClick={()=>useEditor.setState({studioTab:'ai'})}><Sparkles size={20}/><span><strong>Create your own element</strong><small>Describe it. Claudia draws it.</small></span><span>→</span></button>
    <div className="studio-chips">{['All','Favorites','Shapes','Lines','Graphics','Diagrams','Frames','Charts'].map(c=><button key={c} className={c===category?'on':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
    <label className="element-color">Graphic colour<input type="color" value={color} onChange={e=>setColor(e.target.value)}/><span>{color.toUpperCase()}</span></label>
    {!query&&category==='All'&&recent.length>0&&<section><h3>Recently used</h3>{cards(recent.slice(0,6).map(id=>ELEMENTS.find(e=>e.id===id)).filter((e):e is LibraryElement=>!!e))}</section>}
    <section><div className="studio-section-head"><h3>{category==='All'?'Browse elements':category}</h3><span>{filtered.length}</span></div>{filtered.length?cards(filtered):<p className="studio-empty">{category==='Favorites'?'Star elements to keep them here.':'No matching elements. Try “arrow”, “frame” or “chart”.'}</p>}</section>
    {!!graphics.length&&<section><h3>Your generated elements</h3><div className="element-grid saved-graphics">{graphics.map(g=><div className="element-card" key={g.id}><button className="element-add" title={`Add ${g.name}`} onClick={()=>{try{insertGraphic(g);}catch(e){setToast((e as Error).message);}}}><img className="element-art" src={svgDataUrl(g.svg)} alt={g.name}/><span>{g.name}</span></button><button className="favorite-btn" aria-label={`Delete ${g.name}`} onClick={()=>{removeGraphic(g.id).then(()=>setGraphics(a=>a.filter(x=>x.id!==g.id))).catch(()=>setToast('Could not remove the saved graphic.'));}}><Trash2 size={12}/></button></div>)}</div></section>}
    <p className="studio-footnote">Click or drag to add. Diagrams can be ungrouped and edited. All graphics are original and work offline.</p>
  </div>;
}
