import {useState} from 'react';
import {Search,Check,Bookmark,Trash2} from 'lucide-react';
import {THEME_PRESETS,FONTS} from '../model/theme';
import type {Theme} from '../model/types';
import {useEditor,currentSlide,setToast} from '../store/editor';
import {applyThemePreset} from '../store/actions';
import {SlideView} from '../render/SlideView';
import {DesignPanel} from '../editor/DesignPanel';
import {usePreference} from './preferences';
import {uid} from '../model/factory';
function validTheme(t:Theme){return t&&typeof t.name==='string'&&t.colors&&Object.values(t.colors).length===7&&Object.values(t.colors).every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c))&&FONTS.some(f=>f.name===t.fonts?.heading)&&FONTS.some(f=>f.name===t.fonts?.body);}
export function ThemesPanel(){
  const deck=useEditor(s=>s.deck)!;useEditor(s=>s.slideId);const slide=currentSlide();
  const [query,setQuery]=useState(''),[preview,setPreview]=useState<Theme|null>(null),[custom,setCustom]=usePreference<Theme[]>('df-saved-themes',[]);
  const saved=Array.isArray(custom)?custom.filter(validTheme):[];
  const themes=[...saved,...THEME_PRESETS].filter(t=>t.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="studio-content"><p className="studio-lead">A whole new mood. One click.</p><label className="studio-search"><Search size={16}/><input placeholder="Search themes" aria-label="Search themes" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {preview&&slide&&<div className="theme-preview"><div className="preview-caption">Preview on this slide</div><SlideView deck={{...deck,theme:preview}} slide={slide} mode="thumb" scale={268/deck.size.w} index={deck.slides.indexOf(slide)}/><div className="row-btns"><button className="btn primary small" onClick={()=>{applyThemePreset(preview);setToast(`${preview.name} applied to theme-linked colours and fonts.`);setPreview(null);}}><Check size={14}/>Apply to deck</button><button className="btn small ghost" onClick={()=>setPreview(null)}>Cancel</button></div></div>}
    <div className="studio-themes">{themes.map(t=><div key={t.id} className="studio-theme-wrap"><button className={`studio-theme ${deck.theme.id===t.id?'on':''}`} onClick={()=>setPreview(t)} style={{background:t.colors.background,color:t.colors.text}}><strong style={{fontFamily:`"${t.fonts.heading}",serif`}}>Make<br/>a mark.</strong><div className="palette-row">{[t.colors.primary,t.colors.secondary,t.colors.accent,t.colors.surface].map((c,i)=><i key={i} style={{background:c}}/>)}</div><span>{t.name}</span></button>{saved.some(x=>x.id===t.id)&&<button className="favorite-btn" aria-label={`Delete theme ${t.name}`} onClick={()=>setCustom(saved.filter(x=>x.id!==t.id))}><Trash2 size={12}/></button>}</div>)}</div>
    <button className="btn full" onClick={()=>{const name=prompt('Name this theme',deck.theme.name);if(!name?.trim())return;const theme=structuredClone(deck.theme);delete theme.logoAssetId;setCustom([{...theme,id:'saved-'+uid(),name:name.trim().slice(0,80)},...saved].slice(0,30));setToast('Theme saved on this device.');}}><Bookmark size={15}/>Save current theme</button>
    <details className="brand-details"><summary>Customise brand colours, fonts & logo</summary><DesignPanel hideThemes/></details><p className="studio-footnote">Themes update colours and fonts linked to the brand. Literal colours in imported slides keep their original appearance.</p>
  </div>;
}
