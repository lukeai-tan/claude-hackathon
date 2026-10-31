'use strict';
const {app,BrowserWindow,protocol,ipcMain,safeStorage,session}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const {callAnthropic}=require('./anthropic.cjs');
const suiteMode=process.env.OPENSUITE_MODE==='1';
const ROOT=path.join(__dirname,'..','dist');
// Preserve the profile and origin so saved decks and encrypted keys survive the rename.
if(!suiteMode){
  const profilePath=path.join(app.getPath('appData'),'Deckforge');
  require('node:fs').mkdirSync(profilePath,{recursive:true});
  app.setPath('userData',profilePath);
}
app.setName(suiteMode?'OpenSuite':'OpenSlides');
const ORIGIN='deckforge://app';
const pending=new Map();
let apiKey='', mainWindow;
protocol.registerSchemesAsPrivileged([{scheme:'deckforge',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.otf':'font/otf','.ttf':'font/ttf'};
const keyPath=()=>path.join(app.getPath('userData'),'anthropic-key.enc');
const canEncrypt=()=>safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||safeStorage.getSelectedStorageBackend()!=='basic_text');
function trusted(event){if(!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==event.sender.mainFrame)throw new Error('Untrusted request.');const u=new URL(event.senderFrame.url);if(u.protocol!=='deckforge:'||u.host!=='app')throw new Error('Untrusted origin.');}
function guardWindow(win){
  win.webContents.on('will-navigate',(event,url)=>{const u=new URL(url);if(u.protocol!=='deckforge:'||u.host!=='app')event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
}
async function createWindow(){
  if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.show();mainWindow.focus();return mainWindow;}
  mainWindow=new BrowserWindow({width:1500,height:960,minWidth:1024,minHeight:700,title:'OpenSlides',backgroundColor:'#f7f7f2',autoHideMenuBar:true,webPreferences:{additionalArguments:suiteMode?['--opensuite']:[],preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  guardWindow(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(({url})=>{
    const u=new URL(url);
    if(u.protocol==='deckforge:'&&u.host==='app'&&u.pathname==='/'&&/^#\/audience\/[\w-]+$/.test(u.hash))return {action:'allow',overrideBrowserWindowOptions:{width:1280,height:720,autoHideMenuBar:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,preload:undefined}}};
    return {action:'deny'};
  });
  mainWindow.webContents.on('did-create-window',child=>{guardWindow(child);child.webContents.setWindowOpenHandler(()=>({action:'deny'}));});
  mainWindow.on('closed',()=>{for(const controller of pending.values())controller.abort();pending.clear();mainWindow=null;});
  await mainWindow.loadURL(ORIGIN+'/');
  if(!suiteMode&&process.argv.includes('--smoke-test')){
    const timeout=setTimeout(()=>app.exit(1),30000);
    try{
      const result=await mainWindow.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;for(let i=0;i<100;i++){if(document.querySelector('.template-card'))break;await new Promise(r=>setTimeout(r,50));}const hasUI=!!document.querySelector('.template-card');const bridge=window.deckforgeDesktop;const status=await bridge.keyStatus();return {hasUI,bridge:!!bridge,configured:status.configured,title:document.title};})()`);
      console.log('Desktop smoke:',JSON.stringify(result));clearTimeout(timeout);app.exit(result.hasUI&&result.bridge&&result.title==='OpenSlides'?0:1);
    }catch{clearTimeout(timeout);app.exit(1);}
  }
}
app.whenReady().then(async()=>{
  protocol.handle('deckforge',async request=>{
    const url=new URL(request.url);
    if(url.host!=='app'||request.method!=='GET')return new Response('Forbidden',{status:403});
    let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return new Response('Bad path',{status:400});}
    const file=path.resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(ROOT+path.sep))return new Response('Forbidden',{status:403});
    try{return new Response(await fs.readFile(file),{headers:{'content-type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-src 'none'"}});}catch{return new Response('Not found',{status:404});}
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  try{if(canEncrypt())apiKey=safeStorage.decryptString(await fs.readFile(keyPath()));}catch{/* missing/rotated OS credentials: ask for a key */}
  apiKey ||= process.env.ANTHROPIC_API_KEY||'';
  ipcMain.handle('ai:key-status',event=>{trusted(event);return {configured:!!apiKey,encrypted:canEncrypt()};});
  ipcMain.handle('ai:set-key',async(event,key,remember)=>{
    trusted(event);if(typeof key!=='string'||key.length>512||/[\r\n]/.test(key)||typeof remember!=='boolean')throw new Error('Invalid key.');
    if(remember&&key){if(!canEncrypt())throw new Error('OS encryption is unavailable. Uncheck Remember and use this session only.');await fs.writeFile(keyPath(),safeStorage.encryptString(key),{mode:0o600});}
    else await fs.rm(keyPath(),{force:true});apiKey=key;
  });
  ipcMain.handle('ai:request',async(event,id,body,version)=>{
    trusted(event);if(typeof id!=='string'||!/^[\w-]{1,80}$/.test(id))throw new Error('Invalid request ID.');
    if(pending.size)throw new Error('Another request is already running. Cancel it or wait.');
    const controller=new AbortController();pending.set(id,controller);
    const timeout=setTimeout(()=>controller.abort(),180000);
    try{return await callAnthropic(apiKey,body,version,controller.signal);}catch(error){return {ok:false,status:0,data:null,error:controller.signal.aborted?'Request cancelled or timed out.':'Could not complete the Anthropic request. Check your connection and settings.'};}finally{clearTimeout(timeout);pending.delete(id);}
  });
  ipcMain.handle('ai:cancel',(event,id)=>{trusted(event);pending.get(id)?.abort();});
  if(suiteMode){
    await require('../../main/desktop/suite.cjs').startSuite({openSlides:createWindow,getSlidesWindow:()=>mainWindow});
  }else{
    await createWindow();
    app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow();});
  }
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
