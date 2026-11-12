// Download counter. Each click on an installer link adds one hit to a public
// counter (Abacus, no sign-up, no cookies, no personal data sent).
//
// Your own downloads are NOT counted:
//   - anything on localhost / 127.0.0.1 is skipped automatically
//   - open the live site once with ?me=1 (e.g. https://yoursite/?me=1) on each
//     of your browsers; that browser is remembered and never counted
//   - ?me=0 undoes it
// See the total at https://abacus.jasoncameron.dev/get/dayframe-site/downloads

const HIT = "https://abacus.jasoncameron.dev/hit/dayframe-site/downloads";
const FLAG = "dayframe-owner";

function isOwner() {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return true;
  try {
    const me = new URLSearchParams(location.search).get("me");
    if (me === "1") localStorage.setItem(FLAG, "1");
    if (me === "0") localStorage.removeItem(FLAG);
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function initDownloads() {
  const owner = isOwner();
  if (owner) console.info("[Dayframe] owner browser: downloads are not counted");
  document.querySelectorAll('a[href$="-setup.exe"]').forEach((a) =>
    a.addEventListener("click", () => {
      if (owner) return;
      fetch(HIT, { keepalive: true, mode: "no-cors" }).catch(() => {});
    })
  );
}
