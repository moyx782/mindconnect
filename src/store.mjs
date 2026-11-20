import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { normalize,validateDocument } from './model.mjs';
export const MAX_BYTES=16*1024*1024;
export function defaultDirectory() {
  if(process.env.MINDFLOW_DATA_DIR)return path.resolve(process.env.MINDFLOW_DATA_DIR);
  const base=process.platform==='win32'?(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming')):process.platform==='darwin'?path.join(os.homedir(),'Library','Application Support'):(process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local','share'));
  return path.join(base,'MindFlow');
}
export class Store {
  constructor(directory=defaultDirectory()) {this.directory=path.resolve(directory);this.file=path.join(this.directory,'board.json');}
  async locked(fn) {
    await fs.mkdir(this.directory,{recursive:true,mode:0o700});
    const release=await lockfile.lock(this.directory,{realpath:false,retries:{retries:30,minTimeout:20,maxTimeout:150},stale:15000});
    try{return await fn();}finally{await release();}
  }
  async read() {
    const stat=await fs.stat(this.file);if(stat.size>MAX_BYTES)throw new Error('白板超出 16 MiB / Board exceeds 16 MiB');
    return validateDocument(JSON.parse(await fs.readFile(this.file,'utf8')));
  }
  async init() {
    return this.locked(async()=>{
      try{return await this.read();}catch(e){if(e.code!=='ENOENT')throw e;}
      const seed=JSON.parse(await fs.readFile(new URL('../examples/mindflow-board.json',import.meta.url),'utf8'));
      const doc=normalize({title:seed.title,tokens:seed.tokens,edges:seed.edges,clusters:seed.clusters,drawings:seed.drawings});await this.atomicWrite(doc,false);return doc;
    });
  }
  async atomicWrite(doc,backup=true) {
    const data=JSON.stringify(doc,null,2);if(Buffer.byteLength(data)>MAX_BYTES)throw new Error('白板超出 16 MiB / Board exceeds 16 MiB');
    const temp=this.file+'.'+randomUUID()+'.tmp';
    try{
      const h=await fs.open(temp,'wx',0o600);try{await h.writeFile(data);await h.sync();}finally{await h.close();}
      if(backup){await fs.mkdir(path.join(this.directory,'backups'),{recursive:true,mode:0o700});const old=await this.read();await fs.copyFile(this.file,path.join(this.directory,'backups',`revision-${old.revision}.json`));}
      await fs.rename(temp,this.file);
    }finally{await fs.unlink(temp).catch(()=>{});}
    // Rotation after the successful commit must not turn a committed write into a failure.
    if(backup){try{const dir=path.join(this.directory,'backups');const names=(await fs.readdir(dir)).filter(n=>/^revision-\d+\.json$/.test(n)).sort((a,b)=>Number(b.match(/\d+/)[0])-Number(a.match(/\d+/)[0]));for(const n of names.slice(20))await fs.unlink(path.join(dir,n));}catch{}}
  }
  async update(expectedRevision,fn) {
    return this.locked(async()=>{
      const current=await this.read();
      if(!Number.isInteger(expectedRevision)||current.revision!==expectedRevision)throw new Error(`REVISION_CONFLICT: 请重新读取白板 / Reload board (expected ${expectedRevision}, current ${current.revision})`);
      const next=await fn(structuredClone(current));next.boardId=current.boardId;next.revision=current.revision+1;next.updatedAt=new Date().toISOString();
      validateDocument(next);await this.atomicWrite(next);return next;
    });
  }
}
