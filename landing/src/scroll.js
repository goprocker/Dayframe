// Scroll-driven motion. One rAF-throttled scroll handler computes a
// 0..1 progress for each tracked element and writes transforms directly.
//
//   hero      headline lifts and fades (the monitor stays put)
//   tour      pinned; the card reel slides horizontally with scroll
//   clouds    parallax (far clouds move slower)
//   cards     glass cards and timeline steps fly in and settle at a tilt
//   screens   wide cards scale up into place
//   footer    giant wordmark rises
//   nav       switches to a dark-on-light style over light sections

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isWide = () => window.innerWidth > 760;

// progress of an element passing through the viewport:
// 0 when its top meets `start` (fraction of vh), 1 when it reaches `end`
function prog(el, start = 1, end = 0.35) {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return clamp((vh * start - r.top) / (vh * (start - end)));
}

export function initScroll() {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const bar = $(".progress i");
  const nav = $(".nav");
  const logo = $(".logo");
  const lightZones = $$("[data-nav='light']");

  const hero = $(".hero");
  const heroText = $$(".hero h1, .hero .sub, .hero .ctas");
  const heroClouds = $$(".hero > .cloud");

  const tour = $(".tour");
  const reel = $(".reel");

  const gcards = $$(".gcard");
  const gRot = [-4, -2, 3, -3];
  const gLift = [0, -12, 0, -10];

  const steps = $$(".step");
  const wides = $$(".wide");
  const talls = $$(".tall");
  const ghost = $("footer .ghost");
  const giant = $(".giant");

  const parallax = $$("section:not(.hero) > .cloud").map((el) => ({
    el,
    section: el.parentElement,
    speed: el.classList.contains("far") ? 0.12 : 0.25,
  }));

  // pinned tour length = one screen + however far the reel must slide
  function sizeTour() {
    if (!isWide()) {
      tour.style.height = "";
      return;
    }
    reel.style.transform = "";
    const dist = Math.max(0, reel.scrollWidth - reel.clientWidth);
    tour.style.height = `${window.innerHeight + dist * 1.2 + 220}px`; // +220: room for the cloud band below
  }
  sizeTour();

  let ticking = false;

  function frame() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;

    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;

    // nav theme: is a light zone under the nav bar?
    const navY = 40;
    const light = lightZones.some((z) => {
      const r = z.getBoundingClientRect();
      return r.top <= navY && r.bottom >= navY;
    });
    nav.classList.toggle("on-light", light);
    document.body.classList.toggle("at-hero", y < hero.offsetHeight * 0.55);
    logo.classList.toggle("on-light", light);

    if (reduced) return;

    // hero
    const hp = clamp(y / (hero.offsetHeight * 0.8));
    heroText.forEach((el, i) => {
      el.style.transform = `translateY(${-hp * (90 + i * 30)}px)`;
      el.style.opacity = String(clamp(1 - hp * 1.6));
    });
    heroClouds.forEach((c) => {
      const left = c.offsetLeft + c.offsetWidth / 2 < hero.offsetWidth / 2;
      c.style.transform = `translate(${(left ? -1 : 1) * hp * 260}px, ${-hp * 80}px)`;
    });

    // tour: pinned horizontal reel
    if (isWide()) {
      const r = tour.getBoundingClientRect();
      const tp = clamp(-r.top / (tour.offsetHeight - vh));
      const dist = Math.max(0, reel.scrollWidth - reel.clientWidth);
      reel.style.transform = `translateX(${-tp * dist}px)`;
      talls.forEach((c, i) => {
        const wob = Math.sin(tp * Math.PI * 2 + i) * 2;
        c.style.transform = `translateY(${Math.cos(tp * Math.PI * 2 + i) * 10}px) rotate(${wob}deg)`;
      });
    } else {
      reel.style.transform = "";
      talls.forEach((c) => (c.style.transform = ""));
    }

    // cloud parallax
    parallax.forEach(({ el, section, speed }) => {
      const r = section.getBoundingClientRect();
      el.style.transform = `translateY(${(r.top + r.height / 2 - vh / 2) * -speed}px)`;
    });

    // wide cards: scale up into place
    wides.forEach((c, i) => {
      const p = ease(prog(c, 1.05, 0.55 + (i % 2) * 0.05));
      c.style.transform = `translateY(${(1 - p) * 80}px) scale(${lerp(0.88, 1, p)})`;
      c.style.opacity = String(lerp(0.2, 1, p));
    });

    // glass cards: fly up from scattered, settle into their tilt
    gcards.forEach((c, i) => {
      const p = ease(prog(c, 1.1, 0.5 + i * 0.04));
      const rot = lerp(gRot[i] * 4 + (i % 2 ? 12 : -12), gRot[i], p);
      c.style.transform = `translateY(${lerp(220, gLift[i], p)}px) rotate(${rot}deg)`;
      c.style.opacity = String(lerp(0, 1, clamp(p * 1.6)));
    });

    // timeline: giant title breathes, steps swing in from the sides
    if (giant) {
      const p = prog(giant, 1, 0.2);
      giant.style.transform = `scale(${lerp(0.85, 1.05, p)})`;
      giant.style.letterSpacing = `${lerp(-0.02, -0.06, p)}em`;
    }
    steps.forEach((c, i) => {
      const p = ease(prog(c, 1.1, 0.45));
      const side = i % 2 ? 1 : -1;
      const endRot = side < 0 ? -5 : 4;
      const endY = side < 0 ? 0 : 50;
      c.style.transform = `translate(${(1 - p) * side * 260}px, ${lerp(endY + 160, endY, p)}px) rotate(${lerp(side * 24, endRot, p)}deg)`;
      c.style.opacity = String(clamp(p * 1.8));
    });

    // footer wordmark rises
    if (ghost) {
      const p = ease(prog(ghost.parentElement, 1, 0.3));
      ghost.style.transform = `translate(-50%, ${lerp(10, -50, p)}%)`;
      ghost.style.opacity = String(lerp(0, 0.3, p));
    }
  }

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(frame);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    sizeTour();
    onScroll();
  });
  frame();
}
