const {contextBridge,ipcRenderer}=require('electron');
const call=async(channel,...args)=>{const r=await ipcRenderer.invoke(channel,...args);if(!r.ok)throw new Error(r.error);return r.value;};
contextBridge.exposeInMainWorld('desktop',{
 read:()=>call('board:read'),save:payload=>call('board:save',payload),validate:input=>call('board:validate',input),context:payload=>call('board:context',payload),
 open:()=>call('board:open'),export:payload=>call('file:export',payload),info:options=>call('mcp:info',options),copy:text=>call('clipboard:write',text),reveal:()=>call('data:reveal'),
 onMenu:fn=>ipcRenderer.on('menu:action',(_e,action)=>fn(action)),onClose:fn=>ipcRenderer.on('window:flush',()=>fn()),closeReady:()=>ipcRenderer.send('window:close-ready')
});
