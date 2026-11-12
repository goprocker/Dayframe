// Cumulus clouds built from overlapping soft puffs.
//
// A cloud is: a faint haze ellipse, a layer of grey "shade" puffs offset
// downward (the shadowed underside), and a layer of bright puffs on top.
// The puffs are piled into a dome over a flat base, the base is clipped
// flat, and the #cloud-edge SVG filter (index.html) roughens and softens
// the outline so it reads as vapour rather than circles.

const rand = (min, max) => min + Math.random() * (max - min);

function puff(x, y, r, cls, squash = 1) {
  const p = document.createElement("i");
  p.className = cls;
  const ry = r * squash;
  p.style.cssText = `left:${x - r}px;top:${y - ry}px;width:${r * 2}px;height:${ry * 2}px`;
  return p;
}

/**
 * @param {object} o
 * @param {string} o.x  CSS left
 * @param {string} o.y  CSS top
 * @param {number} o.w  width in px
 * @param {number} o.h  height in px
 * @param {boolean} [o.far]   hazier, smaller, more transparent
 * @param {boolean} [o.flip]  hang downward (for bands under a light section)
 */
export function makeCloud({ x, y, w, h, far = false, flip = false, drift = 60, dx = 40 }) {
  const el = document.createElement("div");
  el.className = `cloud${far ? " far" : ""}${flip ? " flip" : ""}`;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `left:${x};top:${y};width:${w}px;height:${h}px;--drift:${drift}s;--dx:${dx}px;animation-delay:${-rand(0, drift)}s`;

  const haze = document.createElement("div");
  haze.className = "c-haze";
  el.appendChild(haze);

  // the body extends PAD above the cloud box so tall billows aren't masked off
  const PAD = 0.6;
  const body = document.createElement("div");
  body.className = "c-body";
  body.style.cssText = `top:${-h * PAD}px;height:${h * (1 + PAD)}px`;
  const base = h * (PAD + 0.82);
  const shade = [];
  const lit = [];

  // main dome: puffs biggest in the middle, smaller at the ends
  const n = Math.max(6, Math.round(w / 45));
  for (let i = 0; i < n; i++) {
    const t = (i + rand(-0.3, 0.3)) / (n - 1); // 0..1 across
    const bell = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.8;
    const r = h * (0.16 + 0.34 * bell) * rand(0.85, 1.15);
    const cx = w * (0.06 + 0.88 * t);
    const cy = base - r * rand(0.35, 0.75);
    shade.push(puff(cx + r * 0.06, cy + r * 0.3, r * 1.05, "s", 0.72));
    lit.push(puff(cx, cy, r, "l"));
  }
  // a few towers on top for a billowy crown
  const towers = Math.round(rand(2, 4));
  for (let i = 0; i < towers; i++) {
    const cx = w * rand(0.28, 0.72);
    const r = h * rand(0.2, 0.3);
    const cy = base - h * rand(0.5, 0.68);
    shade.push(puff(cx + r * 0.1, cy + r * 0.25, r, "s"));
    lit.push(puff(cx, cy, r, "l"));
  }

  body.append(...shade, ...lit);
  el.appendChild(body);
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
  const step = 210;
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
        y: `${rand(5, 80)}%`,
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
    else if (kind === "dusk") scatter(section, 4);
    else scatter(section, 3);
  });
  document.querySelectorAll(".cloud-band").forEach(fillBand);
}
