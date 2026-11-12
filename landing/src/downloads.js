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

// Show the download total wherever [data-downloads] appears: website clicks
// (Abacus) plus installer downloads from GitHub Releases. Hidden until the
// total is above zero, so failed fetches leave no trace.
const SITE = "https://abacus.jasoncameron.dev/get/dayframe-site/downloads";
const GH = "https://api.github.com/repos/goprocker/Dayframe/releases";

const get = (url, pick) =>
  fetch(url).then((r) => (r.ok ? r.json() : null)).then(pick).catch(() => 0);

export async function showDownloadCount() {
  const els = document.querySelectorAll("[data-downloads]");
  if (!els.length) return;
  const [site, gh] = await Promise.all([
    get(SITE, (d) => Number(d?.value) || 0),
    get(GH, (rs) =>
      (rs || []).flatMap((r) => r.assets || [])
        .filter((a) => a.name.endsWith(".exe"))
        .reduce((n, a) => n + a.download_count, 0)),
  ]);
  const n = site + gh;
  if (!n) return;
  els.forEach((el) => {
    el.querySelector("span").textContent = n.toLocaleString();
    el.hidden = false;
  });
}
