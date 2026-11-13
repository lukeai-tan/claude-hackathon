// Copies the suite version (root package.json) into the OpenSlides manifests.
// Run after bumping the root version: `npm run version:sync`.
import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const write=(p,data)=>writeFileSync(p,JSON.stringify(data,null,2)+'\n');
const {version}=read('package.json');
for(const p of ['source-code/OpenSlides/package.json','source-code/OpenSlides/desktop/package.json']){
 const data=read(p);data.version=version;write(p,data);
}
const lockPath='source-code/OpenSlides/package-lock.json',lock=read(lockPath);
lock.version=version;
if(lock.packages?.[''])lock.packages[''].version=version;
write(lockPath,lock);
console.log('Synced OpenSlides manifests to '+version);
