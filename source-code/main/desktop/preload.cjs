'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('openSuite',Object.freeze({launch:id=>ipcRenderer.invoke('suite:launch',id),openExternal:url=>ipcRenderer.invoke('suite:external',url)}));
