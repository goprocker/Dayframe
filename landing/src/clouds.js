// Cumulus clouds, painted once onto a canvas.
//
// A cloud is a faint haze, grey "shade" puffs offset downward (the shadowed
// underside) and bright puffs on top, piled into a dome over a flat base.
// Small rim puffs plus a light blur give the bumpy vapour edge.
// Each cloud is drawn once into a <canvas>; scrolling and drifting then
// only move a static bitmap. (Live SVG-filtered clouds froze Chrome on
// scroll, and url() filters on canvas were too slow to paint.)

const rand = (min, max) => min + Math.random() * (max - min);

const PALETTE = {
  sky:  { shade: ["#c3d1de", "#aebfcf", "rgba(158,178,198,0.9)"], lit: ["#ffffff", "#fbfdff", "#e6eef5", "rgba(214,226,236,0.95)"] },
  far:  { shade: ["#d3dee8", "#c2d0dd", "rgba(194,208,221,0.9)"], lit: ["#ffffff", "#f8fbfd", "#e9f0f6", "rgba(220,230,239,0.9)"] },
  band: { shade: ["#eef2f6", "#e6edf3", "rgba(230,237,243,0.9)"], lit: ["#ffffff", "#fdfeff", "#f6f9fb", "rgba(246,249,251,0.95)"] },
};

// does this browser apply ctx.filter (Chrome/Edge/Firefox yes, Safari no)?
const canFilter = (() => {
  const c = document.createElement("canvas").getContext("2d");
  return c && "filter" in c;
})();

function drawPuff(ctx, cx, cy, r, squash, stops, isLit) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, squash);
  const fx = isLit ? -0.1 * r : 0;
  const fy = isLit ? -0.2 * r : -0.2 * r;
  const g = ctx.createRadialGradient(fx, fy, 0, 0, 0, r);
  if (isLit) {
    // mostly flat so overlapping puffs merge into one mass (no "bubbles")
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.55, stops[1]);
    g.addColorStop(0.8, stops[2]);
    g.addColorStop(1, "rgba(255,255,255,0)");
  } else {
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.7, stops[1]);
    g.addColorStop(0.97, stops[2]);
    g.addColorStop(1, "rgba(255,255,255,0)");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paint(w, h, tone) {
  // canvas is padded around the cloud box so billows and haze fit
  const padX = w * 0.15;
  const padTop = h * 0.6;
  const padBot = h * 0.7;
  const cw = Math.ceil(w + padX * 2);
  const ch = Math.ceil(h + padTop + padBot);

  const src = document.createElement("canvas");
  src.width = cw;
  src.height = ch;
  const ctx = src.getContext("2d");
  ctx.translate(padX, padTop);

  const pal = PALETTE[tone];
  const base = h * 0.82;
  const shade = [];
  const lit = [];

  const n = Math.max(6, Math.round(w / 45));
  for (let i = 0; i < n; i++) {
    const t = (i + rand(-0.3, 0.3)) / (n - 1);
    const bell = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.8;
    const r = h * (0.16 + 0.34 * bell) * rand(0.85, 1.15);
    const cx = w * (0.06 + 0.88 * t);
    const cy = base - r * rand(0.35, 0.75);
    shade.push([cx + r * 0.06, cy + r * 0.3, r * 1.05, 0.72]);
    lit.push([cx, cy, r, 1]);
    // small puffs along the upper rim give the bumpy, cauliflower edge
    for (let k = 0; k < 4; k++) {
      const a = rand(Math.PI * 1.05, Math.PI * 1.95);
      const rr = r * rand(0.18, 0.3);
      lit.push([cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82, rr, 1]);
    }
  }
  const towers = Math.round(rand(2, 4));
  for (let i = 0; i < towers; i++) {
    const cx = w * rand(0.28, 0.72);
    const r = h * rand(0.2, 0.3);
    const cy = base - h * rand(0.5, 0.68);
    shade.push([cx + r * 0.1, cy + r * 0.25, r, 1]);
    lit.push([cx, cy, r, 1]);
  }
  shade.forEach(([x, y, r, s]) => drawPuff(ctx, x, y, r, s, pal.shade, false));
  lit.forEach(([x, y, r, s]) => drawPuff(ctx, x, y, r, s, pal.lit, true));

  // final canvas: haze underneath, then the puffs through the edge filter
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  const o = out.getContext("2d");

  o.save();
  o.filter = canFilter ? "blur(18px)" : "none";
  const hz = o.createRadialGradient(cw / 2, padTop + h * 0.7, 0, cw / 2, padTop + h * 0.7, w * 0.6);
  hz.addColorStop(0, "rgba(255,255,255,0.35)");
  hz.addColorStop(1, "rgba(255,255,255,0)");
  o.fillStyle = hz;
  o.fillRect(0, 0, cw, ch);
  o.restore();

  // plain blur only: url() SVG filters on canvas are far too slow
  o.filter = canFilter ? (tone === "far" ? "blur(4px)" : tone === "band" ? "blur(3.5px)" : "blur(2.2px)") : "none";
  o.drawImage(src, 0, 0);
  o.filter = "none";

  out.style.cssText = `left:${-padX}px;top:${-padTop}px;width:${cw}px;height:${ch}px`;
  return out;
}

