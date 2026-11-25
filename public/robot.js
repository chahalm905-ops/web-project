const rail = document.querySelector('[data-robot-rail]');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const robot = rail.querySelector('.robot');
let frame = 0;
let rest;

function updateRobot() {
  frame = 0;
  const distance = document.documentElement.scrollHeight - innerHeight;
  const progress = distance > 0 ? Math.min(1,Math.max(0,scrollY / distance)) : 0;
  rail.style.setProperty('--robot-y',Math.max(0,rail.clientHeight - robot.offsetHeight) * progress + 'px');
}
function animateRobot() {
  if (motion.matches) return;
  if (!frame) frame = requestAnimationFrame(updateRobot);
  rail.classList.add('is-moving');
  clearTimeout(rest);
  rest = setTimeout(() => rail.classList.remove('is-moving'),200);
}
if (!motion.matches) updateRobot();
addEventListener('scroll',animateRobot,{passive:true});
addEventListener('resize',() => {
  if (!motion.matches) updateRobot();
});
if (!motion.matches && typeof IntersectionObserver === 'function') {
  const reveals = new IntersectionObserver((entries,observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('reveal-in');
      observer.unobserve(entry.target);
    }
  },{threshold:.15});
  document.querySelectorAll('[data-reveal]').forEach(element => reveals.observe(element));
}
