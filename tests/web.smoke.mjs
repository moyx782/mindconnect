import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');let name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
 if(!(name==='index.html'||/^ui\/[a-zA-Z0-9._-]+$/.test(name))){res.writeHead(404).end();return;}
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};res.setHeader('Content-Type',types[path.extname(name)]||'text/plain');res.end(await fs.readFile(name));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
try{
 const context=await browser.newContext({locale:'zh-CN',viewport:{width:1365,height:960},acceptDownloads:true});const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.token-node').first().waitFor();assert.equal(await page.locator('.token-node').count(),7);
 await page.mouse.dblclick(240,720);await page.locator('#quick-input-field').fill('Web persistence test');await page.locator('#quick-input-field').press('Enter');
 await page.waitForFunction(()=>document.getElementById('save-status').textContent.includes('r1'));
 await page.locator('#btn-mcp').click();assert.equal(await page.locator('.token-node.selected').count(),1);
 assert.ok(await page.getByRole('link',{name:'Windows 下载'}).isVisible());
 const download=page.waitForEvent('download');await page.locator('#btn-export-context').click();const file=await (await download).path();const selected=JSON.parse(await fs.readFile(file));assert.equal(selected.tokens.length,1);assert.equal(selected.tokens[0].text,'Web persistence test');
 await page.locator('#mcp-close').click();await page.reload();await page.getByText('Web persistence test',{exact:true}).waitFor();assert.equal(await page.locator('.token-node').count(),8);
 await page.locator('#btn-export-modal').click();await page.locator('#tab-export-json').click();const backup=JSON.parse(await page.locator('#export-preview-area').inputValue());assert.equal(backup.format,'mindflow');assert.equal(backup.tokens.length,8);await page.locator('#btn-close-export').click();
 // Import through the visible file input and confirmation, then reject malformed input without changing data.
 await page.locator('#input-import-json').setInputFiles(path.resolve('tests/fixtures/legacy-board.json'));await page.locator('#btn-confirm-ok').click();await page.waitForFunction(()=>document.querySelectorAll('.token-node').length===7);
 await page.locator('#input-import-json').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"tokens":[{"id":"bad"}]}')});await page.waitForTimeout(250);assert.equal(await page.locator('.token-node').count(),7);
 // Switching language must not translate authored text or commit a new revision.
 await page.locator('#board-title-input').fill('已保存');
 await page.locator('#board-title-input').blur();
 await page.waitForFunction(() => JSON.parse(localStorage.getItem('mindconnect-document-v1')).title === '已保存');
 const beforeLanguage = await page.evaluate(() => localStorage.getItem('mindconnect-document-v1'));
 await page.getByRole('button', {name:'English / 中文',exact:true}).click();
 assert.equal(await page.locator('html').getAttribute('lang'), 'en');
 assert.ok(await page.getByRole('button',{name:'Export',exact:true}).isVisible());
 assert.equal(await page.locator('#board-title-input').inputValue(), '已保存');
 assert.equal(await page.evaluate(() => localStorage.getItem('mindconnect-document-v1')), beforeLanguage);
 await page.reload();
 await page.getByRole('button',{name:'Export',exact:true}).waitFor();
 await page.locator('#btn-mcp').click();
 assert.ok(await page.getByRole('link',{name:'Download for Windows'}).isVisible());
 assert.ok(await page.getByRole('button',{name:'Export content JSON'}).isVisible());
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('#btn-language').click();
 assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
 // Two tabs share persisted revisions; incoming edits appear in an idle tab.
 const second=await context.newPage();await second.goto(base);await second.locator('.token-node').first().waitFor();await page.locator('#board-title-input').fill('Cross tab sync');await page.locator('#board-title-input').blur();
 await second.waitForFunction(()=>document.getElementById('board-title-input').value==='Cross tab sync');
 // Test pen with thick strokeWidth and eraser tool
 await page.locator('[data-stroke-width="6"]').click();
 await page.locator('[data-tool="pen"]').click();
 await page.mouse.move(400, 300);
 await page.mouse.down();
 await page.mouse.move(440, 320);
 await page.mouse.move(480, 350);
 await page.mouse.up();
 assert.equal(await page.locator('#drawings-container .drawing-group').count(), 1);
 await page.locator('[data-tool="eraser"]').click();
 await page.mouse.move(440, 320);
 await page.mouse.down();
 await page.mouse.move(450, 325);
 await page.mouse.up();
 assert.equal(await page.locator('#drawings-container .drawing-group').count(), 0);
 await page.locator('[data-tool="select"]').click();
 // Test search panel and duplicate
 await page.locator('#btn-search-toggle').click();
 await page.locator('#search-input').fill('语音');
 assert.ok((await page.locator('#search-count').textContent()).startsWith('1/'));
 await page.locator('#btn-search-close').click();
 await page.locator('#btn-toolbar-duplicate').click();
 assert.equal(await page.locator('.token-node').count(), 8);
 // Test SVG export preview
 await page.locator('#btn-export-modal').click();
 await page.locator('#tab-export-svg').click();
 assert.ok((await page.locator('#export-preview-area').inputValue()).includes('<svg'));
 await page.locator('#btn-close-export').click();
 // Test multi-board manager modal
 await page.locator('#btn-boards-modal').click();
 await page.locator('#btn-new-blank-board').click();
 await page.waitForFunction(()=>document.querySelectorAll('.token-node').length===0);
 await page.locator('#btn-boards-modal').click();
 await page.waitForFunction(()=>document.querySelectorAll('#boards-list-container > div').length===2);
 await page.locator('#btn-close-boards').click();
 // Test pasting/attaching images and files as Markdown links
 const onePxPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
 await page.locator('#input-attach-file').setInputFiles([
  { name: 'diagram.png', mimeType: 'image/png', buffer: onePxPng },
  { name: 'spec.txt', mimeType: 'text/plain', buffer: Buffer.from('MindFlow specification') }
 ]);
 await page.waitForFunction(() => document.querySelectorAll('.token-node').length === 2);
 assert.equal(await page.locator('.token-node img.token-md-img').count(), 1);
 assert.equal(await page.locator('.token-node a.token-md-link').count(), 1);
 await page.locator('#btn-export-modal').click();
 const mdExport = await page.locator('#export-preview-area').inputValue();
 assert.ok(mdExport.includes('![diagram.png](data:image/png;base64,'));
 assert.ok(mdExport.includes('[spec.txt](data:text/plain;base64,'));
 await page.locator('#btn-close-export').click();

 // Test pasting full Markdown text onto canvas and automatic Markdown rendering
 await page.evaluate(() => {
  const mdSample = [
   '# 产品路线图',
   '> 核心围绕 **自由白板** 与 *AI 协同*',
   '- [ ] 完成 `Markdown` 自动渲染',
   '- [x] 支持代码块与表格',
   '```js',
   'const ready = true;',
   '```',
   '| 模块 | 状态 |',
   '| --- | --- |',
   '| 渲染 | 已完成 |'
  ].join('\n');
  const dt = new DataTransfer();
  dt.setData('text/plain', mdSample);
  window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
 });
 await page.waitForFunction(() => document.querySelectorAll('.token-node').length === 3);
 assert.equal(await page.locator('.token-node .token-md-h1').textContent(), '产品路线图');
 assert.equal(await page.locator('.token-node .token-md-strong').first().textContent(), '自由白板');
 assert.equal(await page.locator('.token-node .token-md-em').first().textContent(), 'AI 协同');
 assert.equal(await page.locator('.token-node .token-md-inline-code').textContent(), 'Markdown');
 assert.equal(await page.locator('.token-node .token-md-pre').textContent(), 'const ready = true;');
 assert.equal(await page.locator('.token-node .token-md-table tbody td').first().textContent(), '渲染');
 assert.equal(await page.locator('.token-node input.token-md-checkbox').count(), 2);
 // Toggle interactive task checkbox inside rendered Markdown card
 await page.locator('.token-node input.token-md-checkbox').first().click();
 assert.equal(await page.locator('.token-node .token-md-task-done').count(), 2);

 // Test attaching/dropping a .md file directly renders its Markdown content
 await page.locator('#input-attach-file').setInputFiles([
  { name: 'note.md', mimeType: 'text/markdown', buffer: Buffer.from('## 粘贴文档\n- **自动解析** `.md` 文件') }
 ]);
 await page.waitForFunction(() => document.querySelectorAll('.token-node').length === 4);
 assert.equal(await page.locator('.token-node .token-md-h2').textContent(), '粘贴文档');

 await page.setViewportSize({width:390,height:844});await page.locator('#btn-mcp').click();assert.ok(await page.locator('#mcp-dialog').isVisible());
 const bounds=await page.locator('#mcp-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391);
 const skillDl=page.waitForEvent('download');await page.locator('#btn-download-skill').click();const skillFile=await (await skillDl).path();const skillText=await fs.readFile(skillFile,'utf8');assert.ok(skillText.includes('name: mindflow-whiteboard'));
 assert.deepEqual(errors,[]);console.log('Web smoke PASS: load, edit, persistence, selected JSON, full JSON, legacy import, invalid input, two-tab sync, pen+eraser, search, duplicate, SVG export, multi-board, Markdown paste & auto-render, built-in AI skill, mobile dialog, CSP');
}finally{await browser.close();server.close();}



