const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {validateApp,allowedExternal,resolveAsset}=require('../source-code/main/desktop/rules.cjs');
test('only bundled app identifiers can launch',()=>{
 for(const id of ['openpdf','openslides'])assert.equal(validateApp(id),id);
 for(const id of ['cmd.exe','../OpenPDF',null,{},'openslides --inspect'])assert.throws(()=>validateApp(id));
});
test('external links are restricted to the suite repository',()=>{
 assert.equal(allowedExternal('https://github.com/RishabhShenoy03/claude-hackathon/releases/latest/download/OpenPDF.exe'),true);
 for(const url of ['file:///C:/Windows/cmd.exe','https://github.com.evil.test/RishabhShenoy03/claude-hackathon','https://github.com/RishabhShenoy03/claude-hackathon-evil','https://user@github.com/RishabhShenoy03/claude-hackathon','https://github.com/other/repo'])assert.equal(allowedExternal(url),false);
});
test('protocol serves local assets without path traversal',()=>{
 const root=path.resolve('fixture');
 assert.equal(resolveAsset(root,'/'),path.join(root,'index.html'));
 assert.equal(resolveAsset(root,'/app.js'),path.join(root,'app.js'));
 for(const p of ['/../secret','/%2e%2e/secret','/%ZZ'])assert.equal(resolveAsset(root,p),null);
});
test('suite and standalone register their protocols exactly once before ready',()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 for(const suite of [false,true]){
  const registrations=[],names=[],profile=[];
  const electron={app:{getPath:()=>'/fixture',setPath:(...args)=>profile.push(args),setName:n=>names.push(n),whenReady:()=>({then(){}}),on(){}},protocol:{registerSchemesAsPrivileged:s=>registrations.push(s)}};
  const context=vm.createContext({process:{env:{},platform:'win32'},Map,URL});
  const cache=new Map();
  function load(filename){
   filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename).exports;
   const module={exports:{}};cache.set(filename,module);
   const localRequire=id=>id==='electron'?electron:id==='node:fs'?{mkdirSync(){}}:id.startsWith('node:')?require(id):load(path.resolve(path.dirname(filename),id));
   const wrapper=vm.runInContext('(function(require,module,exports,__dirname){'+fs.readFileSync(filename,'utf8')+'\n})',context);
   wrapper(localRequire,module,module.exports,path.dirname(filename));return module.exports;
  }
  load(path.join(__dirname,suite?'../source-code/main/desktop/main.cjs':'../source-code/OpenSlides/desktop/main.cjs'));
  assert.equal(registrations.length,1);
  assert.deepEqual(Array.from(registrations[0],s=>s.scheme),suite?['deckforge','opensuite']:['deckforge']);
  assert.deepEqual(names,[suite?'OpenSuite':'OpenSlides']);
  assert.equal(profile.length,suite?0:1);
 }
});
