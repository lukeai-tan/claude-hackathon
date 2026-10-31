import type { Deck, ThemeColors } from '../model/types';
import { paragraphs, uid, makeImage } from '../model/factory';
import { parseOutline, draftToSlide } from '../editor/OutlinePanel';
import { mutate, useEditor } from '../store/editor';
import { safeSvg, svgDataUrl } from '../studio/svg';
import type { AiPlan } from './schema';
/** A complete proposal is prepared before one atomic, undoable edit. */
export function preparePlan(plan:AiPlan,source:Deck,slideId:string):Deck {
  const deck=structuredClone(source),slide=deck.slides.find(s=>s.id===slideId);
  if(!slide)throw new Error('The target slide no longer exists. Generate a new proposal.');
  let graphicIndex=0;
  for(const op of plan.operations){
    if(op.tool==='theme')deck.theme={id:'ai-'+uid(),name:op.name,colors:op.colors as unknown as ThemeColors,fonts:{heading:op.heading,body:op.body},logoAssetId:deck.theme.logoAssetId};
    if(op.tool==='notes')slide.notes=op.text;
    if(op.tool==='rewrite')for(const change of op.changes){const el=slide.elements.find(e=>e.id===change.id);if(!el||el.type!=='text'||el.locked)throw new Error('A text box changed or was locked. Generate a new proposal.');el.html=paragraphs(change.text);}
    if(op.tool==='outline'){
      const drafts=parseOutline(op.outline);if(!drafts.length||drafts.length>12)throw new Error('The outline must contain 1–12 slides.');
      deck.slides.splice(deck.slides.indexOf(slide)+1,0,...drafts.map(d=>draftToSlide(deck,d)));
    }
    if(op.tool==='element'){
      const clean=safeSvg(op.svg),assetId=uid(),k=Math.min(deck.size.w*.35/clean.w,deck.size.h*.5/clean.h);
      deck.assets[assetId]={id:assetId,name:op.name,w:clean.w,h:clean.h,dataUrl:svgDataUrl(clean.svg)};
      slide.elements.push(makeImage(assetId,(deck.size.w-clean.w*k)/2+graphicIndex*24,(deck.size.h-clean.h*k)/2+graphicIndex*24,clean.w*k,clean.h*k,{fit:'contain',name:op.name,alt:op.name}));graphicIndex++;
    }
  }
  return deck;
}
export function applyPreparedPlan(original:Deck,next:Deck){
  // Object identity catches edits/undo while a network request or preview was open.
  if(useEditor.getState().deck!==original)throw new Error('The deck changed since this proposal. Generate again to preserve your edits.');
  mutate(d=>{d.theme=next.theme;d.slides=next.slides;d.assets=next.assets;});
  useEditor.setState({selection:[],editingId:null});
}
