// Custom cursor: a dot that tracks the pointer exactly, and a ring that
// trails it. Over links and buttons the ring snaps into a rounded "frame"
// (a nod to Dayframe). Only on mouse/trackpad, never on touch, and off
// when the user prefers reduced motion.

export function initCursor() {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduced) return;

  const dot = document.createElement("div");
  const ring = document.createElement("div");
  dot.className = "cur-dot";
  ring.className = "cur-ring";
  dot.setAttribute("aria-hidden", "true");
  ring.setAttribute("aria-hidden", "true");
  document.body.append(ring, dot);
  document.documentElement.classList.add("has-cursor");

  const pos = { x: -100, y: -100 };
  const ringPos = { x: -100, y: -100 };
  let shown = false;

  window.addEventListener("pointermove", (e) => {
    pos.x = e.clientX;
    pos.y = e.clientY;
    if (!shown) {
      ringPos.x = pos.x;
      ringPos.y = pos.y;
      shown = true;
      document.documentElement.classList.add("cur-on");
    }
    const hit = e.target.closest?.("a, button, [role='button'], .tall, .wide, .step");
    ring.classList.toggle("is-link", !!hit);
  });
  document.addEventListener("pointerleave", () => {
    shown = false;
    document.documentElement.classList.remove("cur-on");
  });
  window.addEventListener("pointerdown", () => ring.classList.add("is-down"));
  window.addEventListener("pointerup", () => ring.classList.remove("is-down"));

  function tick() {
    ringPos.x += (pos.x - ringPos.x) * 0.2;
    ringPos.y += (pos.y - ringPos.y) * 0.2;
    dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`;
    requestAnimationFrame(tick);
  }
  tick();
}
