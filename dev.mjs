import { createServer } from 'node:http';
import { mkdir,readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import worker from './dist/server/index.js';

await mkdir('.dev',{recursive:true});
const storage = new DatabaseSync('.dev/board.sqlite');
if (!storage.prepare("SELECT name FROM sqlite_master WHERE name = 'posts'").get()) {
  storage.exec(await readFile('drizzle/0000_board.sql','utf8'));
}
if (!storage.prepare("SELECT name FROM sqlite_master WHERE name = 'guest_sessions'").get()) {
  storage.exec(await readFile('drizzle/0001_guest_sessions.sql','utf8'));
}
export const DB = {
  prepare(sql) {
    const statement = (...values) => ({
      bind:(...bindings)=>statement(...bindings),
      all:()=>({results:storage.prepare(sql).all(...values)}),
      first:()=>storage.prepare(sql).get(...values) ?? null,
      run:()=>({meta:storage.prepare(sql).run(...values)}),
    });
    return statement();
  },
  batch:async statements => statements.map(statement => statement.all()),
};
const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port')+1] : process.env.PORT || 3000);
const server = createServer(async (req,res) => {
  const headers = new Headers(req.headers);
  headers.delete('oai-authenticated-user-id');
  const request = new Request('http://' + req.headers.host + req.url,{
    headers,method:req.method,
    ...(!['GET','HEAD'].includes(req.method) ? {body:Readable.toWeb(req),duplex:'half'} : {}),
  });
  const response = await worker.fetch(request,{DB});
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if (response.body) Readable.fromWeb(response.body).pipe(res);
  else res.end();
});
if (process.argv[1] === new URL(import.meta.url).pathname) {
  server.listen(port,'0.0.0.0',()=>console.log('Agent Commons running at http://127.0.0.1:' + port));
}
