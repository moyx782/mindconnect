import {normalize,validateDocument,cleanSelection,getContext,getSkillGuide} from '../src/model.mjs';
import seed from '../examples/mindflow-board.json' with {type:'json'};
const { title, tokens, edges, clusters, drawings } = seed;
window.mindflowExample = { title, tokens, edges, clusters, drawings };
if(!window.desktop){
 const key='mindconnect-document-v1';
 const catalogKey='mindconnect-boards-v1';
 const activeKey='mindconnect-active-board-v1';
 const lock=fn=>navigator.locks?navigator.locks.request(key,fn):Promise.resolve().then(fn);
 const boardSlotKey=id=>`mindconnect-board-doc-${id}`;
 const boardBackupsKey=id=>`mindconnect-board-backups-${id}`;

 function readCatalog(){
  try{
   const raw=localStorage.getItem(catalogKey);
   if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed)&&parsed.length>0)return parsed;}
  }catch{}
  return [];
 }
 function writeCatalog(list){
  localStorage.setItem(catalogKey,JSON.stringify(list));
 }
 function syncActiveToCatalog(doc){
  try{
   const list=readCatalog();
   const meta={boardId:doc.boardId,title:doc.title,revision:doc.revision,updatedAt:doc.updatedAt,tokenCount:doc.tokens.length};
   const idx=list.findIndex(b=>b.boardId===doc.boardId);
   if(idx>=0)list[idx]=meta;else list.unshift(meta);
   writeCatalog(list);
   localStorage.setItem(activeKey,doc.boardId);
   localStorage.setItem(boardSlotKey(doc.boardId),JSON.stringify(doc));
  }catch{}
 }
 function pushBackupSnapshot(oldDoc){
  try{
   localStorage.setItem(key+'-backup',JSON.stringify(oldDoc));
   const bKey=boardBackupsKey(oldDoc.boardId);
   const raw=localStorage.getItem(bKey);
   const list=raw?JSON.parse(raw):[];
   const filtered=list.filter(item=>item.revision!==oldDoc.revision);
   filtered.unshift(oldDoc);
   localStorage.setItem(bKey,JSON.stringify(filtered.slice(0,12)));
  }catch{}
 }
 function read(){
  const raw=localStorage.getItem(key);
  if(raw){
   const doc=validateDocument(JSON.parse(raw));
   syncActiveToCatalog(doc);
   return doc;
  }
  const legacy=localStorage.getItem('mindflow_brainstorm_v1');
  const d=normalize(legacy?JSON.parse(legacy):window.mindflowExample);
  localStorage.setItem(key,JSON.stringify(d));
  syncActiveToCatalog(d);
  return d;
 }
 function save({document,expectedRevision}){
  const old=read();if(old.revision!==expectedRevision)throw new Error(`REVISION_CONFLICT: 请重新读取白板 / Reload board (expected ${expectedRevision}, current ${old.revision})`);
  const d=validateDocument(cleanSelection({...document,boardId:old.boardId,revision:old.revision+1,updatedAt:new Date().toISOString()}));
  const data=JSON.stringify(d);if(new Blob([data]).size>16*1024*1024)throw new Error('文件超过 16 MiB / File exceeds 16 MiB');
  // Keep previous revisions. Quota failure leaves the authoritative document intact.
  pushBackupSnapshot(old);
  localStorage.setItem(key,data);
  syncActiveToCatalog(d);
  return d;
 }
 function listBoards(){
  const current=read();
  const list=readCatalog();
  const backupsRaw=localStorage.getItem(boardBackupsKey(current.boardId));
  let backups=[];
  try{if(backupsRaw)backups=JSON.parse(backupsRaw);}catch{}
  if(backups.length===0){
   try{
    const singleBackup=localStorage.getItem(key+'-backup');
    if(singleBackup){const parsed=validateDocument(JSON.parse(singleBackup));if(parsed.boardId===current.boardId)backups=[parsed];}
   }catch{}
  }
  return {
   activeBoardId:current.boardId,
   boards:list,
   backups:backups.map(b=>({revision:b.revision,updatedAt:b.updatedAt,title:b.title,tokenCount:b.tokens?.length||0}))
  };
 }
 function switchBoard(targetBoardId){
  const current=read();
  if(current.boardId===targetBoardId)return current;
  const raw=localStorage.getItem(boardSlotKey(targetBoardId));
  if(!raw)throw new Error('找不到该白板 / Board not found');
  const targetDoc=validateDocument(JSON.parse(raw));
  localStorage.setItem(key,JSON.stringify(targetDoc));
  syncActiveToCatalog(targetDoc);
  return targetDoc;
 }
 function createBoard({title:customTitle,fromExample=false}={}){
  read();
  const base=fromExample?structuredClone(window.mindflowExample):{
   title:customTitle||'未命名白板',
   tokens:[],edges:[],clusters:[],drawings:[]
  };
  if(customTitle)base.title=customTitle;
  const newDoc=normalize(base);
  localStorage.setItem(key,JSON.stringify(newDoc));
  syncActiveToCatalog(newDoc);
  return newDoc;
 }
 function deleteBoard(targetBoardId){
  const list=readCatalog();
  if(list.length<=1)throw new Error('至少保留一张白板 / Keep at least one board');
  const filtered=list.filter(b=>b.boardId!==targetBoardId);
  writeCatalog(filtered);
  localStorage.removeItem(boardSlotKey(targetBoardId));
  localStorage.removeItem(boardBackupsKey(targetBoardId));
  const current=read();
  if(current.boardId===targetBoardId){
   return switchBoard(filtered[0].boardId);
  }
  return current;
 }
 function restoreBackup(revision){
  const current=read();
  const bKey=boardBackupsKey(current.boardId);
  let backups=[];
  try{const raw=localStorage.getItem(bKey);if(raw)backups=JSON.parse(raw);}catch{}
  let found=backups.find(b=>b.revision===revision);
  if(!found){
   try{
    const single=localStorage.getItem(key+'-backup');
    if(single){const parsed=JSON.parse(single);if(parsed.revision===revision)found=parsed;}
   }catch{}
  }
  if(!found)throw new Error('未找到该历史版本 / Backup revision not found');
  return save({document:found,expectedRevision:current.revision});
 }
 window.desktop={mode:'browser',read:()=>lock(read),save:payload=>lock(()=>save(payload)),validate:async input=>normalize(input),context:async({document,scope})=>getContext(validateDocument(cleanSelection(document)),scope),
  skillGuide:async(lang='zh')=>getSkillGuide(lang),
  listBoards:()=>lock(listBoards),
  switchBoard:id=>lock(()=>switchBoard(id)),
  createBoard:opts=>lock(()=>createBoard(opts)),
  deleteBoard:id=>lock(()=>deleteBoard(id)),
  restoreBackup:rev=>lock(()=>restoreBackup(rev)),
  open:async()=>null,
  export:async({text,blob,extension,filename})=>{
   const mimeMap={json:'application/json',md:'text/markdown;charset=utf-8',svg:'image/svg+xml;charset=utf-8',png:'image/png'};
   const payload=blob||(new Blob([text],{type:mimeMap[extension]||'text/plain;charset=utf-8'}));
   const url=URL.createObjectURL(payload);
   const a=document.createElement('a');a.href=url;a.download=filename||`MindFlow.${extension}`;document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
  },
  copy:async text=>navigator.clipboard.writeText(text),
  info:async()=>({file:'数据保存在当前浏览器。',config:null}),
  reveal:async()=>{},onMenu:()=>{},onClose:()=>{},closeReady:()=>{}
 };
 const dialog=document.getElementById('mcp-dialog');
 dialog.querySelector('h2').textContent='JSON 与 MCP';
 dialog.querySelector('p').textContent='下载桌面版，打开「MCP 接入」即可连接 AI 客户端。';
 document.getElementById('mcp-readonly').closest('label').hidden=true;
 document.getElementById('mcp-config').hidden=true;
 document.getElementById('mcp-copy').hidden=true;
 document.getElementById('mcp-reveal').hidden=true;
 const downloads=document.createElement('div');downloads.className='mcp-actions web-downloads';
 for(const [text,url] of [['Windows 下载','https://github.com/moyx782/mindconnect/releases/download/v1.0.1/MindFlow-1.0.1-win.zip'],['Linux 下载','https://github.com/moyx782/mindconnect/releases/download/v1.0.1/MindFlow-1.0.1-linux-x64.tar.gz'],['源码与说明','https://github.com/moyx782/mindconnect']]){const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener noreferrer';downloads.append(a);}
 document.getElementById('mcp-config').after(downloads);
 document.getElementById('btn-mcp').textContent='JSON / MCP';
 document.getElementById('btn-open-native').textContent='导入';
 document.getElementById('board-title-input').title='编辑白板标题';
 document.getElementById('save-status').title='清除浏览器数据前，请先导出完整备份。';
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();document.getElementById('btn-export-modal').click();document.getElementById('tab-export-json').click();}
 });
}