/**
 * @param {object} o
 * @param {string} o.x  CSS left
 * @param {string} o.y  CSS top
 * @param {number} o.w  width in px
 * @param {number} o.h  height in px
 * @param {boolean} [o.far]   hazier, smaller, more transparent
 * @param {boolean} [o.flip]  hang downward (for bands under a light section)
 * @param {boolean} [o.band]  light underside, for cloud banks over white
 */
export function makeCloud({ x, y, w, h, far = false, flip = false, band = false, drift = 60, dx = 40 }) {
  const el = document.createElement("div");
  el.className = `cloud${far ? " far" : ""}${flip ? " flip" : ""}`;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `left:${x};top:${y};width:${w}px;height:${h}px;--drift:${drift}s;--dx:${dx}px;animation-delay:${-rand(0, drift)}s`;
  el.appendChild(paint(w, h, band || flip ? "band" : far ? "far" : "sky"));
  return el;
}

// Hero layout, balanced around the headline and monitor.
const HERO = [
  { x: "-3%", y: "9%", w: 440, h: 170 },
  { x: "74%", y: "15%", w: 330, h: 120, far: true },
  { x: "71%", y: "50%", w: 470, h: 190 },
  { x: "-5%", y: "56%", w: 360, h: 140, far: true },
  { x: "36%", y: "3%", w: 220, h: 80, far: true },
];

// Band: a dense bank of cloud straddling the seam between two sections.
function fillBand(band) {
  const flip = band.classList.contains("flip");
  const step = 300;
  const count = Math.ceil(window.innerWidth / step) + 2;
  for (let i = 0; i < count; i++) {
    const w = rand(380, 520);
    const h = rand(200, 260);
    band.appendChild(
      makeCloud({
        x: `${i * step - w / 2 + rand(-30, 30)}px`,
        y: flip ? `${rand(-6, 6)}%` : `${rand(-4, 8)}%`,
        w,
        h,
        flip,
        band: true,
        drift: rand(70, 110),
        dx: rand(10, 25),
      }),
    );
  }
}

function scatter(section, n) {
  for (let i = 0; i < n; i++) {
    const far = i % 2 === 1;
    const w = far ? rand(220, 300) : rand(340, 460);
    section.prepend(
      makeCloud({
        x: `${(i / n) * 90 + rand(-8, 8)}%`,
        y: `${rand(32, 68)}%`, // low enough to clear headings, high enough not to be cut at the bottom
        w,
        h: w * rand(0.36, 0.42),
        far,
        drift: rand(40, 80),
      }),
    );
  }
}

export function initClouds() {
  document.querySelectorAll("[data-clouds]").forEach((section) => {
    const kind = section.dataset.clouds;
    if (kind === "hero") HERO.forEach((c) => section.prepend(makeCloud(c)));
    else scatter(section, 2);
  });
  document.querySelectorAll(".cloud-band").forEach(fillBand);
}
