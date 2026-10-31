import { makeChart, makeImage, makeShape, makeTable, makeText, paragraphs, uid } from '../model/factory';
import type { Asset, Deck, ShapeKind, SlideElement } from '../model/types';
import { draftElements, mutate, setToast, useEditor } from '../store/editor';
import { safeSvg, svgDataUrl } from './svg';
import { get, set } from 'idb-keyval';

export type ElementCategory = 'Shapes' | 'Lines' | 'Graphics' | 'Diagrams' | 'Frames' | 'Charts';
export interface LibraryElement { id: string; name: string; category: ElementCategory; tags: string; kind?: ShapeKind; graphic?: string; }
const shapes: [ShapeKind, string][] = [['rect','Square'],['roundRect','Rounded square'],['ellipse','Circle'],['triangle','Triangle'],['diamond','Diamond'],['hexagon','Hexagon'],['star','Star'],['chevron','Chevron']];
const graphics: [string,string,string][] = [
  ['sparkle','Sparkle','M50 4 Q53 45 96 50 Q53 55 50 96 Q46 54 4 50 Q46 46 50 4Z'],
  ['heart','Heart','M50 88 C-22 40 18 -8 50 25 C82 -8 122 40 50 88Z'],
  ['bolt','Lightning bolt','M57 3 L18 57 H44 L37 97 L82 39 H56Z'],
  ['leaf','Leaf','M15 84 C-5 30 34 8 91 8 C94 65 67 99 20 85 L68 32Z'],
  ['check','Check mark','M12 49 L36 72 L89 19 L98 30 L37 91 L2 59Z'],
  ['shield','Shield','M50 4 L87 19 V48 Q88 77 50 96 Q12 77 13 48 V19Z'],
  ['cloud','Cloud','M23 79 C-7 79 -5 43 22 39 C19 3 77 3 80 39 C108 40 111 79 80 79Z'],
  ['speech','Speech bubble','M10 8 H90 Q98 8 98 18 V63 Q98 73 88 73 H44 L18 94 V73 H10 Q2 73 2 63 V18 Q2 8 10 8Z'],
  ['bookmark','Bookmark','M22 5 H78 V96 L50 77 L22 96Z'],
  ['pin','Location pin','M50 97 Q15 54 15 36 A35 35 0 1 1 85 36 Q85 54 50 97Z M50 21 A15 15 0 1 0 50 51 A15 15 0 1 0 50 21Z'],
  ['moon','Crescent moon','M72 7 A46 46 0 1 0 92 77 A47 47 0 0 1 72 7Z'],
  ['flower','Flower','M50 24 C75 -18 110 24 76 50 C114 78 72 114 50 76 C25 114 -14 73 24 50 C-13 23 25 -16 50 24Z'],
  ['plus','Plus','M36 5 H64 V36 H95 V64 H64 V95 H36 V64 H5 V36 H36Z'],
  ['arrow-bold','Bold arrow','M4 34 H57 V9 L96 50 L57 91 V66 H4Z'],
  ['flag','Flag','M10 4 H18 V96 H10Z M22 5 Q43 -2 62 11 Q77 21 94 9 V58 Q78 70 59 56 Q41 43 22 53Z'],
  ['ticket','Ticket','M4 17 H96 V36 A14 14 0 0 0 96 64 V83 H4 V64 A14 14 0 0 0 4 36Z'],
];
export const ELEMENTS: LibraryElement[] = [
  ...shapes.map(([kind,name])=>({id:kind,name,category:'Shapes' as const,tags:'basic geometric editable',kind})),
  {id:'line',name:'Straight line',category:'Lines',tags:'divider stroke',kind:'line'},
  {id:'arrow',name:'Arrow',category:'Lines',tags:'direction pointer',kind:'arrow'},
  ...graphics.map(([id,name,graphic])=>({id,name,category:'Graphics' as const,tags:'icon symbol sticker vector',graphic})),
  ...['Funnel','Progress bar','Timeline','Three steps','Bar infographic'].map(name=>({id:name.toLowerCase().replaceAll(' ','-'),name,category:'Diagrams' as const,tags:'business process data flow infographic editable'})),
  ...['Rectangle frame','Circle frame','Rounded frame'].map(name=>({id:name.toLowerCase().replaceAll(' ','-'),name,category:'Frames' as const,tags:'image photo upload placeholder'})),
  ...['Column chart','Line chart','Doughnut chart','Table'].map(name=>({id:name.toLowerCase().replaceAll(' ','-'),name,category:'Charts' as const,tags:'data graph editable spreadsheet'})),
];
export function graphicSvg(path: string, color: string) { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${/^#[0-9a-f]{6}$/i.test(color)?color:'#6654d9'}" fill-rule="evenodd" d="${path}"/></svg>`; }
export function buildLibraryElement(item: LibraryElement, deck: Deck, color: string, at?: {x:number;y:number}): {elements:SlideElement[];assets:Asset[]} {
  const u = Math.min(deck.size.w,deck.size.h)/1080, size = 360*u;
  const cx = at?.x ?? deck.size.w/2, cy = at?.y ?? deck.size.h/2;
  const x = cx-size/2, y = cy-size/2;
  const els: SlideElement[] = [], assets: Asset[] = [];
  const sh = (kind: ShapeKind, dx:number,dy:number,w:number,h:number,fill=color) => makeShape(kind,x+dx*u,y+dy*u,w*u,h*u,{fill,stroke:kind==='line'||kind==='arrow'?color:'transparent',strokeWidth:kind==='line'||kind==='arrow'?6*u:0,radius:20*u});
  const txt=(text:string,dx:number,dy:number,w:number)=>makeText(x+dx*u,y+dy*u,w*u,55*u,paragraphs(text),{fontSize:30*u,align:'center'},{padding:0,autoHeight:false});
  if(item.kind) els.push(sh(item.kind,0,item.category==='Lines'?170:0,360,item.category==='Lines'?20:360));
  else if(item.graphic){const a={id:uid(),name:item.name,w:100,h:100,dataUrl:svgDataUrl(graphicSvg(item.graphic,color))};assets.push(a);els.push(makeImage(a.id,x,y,size,size,{fit:'contain',name:item.name,alt:item.name}));}
  else if(item.id==='funnel') for(let i=0;i<4;i++) els.push(sh('rect',i*38,i*80,360-i*76,70,['theme:primary','theme:secondary','theme:accent','theme:muted'][i]));
  else if(item.id==='progress-bar'){els.push(sh('roundRect',0,140,360,70,'theme:surface'),sh('roundRect',0,140,245,70));}
  else if(item.id==='timeline'||item.id==='three-steps'){els.push(sh('line',0,140,360,10));for(let i=0;i<3;i++){els.push(sh('ellipse',i*145,115,70,70),txt(String(i+1),i*145,127,70),txt(['Discover','Build','Launch'][i],i*130-10,205,120));}}
  else if(item.id==='bar-infographic'){[100,170,260,330].forEach((h,i)=>els.push(sh('roundRect',i*90,360-h,65,h,['theme:primary','theme:secondary','theme:accent','theme:primary'][i])));}
  else if(item.category==='Frames') els.push(makeImage('',x,y,size,size,{radius:item.id==='circle-frame'?size/2:item.id==='rounded-frame'?35*u:0,name:item.name}));
  else if(item.id==='table') els.push(makeTable([['Milestone','Owner'],['Discover','Team'],['Build','Team']],cx-320*u,cy-180*u,640*u,360*u));
  else if(item.category==='Charts') els.push(makeChart(item.id==='line-chart'?'line':item.id==='doughnut-chart'?'doughnut':'column',cx-360*u,cy-230*u,720*u,460*u));
  if(els.length>1){const groupId=uid();els.forEach(e=>{e.groupId=groupId;});}
  els.forEach(e=>e.name ||= item.name);
  return {elements:els,assets};
}
export function insertLibraryElement(id:string,color:string,at?:{x:number;y:number}) {
  const deck=useEditor.getState().deck, item=ELEMENTS.find(e=>e.id===id);if(!deck||!item)return;
  const built=buildLibraryElement(item,deck,color,at);
  mutate(d=>{built.assets.forEach(a=>d.assets[a.id]=a);draftElements(d).push(...built.elements);});
  useEditor.setState({selection:built.elements.map(e=>e.id),editingId:null,panel:'selection'});
  try {const recent=JSON.parse(localStorage.getItem('df-recent-elements')||'[]');localStorage.setItem('df-recent-elements',JSON.stringify([id,...(Array.isArray(recent)?recent:[]).filter(x=>x!==id)].slice(0,12)));}catch{/* history is optional */}
}
export interface SavedGraphic { id:string;name:string;svg:string;createdAt:number; }
export async function loadGraphics():Promise<SavedGraphic[]> {const data=await get('df-generated-elements');return Array.isArray(data)?data:[];}
export async function saveGraphic(graphic:SavedGraphic) {const all=await loadGraphics();await set('df-generated-elements',[graphic,...all.filter(x=>x.id!==graphic.id)].slice(0,100));}
export async function removeGraphic(id:string){await set('df-generated-elements',(await loadGraphics()).filter(g=>g.id!==id));}
export function insertGraphic(graphic:SavedGraphic, at?:{x:number;y:number}){
  const deck=useEditor.getState().deck;if(!deck)return;
  const clean=safeSvg(graphic.svg), k=Math.min(deck.size.w*.4/clean.w,deck.size.h*.5/clean.h);
  const asset:Asset={id:uid(),name:graphic.name,dataUrl:svgDataUrl(clean.svg),w:clean.w,h:clean.h};
  const e=makeImage(asset.id,(at?.x??deck.size.w/2)-clean.w*k/2,(at?.y??deck.size.h/2)-clean.h*k/2,clean.w*k,clean.h*k,{fit:'contain',name:graphic.name,alt:graphic.name});
  mutate(d=>{d.assets[asset.id]=asset;draftElements(d).push(e);});useEditor.setState({selection:[e.id],editingId:null,panel:'selection'});setToast('Graphic added. You can resize, rotate and export it.');
}
export const ELEMENT_DRAG_TYPE='application/x-deckforge-element';
