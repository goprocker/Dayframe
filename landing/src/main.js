import "./styles/base.css";
import "./styles/clouds.css";
import "./styles/sections.css";
import { initClouds } from "./clouds.js";

// Version from package.json, injected by vite.config.js
document.querySelectorAll("[data-version]").forEach((el) => (el.textContent = __APP_VERSION__));

// Loader: counts to 100, then fades out
(() => {
  const loader = document.getElementById("loader");
  const bar = loader.querySelector(".bar i");
  const pct = document.getElementById("pct");
  let p = 0;
  const t = setInterval(() => {
    p = Math.min(100, p + Math.ceil(Math.random() * 9));
    bar.style.width = `${p}%`;
    pct.textContent = p;
    if (p >= 100) {
      clearInterval(t);
      setTimeout(() => loader.classList.add("done"), 250);
    }
  }, 45);
})();

// Meadow flowers in the hero
(() => {
  const host = document.getElementById("flowers");
  const colors = ["#f08a3c", "#f6b24a", "#e85d8a", "#8b6fd6", "#f3e1a0", "#d94f4f", "#fff1e0"];
  for (let i = 0; i < 140; i++) {
    const f = document.createElement("i");
    const s = 4 + Math.random() * 16;
    f.style.cssText = `left:${Math.random() * 100}%;top:${72 + Math.pow(Math.random(), 0.7) * 28}%;width:${s}px;height:${s}px;background:${colors[i % colors.length]};opacity:${0.6 + Math.random() * 0.4}`;
    host.appendChild(f);
  }
})();

initClouds();

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
