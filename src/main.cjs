const {app,BrowserWindow,ipcMain,dialog,Menu,clipboard,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
app.setName('MindFlow');
const idx=process.argv.indexOf('--data-dir');
if(idx>=0&&process.argv[idx+1])process.env.MINDFLOW_DATA_DIR=path.resolve(process.argv[idx+1]);
if(!app.requestSingleInstanceLock()){app.quit();}else{
let win,store,allowClose=false;
const entry=path.join(__dirname,'../ui/index.html');
const wrapped=fn=>async(event,...args)=>{
 try{
  if(event.sender!==win.webContents||event.senderFrame.url!==pathToFileURL(entry).href)throw new Error('Untrusted IPC sender');
  return {ok:true,value:await fn(...args)};
 }catch(e){return {ok:false,error:e.message};}
};
app.on('second-instance',()=>{if(win){win.restore();win.focus();}});
app.whenReady().then(async()=>{
 const {Store,MAX_BYTES}=await import('./store.mjs');
 const {normalize,validateDocument,cleanSelection,getContext}=await import('./model.mjs');
 store=new Store();
 try{await store.init();}catch(e){dialog.showErrorBox('MindFlow 无法读取白板',`${e.message}\n原文件未被覆盖。请检查 ${store.file}，或从 backups 恢复。`);app.quit();return;}
 win=new BrowserWindow({width:1440,height:960,minWidth:1060,minHeight:700,title:'MindFlow',backgroundColor:'#f8f8f7',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',e=>e.preventDefault());
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
 ipcMain.handle('board:read',wrapped(()=>store.read()));
 ipcMain.handle('board:save',wrapped(({document,expectedRevision})=>store.update(expectedRevision,current=>{
  const d={...document,boardId:current.boardId,revision:current.revision,updatedAt:current.updatedAt};return validateDocument(cleanSelection(d));
 })));
 ipcMain.handle('board:validate',wrapped(input=>normalize(input)));
 ipcMain.handle('board:context',wrapped(({document,scope})=>getContext(validateDocument(cleanSelection(document)),scope)));
 ipcMain.handle('board:open',wrapped(async()=>{
  const r=await dialog.showOpenDialog(win,{title:'打开 MindFlow JSON',properties:['openFile'],filters:[{name:'MindFlow JSON',extensions:['json']}]});
  if(r.canceled)return null;
  const st=await fs.stat(r.filePaths[0]);if(st.size>MAX_BYTES)throw new Error('文件超过 16 MiB');
  const doc=normalize(JSON.parse(await fs.readFile(r.filePaths[0],'utf8')));
  const choice=await dialog.showMessageBox(win,{type:'question',buttons:['取消','打开'],defaultId:0,cancelId:0,message:'用此文件替换当前白板？',detail:'当前版本会保留在自动备份中。'});
  return choice.response===1?doc:null;
 }));
 ipcMain.handle('file:export',wrapped(async({text,extension})=>{
  if(!['json','md'].includes(extension)||typeof text!=='string'||Buffer.byteLength(text)>MAX_BYTES)throw new Error('无效导出内容');
  const r=await dialog.showSaveDialog(win,{title:'导出文件',defaultPath:`MindFlow.${extension}`,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});
  if(r.canceled)return false;await fs.writeFile(r.filePath,text,'utf8');return true;
 }));
 ipcMain.handle('mcp:info',wrapped(async({readOnly=false}={})=>({directory:store.directory,file:store.file,
  config:{mcpServers:{mindflow:{command:process.execPath,args:[path.join(app.getAppPath(),'src','mcp.mjs'),'--data-dir',store.directory,...(readOnly?['--read-only']:[])],env:{ELECTRON_RUN_AS_NODE:'1'}}}}
 })));
 ipcMain.handle('clipboard:write',wrapped(text=>{if(typeof text!=='string')throw new Error('Invalid text');clipboard.writeText(text);}));
 ipcMain.handle('data:reveal',wrapped(()=>shell.openPath(store.directory)));
 ipcMain.on('window:close-ready',(event)=>{if(event.sender===win.webContents){allowClose=true;win.close();}});
 win.on('close',e=>{if(!allowClose){e.preventDefault();win.webContents.send('window:flush');}});
 const action=name=>win.webContents.send('menu:action',name);
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
  {label:'文件',submenu:[{label:'打开 JSON…',accelerator:'CmdOrCtrl+O',click:()=>action('open')},{label:'导出 JSON…',accelerator:'CmdOrCtrl+Shift+S',click:()=>action('export')},{label:'保存',accelerator:'CmdOrCtrl+S',click:()=>action('save')},{type:'separator'},{label:'MCP 接入',click:()=>action('mcp')},{label:'打开数据目录',click:()=>shell.openPath(store.directory)},{type:'separator'},{role:'quit',label:'退出'}]},
  {label:'编辑',submenu:[{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选文字'}]},
  {label:'窗口',submenu:[{role:'togglefullscreen',label:'全屏'},{role:'minimize',label:'最小化'}]}
 ]));
 await win.loadFile(entry);
});
app.on('window-all-closed',()=>app.quit());
}
