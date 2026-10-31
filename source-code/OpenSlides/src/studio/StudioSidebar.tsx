import {Bot,ImagePlus,LayoutTemplate,Palette,Shapes,Sparkles,Type,ChevronLeft} from 'lucide-react';
import {useEditor,type StudioTab} from '../store/editor';
import {ElementsPanel} from './ElementsPanel';
import {TextPanel} from './TextPanel';
import {ThemesPanel} from './ThemesPanel';
import {TemplatesPanel} from './TemplatesPanel';
import {UploadsPanel} from './UploadsPanel';
import {AiPanel} from './AiPanel';
import {AgentsPanel} from './AgentsPanel';
const tabs=[{id:'templates',label:'Templates',icon:LayoutTemplate},{id:'elements',label:'Elements',icon:Shapes},{id:'text',label:'Text',icon:Type},{id:'themes',label:'Themes',icon:Palette},{id:'uploads',label:'Uploads',icon:ImagePlus},{id:'ai',label:'Ask Claudia',icon:Sparkles},{id:'agents',label:'Agents',icon:Bot}] as const;
export function StudioSidebar(){const active=useEditor(s=>s.studioTab);const title=tabs.find(t=>t.id===active)?.label;return <aside className="studio-sidebar"><nav className="studio-rail" aria-label="Creation tools">{tabs.map(t=><button key={t.id} aria-pressed={active===t.id} className={`${active===t.id?'active':''} ${t.id==='ai'?'ai-nav':''}`} onClick={()=>useEditor.setState({studioTab:active===t.id?null:t.id as StudioTab})}><span><t.icon size={23}/></span>{t.label}</button>)}</nav>{active&&<div className="studio-panel"><div className="studio-panel-heading"><h2>{title}</h2><button className="icon-btn" aria-label="Close creation panel" onClick={()=>useEditor.setState({studioTab:null})}><ChevronLeft size={18}/></button></div><div className="studio-panel-scroll" key={active}>{active==='templates'?<TemplatesPanel/>:active==='elements'?<ElementsPanel/>:active==='text'?<TextPanel/>:active==='themes'?<ThemesPanel/>:active==='uploads'?<UploadsPanel/>:active==='ai'?<AiPanel/>:<AgentsPanel/>}</div></div>}</aside>;}
