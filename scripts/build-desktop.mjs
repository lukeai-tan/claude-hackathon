import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),slides=resolve(root,'source-code/OpenSlides');
function run(args,cwd){const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);}
run(['scripts/desktop-build.mjs','--web-only'],slides);
run([resolve(slides,'desktop/node_modules/electron-builder/cli.js'),'--config','source-code/main/desktop/builder.cjs','--win','--x64','--publish','never'],root);
