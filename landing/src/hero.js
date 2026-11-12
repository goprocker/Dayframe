// Living hero: pointer + scroll parallax on the meadow, and drifting petals
// and butterflies that scatter away from the pointer. The monitor stays still.

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (a, b) => a + Math.random() * (b - a);

export function initHero() {
  const hero = document.querySelector(".hero");
  const scene = hero.querySelector(".scene");
  const canvas = hero.querySelector(".petals");
  if (reduced) return;

  // ---------- pointer + scroll parallax ----------
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  const ptr = { x: -9999, y: -9999 }; // in hero coords, for petals

  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    target.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
  });
  hero.addEventListener("pointerleave", () => {
    target.x = target.y = 0;
    ptr.x = ptr.y = -9999;
  });

  // ---------- petals & butterflies ----------
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = 0;
  let H = 0;
  function size() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size);

  const PETAL = ["#ff9ec8", "#ffc2dc", "#f7a1c4", "#ffd6e7", "#fbe3a6"];
  const parts = [];
  const N = Math.round(Math.min(90, W / 16));
  for (let i = 0; i < N; i++) parts.push(spawn(true));

  function spawn(anywhere) {
    const fly = Math.random() < 0.16;
    return {
      fly,
      x: anywhere ? rand(0, W) : rand(-40, W * 0.6),
      y: anywhere ? rand(0, H * 0.85) : rand(-40, -10),
      z: rand(0.4, 1.3), // depth: size + speed + parallax
      vx: rand(0.15, 0.6),
      vy: fly ? rand(-0.15, 0.15) : rand(0.25, 0.7),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.04, 0.04),
      ph: rand(0, Math.PI * 2),
      c: fly ? (Math.random() < 0.5 ? "#ffe066" : "#fff4b0") : PETAL[(Math.random() * PETAL.length) | 0],
    };
  }

  let t = 0;
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(hero);

  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    t += 1;

    // ease parallax toward the pointer; scroll progress through the hero
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    const sp = Math.min(1, window.scrollY / hero.offsetHeight);
    // set on the hero so both the back scene and the foreground layer read them
    hero.style.setProperty("--mx", cur.x.toFixed(4));
    hero.style.setProperty("--my", cur.y.toFixed(4));
    hero.style.setProperty("--sp", sp.toFixed(4));

    ctx.clearRect(0, 0, W, H);
    const wind = Math.sin(t / 240) * 0.35;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.ph += 0.03;
      p.x += (p.vx + wind) * p.z + Math.sin(p.ph) * 0.4;
      p.y += p.vy * p.z + (p.fly ? Math.sin(p.ph * 1.7) * 0.6 : 0);
      p.rot += p.vr;

      // scatter away from the pointer
      const dx = p.x - ptr.x;
      const dy = p.y - ptr.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 140 * 140) {
        const f = (1 - Math.sqrt(d2) / 140) * 3;
        const d = Math.sqrt(d2) || 1;
        p.x += (dx / d) * f;
        p.y += (dy / d) * f;
      }

      if (p.x > W + 40 || p.y > H + 40 || p.x < -80) parts[i] = spawn(false);

      // nearer particles drift more with the pointer
      const px = p.x - cur.x * 18 * p.z;
      const py = p.y - cur.y * 10 * p.z;
      const s = 3.2 * p.z;
      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = 0.55 + 0.4 * Math.min(1, p.z);
      ctx.fillStyle = p.c;
      if (p.fly) {
        // butterfly: two wings flapping
        const flap = Math.abs(Math.sin(p.ph * 4)) * 0.85 + 0.15;
        ctx.rotate(Math.sin(p.ph) * 0.4);
        ctx.beginPath();
        ctx.ellipse(-s * 0.7 * flap, 0, s * flap, s * 0.7, -0.4, 0, Math.PI * 2);
        ctx.ellipse(s * 0.7 * flap, 0, s * flap, s * 0.7, 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // petal: a tumbling ellipse
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.ph)) * 0.6 + 0.4);
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  tick();
}
