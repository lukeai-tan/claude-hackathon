'use strict';
const path=require('node:path');
const APPS=new Set(['openpdf','openslides']);
function validateApp(id){if(typeof id!=='string'||!APPS.has(id))throw new Error('Unknown OpenSuite app.');return id;}
function allowedExternal(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&/^\/RishabhShenoy03\/claude-hackathon(?:\/|$)/.test(u.pathname);}catch{return false;}}
function resolveAsset(root,pathname){let decoded;try{decoded=decodeURIComponent(pathname);}catch{return null;}const file=path.resolve(root,'.'+(decoded==='/'?'/index.html':decoded));return file.startsWith(path.resolve(root)+path.sep)?file:null;}
module.exports={validateApp,allowedExternal,resolveAsset};
