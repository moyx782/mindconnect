import {normalize,validateDocument,cleanSelection,getContext} from '../src/model.mjs';
import seed from '../examples/original-board.json' with {type:'json'};
if(!window.desktop){
 const key='mindconnect-document-v1';
 const lock=fn=>navigator.locks?navigator.locks.request(key,fn):Promise.resolve().then(fn);
 function read(){
  const raw=localStorage.getItem(key);
  if(raw)return validateDocument(JSON.parse(raw));
  const legacy=localStorage.getItem('mindflow_brainstorm_v1');
  const d=normalize(legacy?JSON.parse(legacy):seed);localStorage.setItem(key,JSON.stringify(d));return d;
 }
 function save({document,expectedRevision}){
  const old=read();if(old.revision!==expectedRevision)throw new Error(`REVISION_CONFLICT: 预期 ${expectedRevision}，当前 ${old.revision}`);
  const d=validateDocument(cleanSelection({...document,boardId:old.boardId,revision:old.revision+1,updatedAt:new Date().toISOString()}));
  const data=JSON.stringify(d);if(new Blob([data]).size>16*1024*1024)throw new Error('文件超过 16 MiB');
  // Keep one previous revision. Quota failure leaves the authoritative document intact.
  localStorage.setItem(key+'-backup',JSON.stringify(old));localStorage.setItem(key,data);return d;
 }
 window.desktop={mode:'browser',read:()=>lock(read),save:payload=>lock(()=>save(payload)),validate:async input=>normalize(input),context:async({document,scope})=>getContext(validateDocument(cleanSelection(document)),scope),
  open:async()=>null,
  export:async({text,extension})=>{const url=URL.createObjectURL(new Blob([text],{type:extension==='json'?'application/json':'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`MindFlow.${extension}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;},
  copy:async text=>navigator.clipboard.writeText(text),
  info:async()=>({file:'网页版 · 数据仅保存在当前浏览器，不会上传到 GitHub',config:null,help:'GitHub Pages 不能运行本机 MCP。\n\n请下载桌面版，在软件中点击「MCP 接入」，复制为你的安装路径生成的配置。\n\n网页版可以导出完整 JSON，在桌面版中打开；也可以直接导出选区/整图的内容 JSON，交给 Agent 阅读。\n\n浏览器与桌面数据不自动互通；请用 JSON 文件迁移。'}),
  reveal:async()=>{},onMenu:()=>{},onClose:()=>{},closeReady:()=>{}
 };
 const dialog=document.getElementById('mcp-dialog');
 dialog.querySelector('h2').textContent='JSON 与桌面 MCP';
 dialog.querySelector('p').textContent='网页版可直接编辑白板和提取 JSON。需要 Agent 实时读取或修改时，使用桌面版的本地 MCP 服务。';
 document.getElementById('mcp-readonly').closest('label').hidden=true;
 document.getElementById('mcp-copy').hidden=true;
 document.getElementById('mcp-reveal').hidden=true;
 const downloads=document.createElement('div');downloads.className='mcp-actions web-downloads';
 for(const [text,url] of [['Windows 下载','https://github.com/moyx782/mindconnect/releases/download/v1.0.0/MindFlow-1.0.0-win.zip'],['Linux 下载','https://github.com/moyx782/mindconnect/releases/download/v1.0.0/MindFlow-1.0.0-linux-x64.tar.gz'],['源码与说明','https://github.com/moyx782/mindconnect']]){const a=document.createElement('a');a.textContent=text;a.href=url;a.target='_blank';a.rel='noopener noreferrer';downloads.append(a);}
 document.getElementById('mcp-config').after(downloads);
 document.getElementById('btn-mcp').textContent='JSON / MCP';
 document.getElementById('btn-open-native').textContent='导入';
 document.getElementById('board-title-input').title='点击修改白板标题；数据仅保存在当前浏览器，请定期导出';
 document.getElementById('save-status').title='当前浏览器本地保存；清除网站数据会删除白板，请定期导出 JSON。';
 document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();document.getElementById('btn-export-modal').click();document.getElementById('tab-export-json').click();}
 });
}
