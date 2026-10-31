const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('deckforgeDesktop',Object.freeze({
  suiteMode:process.argv.includes('--opensuite'),
  openSuiteHome:()=>ipcRenderer.invoke('suite:home'),
  version:'0.2.0',
  keyStatus:()=>ipcRenderer.invoke('ai:key-status'),
  setKey:(key,remember)=>ipcRenderer.invoke('ai:set-key',key,remember),
  request:(id,body,version)=>ipcRenderer.invoke('ai:request',id,body,version),
  cancel:id=>ipcRenderer.invoke('ai:cancel',id),
}));
