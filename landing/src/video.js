// Video: plays muted on a loop inside the hero monitor. Clicking the screen
// opens a slightly bigger player (not full screen) that continues from the same
// moment with sound. Closes on the X, a backdrop click or Esc, then the muted
// loop resumes. The file lives at public/video/dayframe.mp4.

export function initVideo() {
  const small = document.getElementById("screenvid");
  const modal = document.getElementById("vmodal");
  const big = document.getElementById("vplayer");
  const screen = document.querySelector(".hero .monitor .screen");
  if (!small) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  small.muted = true;
  if (reduced) small.removeAttribute("autoplay");
  else {
    const kick = () => modal?.hidden !== false && small.paused && small.play().catch(() => {});
    kick();
    small.addEventListener("canplay", kick, { once: true });
    // the intro loader can delay it; try again when the page is revealed
    new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  if (!modal || !big || !screen) return;

  big.addEventListener("loadedmetadata", () => {
    if (big.videoWidth && big.videoHeight)
      modal.querySelector(".vframe").style.setProperty("--ar", (big.videoWidth / big.videoHeight).toFixed(4));
  });

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.documentElement.classList.add("v-lock");
    requestAnimationFrame(() => modal.classList.add("open"));
    modal.querySelector(".vclose").focus({ preventScroll: true });
    small.pause();
    if (small.currentTime) big.currentTime = small.currentTime;
    big.muted = false;
    big.play().catch(() => {});
  }
  function close() {
    modal.classList.remove("open");
    big.pause();
    document.documentElement.classList.remove("v-lock");
    setTimeout(() => (modal.hidden = true), 450);
    if (!reduced) {
      small.currentTime = big.currentTime || small.currentTime;
      small.play().catch(() => {});
    }
    lastFocus?.focus?.({ preventScroll: true });
  }

  screen.addEventListener("click", open);
  modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) close();
  });
}
