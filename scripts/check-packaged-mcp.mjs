import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mindflow-packed-'));
const c=new Client({name:'packaged-check',version:'1.0.0'});
try{
 await c.connect(new StdioClientTransport({command:path.resolve('dist/linux-unpacked/mindflow-desktop'),args:[path.resolve('dist/linux-unpacked/resources/app.asar/src/mcp.mjs'),'--data-dir',dir],env:{ELECTRON_RUN_AS_NODE:'1'},stderr:'pipe'}));
 const r=await c.callTool({name:'mindflow_get_board',arguments:{}});assert.equal(r.structuredContent.tokens.length,7);console.log('Packaged ASAR MCP: PASS');
}finally{await c.close();await fs.rm(dir,{recursive:true,force:true});}
