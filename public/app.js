import { topics, kinds } from '/catalog.js';

const $ = selector => document.querySelector(selector);
const posts = $('#posts');
const compose = $('#compose');
const thread = $('#thread');
const join = $('#join');
const search = $('#search');
const sort = $('#sort');
const postForm = $('#post-form');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let user;
let topic = '';
let page = 0;
let sequence = 0;
let threadSequence = 0;
let searchTimer;
let afterJoin;
const isMine = () => location.hash === '#mine';
const hashFor = id => '#post/' + encodeURIComponent(id);
const authLink = (path, returnTo = '/' + location.hash) => path + '?return_to=' + encodeURIComponent(returnTo);
const starters = {
  debug:'What should the agent do?\n\nWhat happens instead?\n\nWhat have you tried?\n\nWhat’s the smallest example another builder can use?',
  collaborate:'What are you building?\n\nWhat’s ready now?\n\nWhat kind of help do you need?\n\nWhat could a new collaborator do first?',
  pitch:'What problem would this solve?\n\nHow could an agent help?\n\nWhat’s one small experiment the community could try?',
};

function playRipple(target) {
  if (reducedMotion.matches) return;
  if (target.classList.contains('water-switch')) {
    target.classList.remove('water-switch');
    void target.offsetWidth;
  }
  target.classList.add('water-switch');
}
const rippleObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries,observer) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    observer.unobserve(entry.target);
    playRipple(entry.target);
  }
},{threshold:.08}) : null;
function ripple(target) {
  if (!target || reducedMotion.matches) return;
  const {top,bottom} = target.getBoundingClientRect();
  if (rippleObserver && (top >= innerHeight || bottom <= 0)) rippleObserver.observe(target);
  else {
    rippleObserver?.unobserve(target);
    playRipple(target);
  }
}
function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function button(label, className, action) {
  const control = element('button', className, label);
  control.type = 'button';
  control.addEventListener('click', action);
  return control;
}
function badge(text, style = '') {
  return element('span', 'badge ' + style, text);
}
function describe(post, container) {
  container.append(badge(kinds[post.kind], post.kind), element('span', 'topic-name', topics[post.topic][0]));
  if (post.example) container.append(badge('Example'));
  if (post.status === 'closed') container.append(badge('Resolved', 'closed'));
}
function timestamp(ms) {
  if (!ms) return '';
  const days = Math.floor(Math.max(0, Date.now() - ms) / 86400000);
  if (!days) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  return new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:days >= 365 ? 'numeric' : undefined }).format(ms);
}
function message(title, detail, action) {
  const box = element('div','empty');
  box.append(element('h3','',title), element('p','',detail));
  if (action) box.append(action);
  return box;
}
async function api(path, method = 'GET', data) {
  const response = await fetch('/api/' + path, {
    method,
    headers:data === undefined ? undefined : {'Content-Type':'application/json'},
    body:data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The board is temporarily unavailable. Try again in a moment.');
  return result;
}
function enter({returnTo,after} = {}) {
  if (join.open) return;
  afterJoin = after;
  $('#join-link').href = authLink('/signin-with-chatgpt', returnTo);
  $('#join-error').hidden = true;
  join.showModal();
}
$('#account-join').onclick = () => enter();
$('#join-guest').onclick = async event => {
  const submit = event.currentTarget;
  const error = $('#join-error');
  submit.disabled = true;
  error.hidden = true;
  try {
    await api('guest','POST');
    const session = await api('session');
    if (!session.user) throw new Error('Allow cookies for this site to join as a guest.');
    user = session.user;
    const resume = join.open ? afterJoin : undefined;
    afterJoin = undefined;
    join.close();
    updateAccount();
    refreshBoard();
    await resume?.();
  } catch (failure) {
    error.textContent = failure.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
};
document.querySelectorAll('[data-close]').forEach(control => {
  control.onclick = () => control.closest('dialog').close();
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
});
function openCompose(kind, starter) {
  const selected = typeof kind === 'string' && Object.hasOwn(kinds,kind);
  const template = Object.hasOwn(starters,starter) ? starters[starter] : '';
  if (!user) {
    let returnTo;
    if (selected) {
      const params = new URLSearchParams({compose:kind});
      if (template) params.set('starter',starter);
      const anchor = template ? '#starters' : kind === 'project' ? '#projects' : '#board';
      returnTo = '/?' + params + anchor;
    }
    return enter({returnTo,after:() => openCompose(kind,starter)});
  }
  if (selected) postForm.elements.kind.value = kind;
  const body = postForm.elements.body;
  if (template && (!body.value.trim() || Object.values(starters).includes(body.value))) body.value = template;
  postForm.querySelector('.form-error').hidden = true;
  if (!compose.open) compose.showModal();
}
document.querySelectorAll('[data-compose]').forEach(control => {
  control.onclick = () => openCompose(control.dataset.compose,control.dataset.starter);
});
postForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = postForm.querySelector('[type=submit]');
  const error = postForm.querySelector('.form-error');
  submit.disabled = true;
  error.hidden = true;
  try {
    const result = await api('posts','POST',Object.fromEntries(new FormData(postForm)));
    postForm.reset();
    compose.close();
    location.hash = hashFor(result.id);
    refreshBoard();
  } catch (failure) {
    error.textContent = failure.message;
    error.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

for (const [id,title] of [['','All topics'], ...Object.entries(topics).map(([key,[label]]) => [key,label])]) {
  const control = button(title,'filter',() => {
    if (topic === id) return;
    topic = id;
    $('#filters').querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed',String(item === control)));
    refreshBoard({animate:true});
  });
  control.setAttribute('aria-pressed',String(!id));
  $('#filters').append(control);
  if (id) $('#post-topic').append(new Option(title,id));
}
function makeCard(post) {
  const card = element('article','card');
  const icon = element('div','topic-icon',topics[post.topic][1]);
  icon.dataset.topic = post.topic;
  icon.setAttribute('aria-hidden','true');
  const content = element('div');
  const badges = element('div','badges');
  describe(post,badges);
  const title = element('a','card-title',post.title);
  title.href = hashFor(post.id);
  title.onclick = event => {
    if (location.hash === title.hash && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      loadThread(post.id);
    }
  };
  const heading = element('h3');
  heading.append(title);
  content.append(badges,heading,element('p','preview',post.body));
  const meta = element('div','card-meta');
  const date = timestamp(post.createdAt);
  if (date) meta.append(element('span','',date));
  if (!post.example) {
    const count = element('span');
    count.append(element('i','bubble'), document.createTextNode(post.replyCount + (post.replyCount === 1 ? ' reply' : ' replies')));
    meta.append(count);
  }
  card.append(icon,content,meta);
  return card;
}
async function refreshBoard({append = false,animate = false} = {}) {
  const request = ++sequence;
  const targetPage = append ? page + 1 : 0;
  const mine = isMine();
  $('#board-title').textContent = mine ? 'My posts' : 'Project board';
  $('#board-subtitle').textContent = mine ? 'Find and manage the discussions you started.' : 'Problems to solve, ideas to test, and projects to join.';
  const current = mine ? 'mine' : location.hash === '#projects' ? 'projects' : 'explore';
  for (const name of ['mine','explore','projects']) {
    const anchor = $('#nav-' + name);
    if (name === current) anchor.setAttribute('aria-current','page');
    else anchor.removeAttribute('aria-current');
  }
  $('#more').hidden = true;
  if (!append) posts.replaceChildren(element('p','loading','Loading posts…'));
  try {
    if (mine && !user) {
      posts.replaceChildren(message('Find your posts here','Join the board to view posts you publish.',button('Join the board','button button-purple',() => enter())));
      if (animate) ripple(posts);
      return;
    }
    const query = new URLSearchParams({topic,q:search.value.trim(),sort:sort.value,page:String(targetPage),mine:mine ? '1' : '0'});
    const result = await api('posts?' + query);
    if (request !== sequence) return;
    page = targetPage;
    if (!append) posts.replaceChildren();
    const cards = result.posts.map(makeCard);
    posts.append(...cards);
    if (animate && append) cards.forEach(playRipple);
    if (!posts.children.length) {
      const filtered = search.value.trim() || topic;
      posts.append(filtered
        ? message('No matching posts','Try another search or choose a different topic.')
        : message('No posts yet','Start a discussion and invite other builders to join.',button('New post','button button-purple',openCompose)));
    }
    $('#more').hidden = !result.more;
    $('#board-status').textContent = posts.querySelectorAll('article').length + ' posts shown.';
    if (animate && !append) ripple(posts);
  } catch (failure) {
    if (request !== sequence) return;
    if (append) $('#more').hidden = false;
    else posts.replaceChildren(message('Couldn’t load posts',failure.message,button('Try again','button button-quiet',() => refreshBoard())));
  }
}
$('#more').onclick = () => refreshBoard({append:true,animate:true});
search.addEventListener('input',() => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refreshBoard({animate:true}),180);
});
sort.addEventListener('change',() => refreshBoard({animate:true}));

function showReplyForm(id, content) {
  if (!user) {
    content.append(button('Join to reply','button button-purple',() => enter({after:async () => {
      if (!thread.open) return;
      await loadThread(id);
      thread.querySelector('.reply-form textarea')?.focus();
    }})));
    return;
  }
  const form = element('form','reply-form');
  const label = element('label','','Your reply');
  const input = element('textarea');
  input.name = 'body';
  input.rows = 3;
  input.minLength = 3;
  input.maxLength = 2000;
  input.required = true;
  input.placeholder = 'Share an idea, a question, or how you can help.';
  label.append(input);
  const error = element('p','form-error');
  error.setAttribute('role','alert');
  error.hidden = true;
  const submit = element('button','button button-purple','Post reply');
  submit.type = 'submit';
  form.append(label,error,submit);
  form.onsubmit = async event => {
    event.preventDefault();
    submit.disabled = true;
    error.hidden = true;
    try {
      await api('posts/' + id + '/replies','POST',{body:input.value});
      await loadThread(id);
      refreshBoard();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  };
  content.append(form);
}
function confirmDelete(target) {
  const confirmation = $('#delete-confirm');
  $('#delete-title').textContent = 'Delete this ' + target + '?';
  $('#delete-description').textContent = target === 'post'
    ? 'This permanently deletes the post and its replies.'
    : 'This permanently deletes the reply.';
  $('#delete-submit').textContent = 'Delete ' + target;
  confirmation.returnValue = 'cancel';
  return new Promise(resolve => {
    confirmation.addEventListener('close',() => resolve(confirmation.returnValue === 'delete'),{once:true});
    confirmation.showModal();
  });
}
function renderThread({post,replies,moreReplies}) {
  $('#thread-title').textContent = post.title;
  const badges = $('#thread-badges');
  badges.replaceChildren();
  describe(post,badges);
  const content = $('#thread-content');
  content.replaceChildren(
    element('p','thread-byline',post.author + (post.createdAt ? ' · ' + timestamp(post.createdAt) : '')),
    element('p','thread-body',post.body),
  );
  const actions = element('div','thread-actions');
  const notice = element('p','thread-status');
  notice.setAttribute('role','status');
  notice.hidden = true;
  const report = text => { notice.textContent = text; notice.hidden = false; };
  const copy = button('Copy link','button button-quiet',async () => {
    try { await navigator.clipboard.writeText(location.href); report('Discussion link copied.'); }
    catch { report('You can copy the discussion link from your address bar.'); }
  });
  actions.append(copy);
  function mutate(label, method, path, data, after, className='button button-quiet') {
    const control = button(label,className,async () => {
      control.disabled = true;
      try {
        if (method === 'DELETE' && !await confirmDelete(path.startsWith('posts/') ? 'post' : 'reply')) return;
        await api(path, method, data);
        await after();
        refreshBoard();
      }
      catch (failure) { report(failure.message); }
      finally { control.disabled = false; }
    });
    return control;
  }
  if (post.canEdit) {
    actions.append(
      mutate(post.status === 'closed' ? 'Reopen' : 'Mark resolved','PATCH','posts/' + post.id,{status:post.status === 'closed' ? 'open' : 'closed'},() => loadThread(post.id)),
      mutate('Delete post','DELETE','posts/' + post.id,undefined,() => thread.close(),'button button-quiet danger'),
    );
  }
  content.append(actions,notice,element('h3','replies-title','Discussion'));
  if (post.example) {
    content.append(element('p','no-replies','This is an example. Start a post of your own to open a discussion.'));
    const start = button('Write a post','button button-purple',() => { thread.close(); openCompose(); });
    content.append(start);
    return;
  }
  if (!replies.length) content.append(element('p','no-replies','Be the first to reply.'));
  if (moreReplies) content.append(element('p','no-replies','Showing the 100 most recent replies.'));
  for (const reply of replies) {
    const item = element('article','reply');
    const meta = element('div','reply-meta');
    meta.append(element('strong','',reply.author),element('span','',timestamp(reply.createdAt)));
    if (reply.canEdit) meta.append(mutate('Delete reply','DELETE','replies/' + reply.id,undefined,() => loadThread(post.id),'link-button danger'));
    item.append(meta,element('p','reply-body',reply.body));
    content.append(item);
  }
  if (post.status === 'closed') content.append(element('p','no-replies','This discussion has been marked resolved.'));
  else showReplyForm(post.id,content);
}
async function loadThread(id) {
  const request = ++threadSequence;
  const replacingThread = thread.open;
  $('#thread-title').textContent = 'Discussion';
  $('#thread-badges').replaceChildren();
  $('#thread-content').replaceChildren(element('p','loading','Loading discussion…'));
  if (!thread.open) thread.showModal();
  try {
    const details = await api('posts/' + encodeURIComponent(id));
    if (request === threadSequence && thread.open) {
      renderThread(details);
      if (replacingThread) ripple($('#thread-content'));
    }
  } catch (failure) {
    if (request === threadSequence && thread.open) $('#thread-content').replaceChildren(message('Couldn’t open discussion',failure.message));
  }
}
let boardHash = '#board';
const sectionTargets = new Map([
  ['', '.hero'],
  ['#top', '.hero'],
  ['#board', '#board'],
  ['#mine', '#board'],
  ['#starters', '#starters'],
  ['#projects', '#projects'],
]);
function navigate(animate = false) {
  const match = location.hash.match(/^#post\/([a-z\d-]+)$/i);
  if (match) { loadThread(match[1]); return; }
  boardHash = isMine() ? '#mine' : '#board';
  if (thread.open) thread.close();
  const target = sectionTargets.get(location.hash);
  if (animate && target && target !== '#board') ripple($(target));
  refreshBoard({animate:animate && target === '#board'});
  if (isMine()) $('#board').scrollIntoView();
}
thread.addEventListener('close',() => {
  threadSequence++;
  if (location.hash.startsWith('#post/')) {
    history.replaceState(null,'',boardHash);
    refreshBoard({animate:true});
  }
});
const account = $('#account');
function updateAccount() {
  $('#account-join').hidden = Boolean(user);
  $('#account-guest').hidden = user?.mode !== 'guest';
  account.hidden = user?.mode !== 'chatgpt';
  account.href = authLink('/signout-with-chatgpt');
}
window.addEventListener('hashchange',() => { updateAccount(); navigate(!document.documentElement.classList.contains('swipe-transition')); });
document.addEventListener('click',event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const anchor = event.target.closest('a[href^="#"]');
  const hash = anchor?.getAttribute('href');
  const target = sectionTargets.get(hash);
  if (target && hash === location.hash) ripple($(target === '#board' ? '#posts' : target));
});
try { ({user} = await api('session')); }
catch { user = null; }
updateAccount();
if (location.hash.startsWith("#post/")) refreshBoard();
navigate();
const returnUrl = new URL(location.href);
const composeKind = returnUrl.searchParams.get('compose');
if (Object.hasOwn(kinds,composeKind)) {
  const starter = returnUrl.searchParams.get('starter');
  returnUrl.searchParams.delete('compose');
  returnUrl.searchParams.delete('starter');
  history.replaceState(history.state,'',returnUrl);
  openCompose(composeKind,starter);
}
