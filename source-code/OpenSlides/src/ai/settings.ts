export const DEFAULT_MODEL='claude-opus-5-5';
export const API_VERSION='2026-10-21';
export interface AiSettings { model:string;version:string;maxTokens:number; }
export const DEFAULT_SETTINGS:AiSettings={model:DEFAULT_MODEL,version:API_VERSION,maxTokens:8192};
let sessionKey='';
export function getSettings():AiSettings {
  try{const raw=JSON.parse(localStorage.getItem('df-ai-settings')||'{}');return {model:typeof raw.model==='string'?raw.model:DEFAULT_MODEL,version:typeof raw.version==='string'?raw.version:API_VERSION,maxTokens:[2048,4096,8192,16384].includes(raw.maxTokens)?raw.maxTokens:8192};}catch{return {...DEFAULT_SETTINGS};}
}
export function saveSettings(s:AiSettings){localStorage.setItem('df-ai-settings',JSON.stringify(s));}
export async function setApiKey(key:string,remember:boolean){
  if(window.deckforgeDesktop){await window.deckforgeDesktop.setKey(key.trim(),remember);}else sessionKey=key.trim();
}
export async function hasApiKey(){return window.deckforgeDesktop?(await window.deckforgeDesktop.keyStatus()).configured:!!sessionKey;}
export function browserKey(){return sessionKey;}
