'use strict';
const {app,BrowserWindow,protocol,ipcMain,shell}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {validateApp,allowedExternal,resolveAsset}=require('./rules.cjs');
const ROOT=path.join(__dirname,'..','web');
let homeWindow,pdfProcess;
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png'};
function homeOnly(event){if(!homeWindow||event.sender!==homeWindow.webContents||event.senderFrame!==event.sender.mainFrame||!event.senderFrame.url.startsWith('opensuite://home/'))throw new Error('Untrusted suite request.');}
async function openHome(){
 if(homeWindow&&!homeWindow.isDestroyed()){homeWindow.show();homeWindow.focus();return homeWindow;}
 homeWindow=new BrowserWindow({width:1440,height:1020,minWidth:900,minHeight:700,title:'OpenSuite',autoHideMenuBar:true,backgroundColor:'#ffffff',webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
 homeWindow.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('opensuite://home/'))event.preventDefault();});
 homeWindow.webContents.on('will-attach-webview',e=>e.preventDefault());
 homeWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 homeWindow.on('closed',()=>{homeWindow=null;});
 await homeWindow.loadURL('opensuite://home/');return homeWindow;
}
async function launchPdf(selfTest=false){
 if(pdfProcess&&!pdfProcess.killed&&pdfProcess.exitCode===null&&!selfTest)return {message:'OpenPDF is already open. Switch to its window.'};
 const executable=app.isPackaged?path.join(process.resourcesPath,'OpenPDF','OpenPDF.exe'):path.resolve(__dirname,'../../OpenPDF/dist/OpenPDF.exe');
 try{await fs.access(executable);}catch{throw new Error('OpenPDF is missing from this installation. Reinstall the complete OpenSuite package.');}
 const cwd=selfTest?await fs.mkdtemp(path.join(app.getPath('temp'),'opensuite-check-')):app.getPath('documents');
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,selfTest?['--self-test']:[],{cwd,stdio:'ignore',windowsHide:false,shell:false});pdfProcess=child;
  child.once('error',()=>reject(new Error('OpenPDF could not start. Reinstall OpenSuite.')));
  if(!selfTest)child.once('spawn',()=>resolve({message:'OpenPDF opened in its own window.'}));
  child.once('exit',async(code)=>{if(selfTest){try{await fs.copyFile(path.join(cwd,'smoke-output.log'),path.join(process.cwd(),'opensuite-pdf-check.log'));}catch{}}if(pdfProcess===child)pdfProcess=null;if(selfTest){if(code===0)resolve({message:'Bundled OpenPDF passed its checks.'});else reject(new Error('Bundled OpenPDF check failed: '+code));}});
 });
}
async function startSuite({openSlides,getSlidesWindow}){
 protocol.handle('opensuite',async request=>{
  const url=new URL(request.url);if(url.host!=='home'||request.method!=='GET')return new Response('Forbidden',{status:403});
  const file=resolveAsset(ROOT,url.pathname);if(!file)return new Response('Forbidden',{status:403});
  try{return new Response(await fs.readFile(file),{headers:{'content-type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"}});}catch{return new Response('Not found',{status:404});}
 });
 ipcMain.handle('suite:launch',async(event,id)=>{homeOnly(event);validateApp(id);if(id==='openpdf')return launchPdf();await openSlides();return {message:'OpenSlides opened. Your workspace is ready.'};});
 ipcMain.handle('suite:external',async(event,url)=>{homeOnly(event);if(!allowedExternal(url))throw new Error('Unsupported link.');await shell.openExternal(url);});
 ipcMain.handle('suite:home',async event=>{const slides=getSlidesWindow();if(!slides||event.sender!==slides.webContents||event.senderFrame!==event.sender.mainFrame)throw new Error('Untrusted request.');await openHome();});
 await openHome();
 app.on('activate',()=>{void openHome();});
 if(process.argv.includes('--smoke-test')){
  const timer=setTimeout(()=>app.exit(1),180000);
  try{
   const home=await homeWindow.webContents.executeJavaScript(`({title:document.title,apps:document.querySelectorAll('[data-app]').length,bridge:!!window.openSuite})`);
   if(home.title!=='OpenSuite'||home.apps!==2||!home.bridge)throw new Error('Suite home failed to load.');
   await fs.writeFile(path.join(process.cwd(),'opensuite-home.png'),(await homeWindow.webContents.capturePage()).toPNG());
   await homeWindow.webContents.executeJavaScript("window.openSuite.launch('openslides')");
   const slideWindow=getSlidesWindow();
   const slide=await slideWindow.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;for(let i=0;i<100;i++){if(document.querySelector('.template-card'))break;await new Promise(r=>setTimeout(r,50));}return {title:document.title,ready:!!document.querySelector('.template-card'),suite:window.deckforgeDesktop.suiteMode};})()`);
   if(!slide.ready||!slide.suite||slide.title!=='OpenSlides')throw new Error('Bundled OpenSlides failed to load.');
   await slideWindow.webContents.executeJavaScript('window.deckforgeDesktop.openSuiteHome()');
   await launchPdf(true);
   await fs.writeFile(path.join(process.cwd(),'opensuite-smoke.json'),JSON.stringify({home,slide,pdf:true},null,2));
   clearTimeout(timer);app.exit(0);
  }catch(error){await fs.writeFile(path.join(process.cwd(),'opensuite-smoke.json'),JSON.stringify({error:String(error)}));clearTimeout(timer);app.exit(1);}
 }
}
module.exports={startSuite};
