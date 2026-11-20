import {normalize,validateDocument,cleanSelection,getContext} from '../src/model.mjs';
import seed from '../examples/mindflow-board.json' with {type:'json'};
const { title, tokens, edges, clusters, drawings } = seed;
window.mindflowExample = { title, tokens, edges, clusters, drawings };
if(!window.desktop){
 const key='mindconnect-document-v1';
 const lock=fn=>navigator.locks?navigator.locks.request(key,fn):Promise.resolve().then(fn);
 function read(){
  const raw=localStorage.getItem(key);
  if(raw)return validateDocument(JSON.parse(raw));
  const legacy=localStorage.getItem('mindflow_brainstorm_v1');
  const d=normalize(legacy?JSON.parse(legacy):window.mindflowExample);localStorage.setItem(key,JSON.stringify(d));return d;
 }
 function save({document,expectedRevision}){
  const old=read();if(old.revision!==expectedRevision)throw new Error(`REVISION_CONFLICT: 请重新读取白板 / Reload board (expected ${expectedRevision}, current ${old.revision})`);
  const d=validateDocument(cleanSelection({...document,boardId:old.boardId,revision:old.revision+1,updatedAt:new Date().toISOString()}));
  const data=JSON.stringify(d);if(new Blob([data]).size>16*1024*1024)throw new Error('文件超过 16 MiB / File exceeds 16 MiB');
  // Keep one previous revision. Quota failure leaves the authoritative document intact.
  localStorage.setItem(key+'-backup',JSON.stringify(old));localStorage.setItem(key,data);return d;
 }
 window.desktop={mode:'browser',read:()=>lock(read),save:payload=>lock(()=>save(payload)),validate:async input=>normalize(input),context:async({document,scope})=>getContext(validateDocument(cleanSelection(document)),scope),
  open:async()=>null,
  export:async({text,extension})=>{const url=URL.createObjectURL(new Blob([text],{type:extension==='json'?'application/json':'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`MindFlow.${extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;},
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
