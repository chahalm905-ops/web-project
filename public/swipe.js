(() => {
  const sections = [
    {url:'/#top',name:'Home'},
    {url:'/#board',name:'Explore'},
    {url:'/#mine',name:'My posts'},
    {url:'/#projects',name:'Project contact'},
    {url:'/help',name:'Help'},
  ];
  const controls = 'a,button,input,select,textarea,label,summary,[contenteditable],dialog';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'agentcommons-swipe-arrival';
  const edge = 26;
  let start, overlay, wave, group, label, animation;
  let progress = 0;
  let navigating = false;
  let direction = 'left';

  function clear() {
    cancelAnimationFrame(animation);
    overlay?.remove();
    overlay = undefined;
    progress = 0;
    document.documentElement.classList.remove('swipe-transition');
  }

  function draw(value) {
    progress = value;
    if (!overlay) return;
    const x = 1020 - value * 1150;
    const swell = Math.sin(value * Math.PI) * 65;
    wave.setAttribute('d',`M ${x} -10 C ${x - swell} 180 ${x + swell} 320 ${x} 500 S ${x - swell} 820 ${x} 1010 L 1010 1010 L 1010 -10 Z`);
    label.style.opacity = String(Math.min(1,value * 5));
  }

  function prepare(nextDirection, text) {
    direction = nextDirection;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'swipe-water';
      overlay.setAttribute('aria-hidden','true');
      overlay.innerHTML = `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" focusable="false">
        <defs><linearGradient id="swipe-water-color" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8be0df"/><stop offset=".45" stop-color="#b6b1f5"/><stop offset="1" stop-color="#7151ca"/></linearGradient></defs>
        <g><path fill="url(#swipe-water-color)" stroke="#e8ffff" stroke-width="5"/></g>
      </svg><span class="swipe-water-label"></span>`;
      wave = overlay.querySelector('path');
      group = overlay.querySelector('g');
      label = overlay.querySelector('span');
      document.body.append(overlay);
    }
    overlay.dataset.direction = direction;
    group.setAttribute('transform',direction === 'right' ? 'translate(1000 0) scale(-1 1)' : '');
    label.textContent = text;
    draw(progress);
  }

  function animateTo(end, duration, done = () => {}) {
    cancelAnimationFrame(animation);
    const from = progress;
    const began = performance.now();
    function frame(now) {
      const fraction = Math.min(1,(now - began) / duration);
      draw(from + (end - from) * (1 - Math.pow(1 - fraction,3)));
      if (fraction < 1) animation = requestAnimationFrame(frame);
      else done();
    }
    animation = requestAnimationFrame(frame);
  }

  function cancelGesture() {
    start = undefined;
    if (overlay && !navigating) animateTo(0,180,clear);
  }

  function destinationFor(dx) {
    const activeUrl = location.pathname === '/' && !location.hash ? '/#top' : location.pathname + location.hash;
    const current = sections.findIndex(section => section.url === activeUrl);
    const index = current >= 0 ? current : location.pathname === '/help' ? sections.length - 1 : 1;
    return sections[index + (dx < 0 ? 1 : -1)];
  }

  function threshold() {
    return Math.min(110,Math.max(56,innerWidth * .18));
  }

  function navigate(destination) {
    const url = new URL(destination.url,location.href);
    if (url.origin !== location.origin) return cancelGesture();
    navigating = true;
    const leave = () => {
      if (url.pathname === location.pathname && url.search === location.search) {
        location.assign(url.href);
        if (overlay) {
          prepare(direction === 'left' ? 'right' : 'left','');
          animateTo(0,440,() => {
            clear();
            navigating = false;
          });
        } else {
          navigating = false;
        }
        return;
      }
      if (!reducedMotion.matches) {
        try {
          sessionStorage.setItem(storageKey,JSON.stringify({path:url.pathname,direction,time:Date.now()}));
        } catch { /* Navigation also works when browser storage is unavailable. */ }
      }
      location.assign(url.href);
    };
    if (reducedMotion.matches) {
      clear();
      leave();
      return;
    }
    document.documentElement.classList.add('swipe-transition');
    prepare(direction,`Opening ${destination.name}`);
    animateTo(1,260,leave);
  }

  document.addEventListener('touchstart',event => {
    if (navigating) return;
    start = undefined;
    clear();
    if (event.touches.length !== 1 || document.querySelector('dialog[open]')) return;
    if (event.target.closest(controls)) return;
    const touch = event.touches[0];
    if (touch.clientX < edge || touch.clientX > innerWidth - edge) return;
    start = {id:touch.identifier,x:touch.clientX,y:touch.clientY,time:performance.now()};
  },{passive:true});

  document.addEventListener('touchmove',event => {
    if (!start || navigating) return;
    if (event.touches.length !== 1 || document.querySelector('dialog[open]')) return cancelGesture();
    const touch = event.touches[0];
    if (touch.identifier !== start.id) return cancelGesture();
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dy) > 55 || (Math.abs(dy) > 12 && Math.abs(dy) * 1.5 > Math.abs(dx))) return cancelGesture();
    const destination = destinationFor(dx);
    if (Math.abs(dx) < 10 || !destination) {
      clear();
      return;
    }
    direction = dx < 0 ? 'left' : 'right';
    if (reducedMotion.matches) return;
    const page = destination.name;
    prepare(direction,Math.abs(dx) >= threshold() ? `Release for ${page}` : `Swipe to ${page}`);
    draw(Math.min(.58,Math.abs(dx) / innerWidth * .8));
  },{passive:true});

  document.addEventListener('touchcancel',cancelGesture,{passive:true});

  document.addEventListener('touchend',event => {
    const gesture = start;
    start = undefined;
    if (navigating) return;
    if (!gesture || event.touches.length || performance.now() - gesture.time > 1500) return cancelGesture();
    const touch = Array.from(event.changedTouches).find(item => item.identifier === gesture.id);
    if (!touch) return cancelGesture();
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (Math.abs(dx) < threshold() || Math.abs(dy) > 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return cancelGesture();
    const destination = destinationFor(dx);
    if (!destination) return cancelGesture();
    direction = dx < 0 ? 'left' : 'right';
    navigate(destination);
  },{passive:true});

  // Clear a completed wave if the browser restores this page from its back cache.
  window.addEventListener('pageshow',event => {
    if (event.persisted) {
      start = undefined;
      navigating = false;
      clear();
    }
  });

  try {
    const arrival = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    sessionStorage.removeItem(storageKey);
    if (arrival?.path === location.pathname && Date.now() - arrival.time < 10000 && !reducedMotion.matches) {
      document.documentElement.classList.add('swipe-transition');
      prepare(arrival.direction === 'left' ? 'right' : 'left','');
      draw(1);
      animateTo(0,440,clear);
    }
  } catch { /* A restricted storage policy must not disable swipe navigation. */ }
})();
