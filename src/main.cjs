const {app,BrowserWindow,ipcMain,dialog,Menu,clipboard,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
app.setName('MindFlow');
const idx=process.argv.indexOf('--data-dir');
if(idx>=0&&process.argv[idx+1])process.env.MINDFLOW_DATA_DIR=path.resolve(process.argv[idx+1]);
if(!app.requestSingleInstanceLock()){app.quit();}else{
let win,store,allowClose=false;
const entry=path.join(__dirname,'../index.html');
const wrapped=fn=>async(event,...args)=>{
 try{
  if(event.sender!==win.webContents||event.senderFrame.url!==pathToFileURL(entry).href)throw new Error('请求来源无效 / Untrusted IPC sender');
  return {ok:true,value:await fn(...args)};
 }catch(e){return {ok:false,error:e.message};}
};
app.on('second-instance',()=>{if(win){win.restore();win.focus();}});
app.whenReady().then(async()=>{
 const {Store,MAX_BYTES}=await import('./store.mjs');
 const {normalize,validateDocument,cleanSelection,getContext}=await import('./model.mjs');
 store=new Store();
 try{await store.init();}catch(e){dialog.showErrorBox('MindFlow 无法读取白板 / Could not read board',`${e.message}\n请检查数据文件或从 backups 恢复。 / Check the file or restore a copy from backups.\n${store.file}`);app.quit();return;}
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
  const r=await dialog.showOpenDialog(win,{title:'打开 MindFlow JSON / Open MindFlow JSON',properties:['openFile'],filters:[{name:'MindFlow JSON',extensions:['json']}]});
  if(r.canceled)return null;
  const st=await fs.stat(r.filePaths[0]);if(st.size>MAX_BYTES)throw new Error('文件超过 16 MiB / File exceeds 16 MiB');
  const doc=normalize(JSON.parse(await fs.readFile(r.filePaths[0],'utf8')));
  const choice=await dialog.showMessageBox(win,{type:'question',buttons:['取消 / Cancel','打开 / Open'],defaultId:0,cancelId:0,message:'用此文件替换当前白板？ / Replace the current board with this file?',detail:'当前版本会保留在自动备份中。 / The current revision will be backed up.'});
  return choice.response===1?doc:null;
 }));
 ipcMain.handle('file:export',wrapped(async({text,extension})=>{
  if(!['json','md'].includes(extension)||typeof text!=='string'||Buffer.byteLength(text)>MAX_BYTES)throw new Error('无效导出内容 / Invalid export');
  const r=await dialog.showSaveDialog(win,{title:'导出文件 / Export file',defaultPath:`MindFlow.${extension}`,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});
  if(r.canceled)return false;await fs.writeFile(r.filePath,text,'utf8');return true;
 }));
 ipcMain.handle('mcp:info',wrapped(async({readOnly=false}={})=>({directory:store.directory,file:store.file,
  config:{mcpServers:{mindflow:{command:process.execPath,args:[path.join(app.getAppPath(),'src','mcp.mjs'),'--data-dir',store.directory,...(readOnly?['--read-only']:[])],env:{ELECTRON_RUN_AS_NODE:'1'}}}}
 })));
 ipcMain.handle('clipboard:write',wrapped(text=>{if(typeof text!=='string')throw new Error('无效文本 / Invalid text');clipboard.writeText(text);}));
 ipcMain.handle('data:reveal',wrapped(()=>shell.openPath(store.directory)));
 ipcMain.on('window:close-ready',(event)=>{if(event.sender===win.webContents){allowClose=true;win.close();}});
 win.on('close',e=>{if(!allowClose){e.preventDefault();win.webContents.send('window:flush');}});
 const action=name=>win.webContents.send('menu:action',name);
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  ...(process.platform==='darwin'?[{role:'appMenu'}]:[]),
  {label:'文件 / File',submenu:[{label:'打开 JSON… / Open JSON…',accelerator:'CmdOrCtrl+O',click:()=>action('open')},{label:'导出 JSON… / Export JSON…',accelerator:'CmdOrCtrl+Shift+S',click:()=>action('export')},{label:'保存 / Save',accelerator:'CmdOrCtrl+S',click:()=>action('save')},{type:'separator'},{label:'MCP 接入 / MCP setup',click:()=>action('mcp')},{label:'打开数据目录 / Open data folder',click:()=>shell.openPath(store.directory)},{type:'separator'},{role:'quit',label:'退出 / Quit'}]},
  {label:'编辑 / Edit',submenu:[{role:'cut',label:'剪切 / Cut'},{role:'copy',label:'复制 / Copy'},{role:'paste',label:'粘贴 / Paste'},{role:'selectAll',label:'全选文字 / Select all'}]},
  {label:'窗口 / Window',submenu:[{role:'togglefullscreen',label:'全屏 / Full screen'},{role:'minimize',label:'最小化 / Minimize'}]}
 ]));
 await win.loadFile(entry);
});
app.on('window-all-closed',()=>app.quit());
}
