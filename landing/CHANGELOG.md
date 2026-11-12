# Changelog

All notable changes to the Dayframe landing page. Versions follow [SemVer](https://semver.org/); bump `version` in `package.json` and add an entry here.

## [0.9.0] — 2026-11-12

### Changed
- Hero monitor is now a retro TV built in CSS: dark grey body, recessed bezel, glowing blue rounded CRT with scanlines and glare, control strip (buttons, cassette deck, knobs) and speaker grille. It plays the video exactly as before (muted loop; click for the popup with sound).

## [0.8.0] — 2026-11-12

### Changed
- The hero monitor now plays the video muted on a loop (held still for reduced motion). Clicking the screen opens the big player, which continues from the same moment with sound; its fullscreen control goes full screen. Closing resumes the muted loop.
- The big player sizes itself to the video's aspect ratio and fits both the window width and height, so there are no black bars.
- The play button is replaced by a small fullscreen icon in the screen's corner.
- Hero shows the Dayframe icon and serif wordmark top-left; it shrinks into the nav logo after the hero.

## [0.7.0] — 2026-11-12

### Added
- Video popup (`src/video.js`): a pulsing play button on the hero monitor (or a click on its screen) opens a large rounded player over a blurred page, with a close button above it. Closes on the button, a backdrop click or Esc; pauses on close and returns focus. The video file goes at `public/video/dayframe.mp4`.

## [0.6.0] — 2026-11-12

### Changed
- Hero layout: headline and subtitle sit on a soft dark halo with stronger text shadows; the monitor is centred in the space under the text and no longer moves (no tilt, scroll zoom or entrance slide).
- The monitor stands *in* the meadow: the nearest flowers and the drifting petals are a foreground layer that passes in front of it.
- The meadow image also backs the hero itself, and the parallax layers are larger, so no bare edge can show while they move.
- The hero's top-right Download button is the white "Download for Windows" pill; it turns into the dark nav button after the hero.

### Added
- Custom cursor (`src/cursor.js`): a dot plus a trailing ring that becomes a rounded frame over links, buttons and cards. Mouse/trackpad only; off for touch and reduced motion.

## [0.5.0] — 2026-11-12

### Added
- New intro loader built around the app: a 24h day timeline fills with app-coloured sessions (Mail, VS Code, Chrome, Figma, Slack) as a clock runs from 00:00 to 24:00, with the current app named underneath; then four corner brackets fly out to the screen edges and the hero enters (scene zooms in, headline and monitor rise).

### Changed
- Hero: the only control is the Download button, now in the top-right; the logo and nav links appear once you scroll past the hero.
- "A day, framed" uses illustrated scenes in the hero's painted style (sunlit bedroom, library study, forest coffee break, night room) from Pixabay; credits in README.

## [0.4.0] — 2026-11-12

### Changed
- Hero shows only the Download button; the logo and nav slide in once you scroll past the hero.
- Hero meadow fades into the tour section underneath the monitor (the cloud bank there covered the monitor and was removed).
- Tour section fits one screen: cards sized from the viewport height, content starts below the nav, pinned length matches how far the reel must slide.

### Added
- "A day, framed" cards use photos for each moment (morning coffee, focused work, park break, sunset review) from Unsplash; credits in README.

## [0.3.0] — 2026-11-12

### Changed
- Hero background is now a painted meadow (`public/img/hero-meadow.jpg`), replacing the drawn hills and dot flowers.

### Added
- Living hero (`src/hero.js`): two-layer parallax (foreground flowers move more than the sky and mountains) that follows the pointer and pushes in on scroll; slow ambient "breathing" zoom.
- Drifting petals and flapping butterflies on a canvas; they scatter away from the pointer and nearer ones parallax more.
- Monitor tilts toward the cursor, more strongly the closer the pointer gets.
- Cloud bank rolling from the hero into the tour section.

## [0.2.0] — 2026-11-12

### Added
- Scroll-driven motion (`src/scroll.js`): hero text lifts and fades while the monitor zooms and clouds part; the tour section pins and slides its card reel sideways; cloud parallax; feature cards and timeline steps swing in and settle at a tilt; screens cards scale up; footer wordmark rises.
- Scroll progress bar at the top of the page.
- Nav and logo switch to dark-on-frosted-white over light sections.

### Changed
- Hero laid out to fit one screen: headline at the top, retro monitor sitting in the meadow, download button over its base, hills drawn as SVG with flowers scattered on them.
- Clouds are painted once to `<canvas>` (soft puffs, shaded underside, rim puffs and blur) instead of live SVG filters, which froze Chrome when moving on scroll. Fewer clouds; cloud bands no longer animate.
- Better text contrast: darker glass on feature cards, shadows on white headings, darker top of the timeline sky, more opaque footer card, scattered clouds kept away from headings.
- Feature cards and the footer no longer use backdrop blur.

## [0.1.0] — 2026-11-12

### Added
- Vite project for the landing page, separate from the app (`landing/`).
- Sections: loader, hero with retro monitor and meadow, tour reel, screens grid, feature glass cards, day timeline, download panel, footer.
- Volumetric clouds built from SVG turbulence filters: hero clouds, scattered section clouds and cloud bands between sections.
- Version shown in the download panel and footer, read from `package.json`.
