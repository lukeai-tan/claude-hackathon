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
