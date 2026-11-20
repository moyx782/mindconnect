import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
async function connect(t,readOnly=false){
 const dir=await mkdtemp(path.join(os.tmpdir(),'mindflow-mcp-'));
 const client=new Client({name:'mindflow-tests',version:'1.0.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve('src/mcp.mjs'),'--data-dir',dir,...(readOnly?['--read-only']:[])],stderr:'pipe'});
 let stderr='';transport.stderr.on('data',d=>stderr+=d);
 await client.connect(transport);t.after(async()=>{await client.close();await rm(dir,{recursive:true,force:true});assert.equal(stderr,'');});return client;
}
const data=r=>r.structuredContent||JSON.parse(r.content[0].text);
test('official MCP client: initialize, tools, resources, search, write, conflicts and selection',async t=>{
 const c=await connect(t);assert.equal((await c.listTools()).tools.length,6);assert.equal((await c.listResources()).resources.length,3);
 const read=await c.readResource({uri:'mindflow://schema'});assert.equal(JSON.parse(read.contents[0].text).properties.schemaVersion.const,1);
 assert.equal(data(await c.callTool({name:'mindflow_get_context',arguments:{}})).empty,true);
 let d=data(await c.callTool({name:'mindflow_get_board',arguments:{}}));
 let r=await c.callTool({name:'mindflow_apply_operations',arguments:{expectedRevision:d.revision,operations:[{action:'upsert',collection:'tokens',item:{id:'agent_node',text:'Agent 测试内容',x:100,y:100,color:'blue'}}]}});
 assert.ok(!r.isError);d=data(r);assert.equal(d.revision,1);
 assert.equal(data(await c.callTool({name:'mindflow_search',arguments:{query:'Agent'}})).tokens.length,1);
 r=await c.callTool({name:'mindflow_rename_board',arguments:{expectedRevision:0,title:'Must not overwrite'}});assert.equal(r.isError,true);assert.match(r.content[0].text,/REVISION_CONFLICT/);
 await c.callTool({name:'mindflow_set_selection',arguments:{expectedRevision:1,tokens:['agent_node']}});
 assert.equal(data(await c.callTool({name:'mindflow_get_context',arguments:{}})).tokens[0].text,'Agent 测试内容');
 r=await c.callTool({name:'mindflow_apply_operations',arguments:{expectedRevision:2,operations:[{action:'upsert',collection:'edges',item:{id:'bad',source:'missing',target:'tk_root',label:''}}]}});assert.equal(r.isError,true);
 assert.equal(data(await c.callTool({name:'mindflow_get_board',arguments:{}})).revision,2);
});
test('read-only server advertises no mutations and rejects mutation calls',async t=>{
 const c=await connect(t,true);const tools=(await c.listTools()).tools;assert.equal(tools.length,3);assert.ok(tools.every(t=>t.annotations.readOnlyHint));
 const r=await c.callTool({name:'mindflow_rename_board',arguments:{expectedRevision:0,title:'bad'}});assert.equal(r.isError,true);
});
