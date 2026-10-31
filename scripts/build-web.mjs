import {spawnSync} from 'node:child_process';
import {cp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),slides=resolve(root,'source-code/OpenSlides');
for(const args of [['node_modules/typescript/bin/tsc','-p','tsconfig.json'],['node_modules/vite/bin/vite.js','build']]){
 const result=spawnSync(process.execPath,args,{cwd:slides,stdio:'inherit',env:{...process.env,BASE_PATH:'./',DECKFORGE_DESKTOP:'0'}});
 if(result.status!==0)process.exit(result.status||1);
}
await rm(resolve(root,'site'),{recursive:true,force:true});
await mkdir(resolve(root,'site'),{recursive:true});
await cp(resolve(root,'source-code/main/web'),resolve(root,'site'),{recursive:true});
await cp(resolve(slides,'dist'),resolve(root,'site/OpenSlides'),{recursive:true});
console.log('Built suite homepage and OpenSlides in site/.');
