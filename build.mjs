import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
const files = [
  ['/','index.html','text/html; charset=utf-8'],
  ['/help','help.html','text/html; charset=utf-8'],
  ['/robots.txt','robots.txt','text/plain; charset=utf-8'],
  ['/sitemap.xml','sitemap.xml','application/xml; charset=utf-8'],
  ['/styles.css','styles.css','text/css; charset=utf-8'],
  ['/app.js','app.js','text/javascript; charset=utf-8'],
  ['/catalog.js','catalog.js','text/javascript; charset=utf-8'],
  ['/robot.js','robot.js','text/javascript; charset=utf-8'],
  ['/swipe.js','swipe.js','text/javascript; charset=utf-8'],
  ['/assets/dm-sans.woff2','assets/dm-sans.woff2','font/woff2',true],
  ['/assets/workflow.webp','assets/workflow.webp','image/webp',true],
];
const assets = Object.fromEntries(await Promise.all(files.map(async ([url,path,type,binary]) => [
  url,[type,await readFile('public/'+path,binary?'base64':'utf8'),Boolean(binary)],
])));
const catalog = await readFile('public/catalog.js','utf8');
const worker = (await readFile('src/worker.js','utf8')).replace(/^import .*?;\n/,'');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/server/migrations',{recursive:true});
await cp('drizzle','dist/drizzle',{recursive:true});
await writeFile('dist/server/index.js',catalog + '\n' + worker + '\nexport default makeWorker(' + JSON.stringify(assets) + ');\n');
await writeFile('dist/server/wrangler.json',JSON.stringify({
  main:'index.js',
  compatibility_date:'2026-05-15',
  d1_databases:[{binding:'DB',database_name:'agentcommons',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:'migrations'}],
},null,2)+'\n');
