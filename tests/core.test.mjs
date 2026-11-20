import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {normalize,validateDocument,applyOperations,getContext} from '../src/model.mjs';
const seed=JSON.parse(await readFile(new URL('./fixtures/legacy-board.json',import.meta.url)));
const tmp=async t=>{const d=await mkdtemp(path.join(os.tmpdir(),'mindflow-'));t.after(()=>rm(d,{recursive:true,force:true}));return d;};
test('legacy imports and canonical round trip preserve text, edges, drawings and viewport',()=>{
 const d=normalize({state:seed,viewport:{x:12,y:25,scale:0.5}});assert.deepEqual(d.tokens,seed.tokens);assert.deepEqual(d.edges,seed.edges);
 assert.deepEqual(normalize(JSON.parse(JSON.stringify(d))),d);assert.equal(d.viewport.x,12);
 const v=structuredClone(d);v.drawings=[{id:'dr_a',type:'pen',color:'blue',points:[{x:1,y:2},{x:3,y:4}]}];assert.deepEqual(normalize(v),v);
});
test('strict input checks prevent selector injection, invalid refs, duplicate IDs, NaN and future schemas',()=>{
 for(const mutate of [d=>d.tokens[0].id='bad"]',d=>d.edges[0].target='missing',d=>d.tokens[1].id=d.tokens[0].id,d=>d.tokens[0].x=NaN,d=>d.schemaVersion=2,d=>d.selection.tokens=['missing'],d=>d.tokens[0].command='rm -rf']){const d=normalize(seed);mutate(d);assert.throws(()=>validateDocument(d));}
});
test('context is scoped; empty selection never expands; selected edge includes endpoints',()=>{
 const d=normalize(seed);assert.equal(getContext(d).empty,true);assert.equal(getContext(d).tokens.length,0);
 d.selection.tokens=['tk_root'];assert.equal(getContext(d).tokens.length,1);assert.equal(getContext(d).edges.length,0);
 d.selection.edges=['ed_1'];assert.equal(getContext(d).tokens.length,2);assert.equal(getContext(d).edges.length,1);
 assert.equal(getContext(d,'all').tokens.length,7);
});
test('operations preserve original unless batch succeeds and delete incident edges',()=>{
 const d=normalize(seed);d.selection.tokens=['tk_root'];const n=applyOperations(d,[{action:'delete',collection:'tokens',id:'tk_root'}]);
 assert.equal(d.tokens.length,7);assert.equal(n.tokens.length,6);assert.equal(n.edges.length,1);assert.equal(n.selection.tokens.length,0);
 assert.throws(()=>applyOperations(d,[{action:'delete',collection:'tokens',id:'tk_root'},{action:'upsert',collection:'edges',item:{id:'bad',source:'missing',target:'tk_1',label:''}}]));assert.equal(d.tokens.length,7);
});
test('concurrent writers: exactly one commits; stale writer cannot overwrite; backup retained',async t=>{
 const dir=await tmp(t),s=new Store(dir),s2=new Store(dir);const d=await s.init();
 const results=await Promise.allSettled([s.update(d.revision,v=>({...v,title:'A'})),s2.update(d.revision,v=>({...v,title:'B'}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/REVISION_CONFLICT/);
 assert.equal((await s.read()).revision,1);assert.deepEqual(JSON.parse(await readFile(path.join(dir,'backups/revision-0.json'))),d);
 assert.equal((await new Store(dir).init()).revision,1);
});
test('invalid transaction and corrupted disk never silently replace existing contents',async t=>{
 const s=new Store(await tmp(t));await s.init();const before=await readFile(s.file,'utf8');
 await assert.rejects(s.update(0,d=>({...d,edges:[{id:'bad'}]})));assert.equal(await readFile(s.file,'utf8'),before);
 await writeFile(s.file,'not json');await assert.rejects(s.init());assert.equal(await readFile(s.file,'utf8'),'not json');
});
test('backup rotation retains twenty previous revisions',async t=>{
 const s=new Store(await tmp(t));await s.init();for(let i=0;i<22;i++)await s.update(i,d=>({...d,title:String(i)}));
 assert.equal((await readdir(path.join(s.directory,'backups'))).length,20);
});
test('multi-board creation, switching, deletion and backup restoration work with strokeWidth drawings',async t=>{
 const s=new Store(await tmp(t));const initial=await s.init();
 const updated=await s.update(initial.revision,d=>({...d,title:'Board One',drawings:[{id:'dr_sw',type:'pen',color:'green',strokeWidth:6,points:[{x:10,y:10},{x:30,y:40}]}]}));
 assert.equal(updated.drawings[0].strokeWidth,6);
 const second=await s.createBoard({title:'Second Board',fromExample:false});
 assert.notEqual(second.boardId,initial.boardId);
 assert.equal(second.tokens.length,0);
 const listed=await s.listBoards();
 assert.equal(listed.boards.length,2);
 const switchedBack=await s.switchBoard(initial.boardId);
 assert.equal(switchedBack.title,'Board One');
 const restored=await s.restoreBackup(0);
 assert.equal(restored.revision,2);
 assert.equal(restored.drawings.length,0);
 await s.deleteBoard(second.boardId);
 assert.equal((await s.listBoards()).boards.length,1);
});

