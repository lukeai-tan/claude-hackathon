import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const run=(args)=>{const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,DECKFORGE_DESKTOP:'1',BASE_PATH:'./'}});if(r.status!==0)process.exit(r.status||1);};
run(['node_modules/typescript/bin/tsc','-p','tsconfig.json']);
run(['node_modules/vite/bin/vite.js','build']);
if(!process.argv.includes('--web-only'))run([resolve('desktop/node_modules/electron-builder/cli.js'),'--config','desktop/builder.cjs','--win','--x64','--publish','never']);
