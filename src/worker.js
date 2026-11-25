import { topics, kinds, examples } from '../public/catalog.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const guard = (condition, status, message) => {
  if (!condition) throw new HttpError(status,message);
};
const json = (data, status = 200, headers = {}) => Response.json(data,{
  status,
  headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers},
});
const publicPost = ({userId,...row},authorId) => ({...row,canEdit:Boolean(authorId && userId === authorId)});
const columns = 'p.id, p.kind, p.topic, p.title, p.body, p.status, p.author, p.user_id AS userId, p.created_at AS createdAt';
const replyCount = '(SELECT count(*) FROM replies r WHERE r.post_id = p.id) AS replyCount';
const notFound = 'This discussion could not be found.';
const guestCookie = '__Host-agentcommons-guest';
const guestLifetime = 180 * 86400;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
async function sha256(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
}
function guestIdentity(hash) {
  return {key:'guest:' + hash, displayName:'Guest ' + hash.slice(0,6).toUpperCase(), mode:'guest'};
}
const publicIdentity = user => user ? {displayName:user.displayName,mode:user.mode} : null;
async function identity(request,db) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (id) {
    const key = await sha256(id);
    return {key, displayName:'Builder ' + key.slice(0,6).toUpperCase(), mode:'chatgpt'};
  }
  const prefix = guestCookie + '=';
  const token = request.headers.get('Cookie')?.split(';').map(part => part.trim())
    .find(part => part.startsWith(prefix))?.slice(prefix.length);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  const guest = await db.prepare('SELECT id FROM guest_sessions WHERE id = ? AND expires_at > ?')
    .bind(hash,Date.now()).first();
  return guest ? guestIdentity(hash) : null;
}
async function joinGuest(db,user) {
  if (user) return json({user:publicIdentity(user)});
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256(token);
  const now = Date.now();
  await db.prepare('DELETE FROM guest_sessions WHERE expires_at <= ?').bind(now).run();
  const result = await db.prepare(
    'INSERT INTO guest_sessions (id,created_at,expires_at) SELECT ?,?,? WHERE (SELECT count(*) FROM guest_sessions WHERE created_at > ?) < 24',
  ).bind(hash,now,now+guestLifetime*1000,now-60000).run();
  guard(result.meta.changes,429,'Many guests are joining right now. Try again in a minute.');
  return json({user:publicIdentity(guestIdentity(hash))},201,{
    'Set-Cookie':guestCookie + '=' + token + '; Max-Age=' + guestLifetime + '; Path=/; HttpOnly; Secure; SameSite=Lax',
  });
}
function lengthChecked(value, min, max, name) {
  const text = typeof value === 'string' ? value.trim().normalize() : '';
  guard(text.length >= min && text.length <= max,400,name + ' must be ' + min + '–' + max + ' characters.');
  guard(!/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/iu.test(text),400,'Remove email addresses before posting.');
  return text;
}
async function readBody(request) {
  guard(request.headers.get('Content-Type')?.split(';')[0] === 'application/json',415,'Send this request as JSON.');
  const chunks = [];
  const reader = request.body?.getReader();
  guard(reader,400,'Missing request body.');
  let bytes = 0;
  for (;;) {
    const {done,value} = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 24000) {
      await reader.cancel();
      throw new HttpError(413,'This request is too long.');
    }
    chunks.push(value);
  }
  const body = await new Response(new Blob(chunks)).json().catch(() => null);
  guard(body && typeof body === 'object' && !Array.isArray(body),400,'Invalid request data.');
  return body;
}
async function listPosts(db,params,user) {
  const mine = params.get('mine') === '1';
  if (mine) guard(user,401,'Join the board to view your posts.');
  const topic = params.get('topic') || '';
  guard(!topic || Object.hasOwn(topics,topic),400,'Choose a valid topic.');
  const query = (params.get('q') || '').trim().toLowerCase().slice(0,100);
  const page = Number(params.get('page') || 0);
  guard(Number.isInteger(page) && page >= 0 && page <= 1000,400,'Invalid page.');
  const size = 24;
  const checks = [];
  const vars = [];
  if (mine) { checks.push('p.user_id = ?'); vars.push(user.key); }
  if (topic) { checks.push('p.topic = ?'); vars.push(topic); }
  if (query) { checks.push('(instr(lower(p.title), ?) > 0 OR instr(lower(p.body), ?) > 0)'); vars.push(query,query); }
  const where = checks.length ? 'WHERE ' + checks.join(' AND ') : '';
  const sort = params.get('sort') === 'active' ? 'replyCount DESC, ' : '';
  const {results} = await db.prepare(
    'SELECT ' + columns + ', ' + replyCount + ' FROM posts p ' + where + ' ORDER BY ' + sort + 'p.created_at DESC, p.id DESC LIMIT ? OFFSET ?',
  ).bind(...vars,size+1,size*page).all();
  const posts = results.slice(0,size).map(post => publicPost(post,user?.key));
  if (!mine && page === 0 && !posts.length) {
    posts.push(...examples.filter(item => (!topic || item.topic === topic) && (item.title + ' ' + item.body).toLowerCase().includes(query)));
  }
  return {posts,more:results.length > size};
}
async function getThread(db,id,user) {
  const example = examples.find(item => item.id === id);
  if (example) return {post:example,replies:[],moreReplies:false};
  const [postQuery,repliesQuery] = await db.batch([
    db.prepare('SELECT ' + columns + ', ' + replyCount + ' FROM posts p WHERE id = ?').bind(id),
    db.prepare('SELECT id, author, user_id AS userId, body, created_at AS createdAt FROM replies WHERE post_id = ? ORDER BY created_at DESC, id DESC LIMIT 101').bind(id),
  ]);
  const post = postQuery.results[0];
  guard(post,404,notFound);
  return {
    post:publicPost(post,user?.key),
    replies:repliesQuery.results.slice(0,100).reverse().map(reply => publicPost(reply,user?.key)),
    moreReplies:repliesQuery.results.length > 100,
  };
}
async function newPost(db,user,body) {
  const {kind,topic} = body;
  guard(typeof kind === 'string' && Object.hasOwn(kinds,kind),400,'Choose a post type.');
  guard(typeof topic === 'string' && Object.hasOwn(topics,topic),400,'Choose a topic.');
  const title = lengthChecked(body.title,8,100,'Title').replace(/\s+/gu,' ');
  const text = lengthChecked(body.body,20,3000,'Details');
  const id = crypto.randomUUID();
  const now = Date.now();
  const result = await db.prepare(
    'INSERT INTO posts (id,user_id,author,kind,topic,title,body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM posts WHERE user_id = ? AND created_at > ?) < ?',
  ).bind(id,user.key,user.displayName,kind,topic,title,text,now,user.key,now-3600000,user.mode === 'guest' ? 4 : 10).run();
  guard(result.meta.changes,429,'You’ve posted several times. Try again in an hour.');
  return json({id},201);
}
async function newReply(db,user,id,body) {
  const text = lengthChecked(body.body,3,2000,'Reply');
  const now = Date.now();
  const reply = crypto.randomUUID();
  const result = await db.prepare(
    "INSERT INTO replies (id,post_id,user_id,author,body,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id = ? AND status = 'open') AND (SELECT count(*) FROM replies WHERE user_id = ? AND created_at > ?) < ?",
  ).bind(reply,id,user.key,user.displayName,text,now,id,user.key,now-3600000,user.mode === 'guest' ? 20 : 45).run();
  if (!result.meta.changes) {
    const post = await db.prepare('SELECT status FROM posts WHERE id = ?').bind(id).first();
    guard(post,404,notFound);
    guard(post.status === 'open',409,'This discussion is resolved.');
    throw new HttpError(429,'You’ve replied several times. Try again in an hour.');
  }
  return json({id:reply},201);
}
async function handleApi(request,url,db) {
  const user = await identity(request,db);
  const method = request.method;
  const path = url.pathname;
  const post = path.match(/^\/api\/posts\/([a-z0-9-]+)$/i)?.[1];
  const threadReply = path.match(/^\/api\/posts\/([a-z0-9-]+)\/replies$/i)?.[1];
  const reply = path.match(/^\/api\/replies\/([a-z0-9-]+)$/i)?.[1];
  if (path === '/api/session' && method === 'GET') return json({user:publicIdentity(user)});
  if (method === 'GET') {
    if (path === '/api/posts') return json(await listPosts(db,url.searchParams,user));
    if (post) return json(await getThread(db,post,user));
    throw new HttpError(404,'This page could not be found.');
  }
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  guard((!origin || origin === url.origin) && (!fetchSite || fetchSite === 'same-origin'),403,'Send this request from the board.');
  if (path === '/api/guest' && method === 'POST') return joinGuest(db,user);
  guard(user,401,'Join the board to publish, reply, or manage your posts.');
  if (path === '/api/posts' && method === 'POST') return newPost(db,user,await readBody(request));
  if (threadReply && method === 'POST') return newReply(db,user,threadReply,await readBody(request));
  if (post && method === 'PATCH') {
    const {status} = await readBody(request);
    guard(status === 'open' || status === 'closed',400,'Choose a valid status.');
    const result = await db.prepare('UPDATE posts SET status = ? WHERE id = ? AND user_id = ?').bind(status,post,user.key).run();
    guard(result.meta.changes,404,'That post isn’t yours or is no longer available.');
    return json({status});
  }
  if (method === 'DELETE' && (post || reply)) {
    const result = post
      ? await db.prepare('DELETE FROM posts WHERE id = ? AND user_id = ?').bind(post,user.key).run()
      : await db.prepare('DELETE FROM replies WHERE id = ? AND user_id = ?').bind(reply,user.key).run();
    guard(result.meta.changes,404,'That item isn’t yours or is no longer available.');
    return json({deleted:true});
  }
  throw new HttpError(404,'This page could not be found.');
}

export function makeWorker(assets) {
  return {
    async fetch(request,env) {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        try { return await handleApi(request,url,env.DB); }
        catch (error) {
          if (error instanceof HttpError) return json({error:error.message},error.status);
          console.error(error.message);
          return json({error:'The board is temporarily unavailable. Try again in a moment.'},503);
        }
      }
      if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405});
      const path = url.pathname === '/help/' ? '/help' : url.pathname;
      const asset = Object.hasOwn(assets,path) ? assets[path] : null;
      if (!asset) return new Response('Page not found',{status:404});
      const [type,data,binary] = asset;
      return new Response(request.method === 'HEAD' ? null : (binary ? Uint8Array.from(atob(data),char => char.charCodeAt(0)) : data),{
        headers:{
          'Content-Type':type,
          'Cache-Control':type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600',
          'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'",
          'X-Content-Type-Options':'nosniff',
          'Referrer-Policy':'same-origin',
        },
      });
    },
  };
}
