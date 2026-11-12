import "./styles/base.css";
import "./styles/clouds.css";
import "./styles/sections.css";
import { initClouds } from "./clouds.js";
import { initScroll } from "./scroll.js";
import { initHero } from "./hero.js";
import { initCursor } from "./cursor.js";
import { initVideo } from "./video.js";
import { initDownloads } from "./downloads.js";

// Version from package.json, injected by vite.config.js
document.querySelectorAll("[data-version]").forEach((el) => (el.textContent = __APP_VERSION__));

// Loader: a day of tracking plays out on a 24h timeline, then the frame opens.
(() => {
  const loader = document.getElementById("loader");
  const segs = document.getElementById("lsegs");
  const head = document.getElementById("lhead");
  const clock = document.getElementById("lclock");
  const app = document.getElementById("lapp");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // [start hour, end hour, colour, label]
  const day = [
    [7.5, 8.2, "#f6b24a", "Mail"],
    [8.3, 10.6, "#7c8cff", "Visual Studio Code"],
    [10.7, 11.4, "#8be4ff", "Chrome"],
    [11.5, 12.6, "#7c8cff", "Visual Studio Code"],
    [13.6, 14.4, "#e85d8a", "Figma"],
    [14.5, 16.8, "#7c8cff", "Visual Studio Code"],
    [16.9, 17.6, "#9cc483", "Slack"],
    [17.7, 18.4, "#f6b24a", "Dayframe"],
  ];
  const els = day.map(([a, , c]) => {
    const el = document.createElement("i");
    el.style.cssText = `left:${(a / 24) * 100}%;width:0;background:${c};color:${c}`;
    segs.appendChild(el);
    return el;
  });
  const D = reduced ? 300 : 2400;
  let t0 = null;
  function step(ts) {
    t0 ??= ts;
    const p = Math.min(1, (ts - t0) / D);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease in-out
    const h = e * 24;
    head.style.left = `${e * 100}%`;
    const hh = p >= 1 ? 24 : Math.floor(h) % 24;
    const mm = p >= 1 ? 0 : Math.floor((h % 1) * 60);
    clock.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    let label = h < 7 ? "asleep" : h > 18.5 ? "day saved" : "idle";
    day.forEach(([a, b, , n], i) => {
      const w = Math.max(0, Math.min(h, b) - a);
      els[i].style.width = `${(w / 24) * 100}%`;
      if (h >= a && h <= b) label = n;
    });
    app.textContent = label;
    if (p < 1) requestAnimationFrame(step);
    else
      setTimeout(() => {
        loader.classList.add("done");
        document.body.classList.add("intro");
      }, 250);
  }
  requestAnimationFrame(step);
})();

initClouds();
initScroll();
initHero();
initCursor();
initVideo();
initDownloads();

// Reveal on scroll
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.15 },
);
document.querySelectorAll(".rv").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 80}ms`;
  io.observe(el);
});
