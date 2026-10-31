import {useState} from 'react';
export function readPreference<T>(key:string,fallback:T):T{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value===null?fallback:value;}catch{return fallback;}}
export function usePreference<T>(key:string,fallback:T):[T,(next:T)=>void]{const [value,setValue]=useState<T>(()=>readPreference(key,fallback));return [value,(next:T)=>{localStorage.setItem(key,JSON.stringify(next));setValue(next);}];}
