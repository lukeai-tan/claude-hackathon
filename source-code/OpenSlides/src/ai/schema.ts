export const AI_TOOLS = ['element', 'outline', 'rewrite', 'notes', 'theme'] as const;
export type AiTool = typeof AI_TOOLS[number];
export interface DesignAgent { id:string;name:string;instructions:string;tools:AiTool[]; }
export const BUILTIN_AGENTS:DesignAgent[] = [
  {id:'designer',name:'Visual designer',instructions:'Create a clear visual hierarchy and distinctive, restrained graphics. Preserve the meaning of the slide. Prefer one useful visual over decoration.',tools:['element','theme','rewrite']},
  {id:'pitch-coach',name:'Pitch coach',instructions:'Help a hackathon team tell a concise problem, solution, demo, impact and next-steps story. Do not invent metrics or claim unverified traction. Mark missing evidence as a placeholder.',tools:['outline','rewrite','notes']},
  {id:'copy-editor',name:'Copy editor',instructions:'Make language clear, specific and concise. Preserve factual meaning and proper names. Keep slide text scannable and put detail in speaker notes.',tools:['rewrite','notes']},
];
export type AiOperation =
 | {tool:'element';name:string;svg:string}
 | {tool:'outline';outline:string}
 | {tool:'rewrite';changes:{id:string;text:string}[]}
 | {tool:'notes';text:string}
 | {tool:'theme';name:string;colors:Record<string,string>;heading:string;body:string};
export interface AiPlan { summary:string;operations:AiOperation[]; }
const COLOR_KEYS=['background','surface','text','muted','primary','secondary','accent'];
function str(v:unknown,label:string,max:number):string {if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error(`Invalid ${label} in Claudia's response.`);return v.trim();}
function obj(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Claudia returned an invalid object.');return v as Record<string,unknown>;}
export function parseAiPlan(text:string,allowed:readonly AiTool[],textIds:readonly string[],fonts:readonly string[]):AiPlan {
  if(text.length>250_000)throw new Error('Claudia returned too much content. Try a smaller request.');
  const raw=obj(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')));
  if(!Array.isArray(raw.operations)||raw.operations.length<1||raw.operations.length>6)throw new Error('Expected one to six design actions.');
  const singleton=new Set<string>();
  const operations=raw.operations.map(value=>{
    const o=obj(value),tool=o.tool as AiTool;
    if(!AI_TOOLS.includes(tool)||!allowed.includes(tool))throw new Error(`This agent is not allowed to use the ${String(tool)} tool.`);
    if(tool!=='element'&&singleton.has(tool))throw new Error(`Claudia repeated the ${tool} action.`);
    singleton.add(tool);
    if(tool==='element')return {tool,name:str(o.name,'graphic name',80),svg:str(o.svg,'SVG',150_000)};
    if(tool==='outline')return {tool,outline:str(o.outline,'outline',16000)};
    if(tool==='notes')return {tool,text:str(o.text,'speaker notes',8000)};
    if(tool==='rewrite'){
      if(!Array.isArray(o.changes)||o.changes.length<1||o.changes.length>40)throw new Error('Invalid text changes.');
      const seen=new Set<string>();
      const changes=o.changes.map(c=>{const x=obj(c),id=str(x.id,'text ID',80);if(!textIds.includes(id)||seen.has(id))throw new Error('The response references an unknown or repeated text box.');seen.add(id);return {id,text:str(x.text,'rewritten text',6000)};});
      return {tool,changes};
    }
    const colors=obj(o.colors),heading=str(o.heading,'heading font',80),body=str(o.body,'body font',80);
    if(!fonts.includes(heading)||!fonts.includes(body))throw new Error('Claudia chose a font that is not installed in OpenSlides.');
    const checked:Record<string,string>={};for(const k of COLOR_KEYS){const v=colors[k];if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw new Error('Invalid theme colour.');checked[k]=v;}
    return {tool:'theme' as const,name:str(o.name,'theme name',80),colors:checked,heading,body};
  });
  return {summary:str(raw.summary,'summary',1200),operations};
}
export function validateAgent(value:unknown):DesignAgent {
  const a=obj(value);
  if(!Array.isArray(a.tools)||!a.tools.length||a.tools.some(x=>!AI_TOOLS.includes(x as AiTool)))throw new Error('Choose at least one supported design tool.');
  return {id:str(a.id,'agent ID',100),name:str(a.name,'agent name',60),instructions:str(a.instructions,'instructions',4000),tools:[...new Set(a.tools)] as AiTool[]};
}
