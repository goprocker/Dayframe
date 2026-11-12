# Dayframe landing page

Marketing site for Dayframe. Plain HTML/CSS/JS built with Vite; separate from the desktop app.

```sh
cd landing
npm install
npm run dev       # http://localhost:5180
npm run build     # output in landing/dist (index + changelog pages)
npm run preview
```

## Layout

```
landing/
  index.html          page markup
  changelog.html      changelog page (second Vite entry)
  vercel.json         Vercel build, clean URLs, /download/* as attachments
  public/download/    Windows installer
  public/video/       hero video (dayframe.mp4)
  public/img/         hero art, timeline illustrations, shots/ app screenshots
  src/main.js         loader, flowers, scroll reveal, version stamp
  src/hero.js         meadow parallax, petals, butterflies
  src/video.js        hero video loop + popup player
  src/scroll.js       scroll-driven motion, pinned tour reel
  src/clouds.js       canvas-painted clouds and cloud bands
  src/cursor.js       custom cursor (mouse only)
  src/downloads.js    installer download counter
  src/changelog.js    changelog page entry
  src/styles/
    base.css          tokens, nav, buttons, loader, shared section styles
    clouds.css        cloud layers and bands
    sections.css      per-section styles
    changelog.css     changelog page
```

## Deploy

On Vercel, set the project root directory to `landing`; `vercel.json` handles the rest.

## Download counter

Installer clicks add one to an anonymous public counter. Localhost is never counted; open the live site once with `?me=1` to exclude your browser (`?me=0` undoes it).

## Versioning

The version lives in `package.json` and is shown on the page (download panel and footer). To release: bump `version`, add a `CHANGELOG.md` entry, and tag the commit `landing-vX.Y.Z`.

## Image credits

- `hero-meadow.jpg`: supplied by the project owner.
- Timeline illustrations from [Pixabay](https://pixabay.com) under the Pixabay Content License:
  - `day-start.jpg`: [Anime cartoon indoors room](https://pixabay.com/illustrations/anime-cartoon-indoors-art-room-8912095/)
  - `day-focus.jpg`: [Books, bookshelves](https://pixabay.com/illustrations/ai-generated-books-bookshelves-7847758/)
  - `day-away.jpg`: [Girl, coffee, morning](https://pixabay.com/illustrations/ai-generated-girl-coffee-morning-9033691/)
  - `day-review.jpg`: [Anime room at night](https://pixabay.com/illustrations/anime-room-night-nocturnal-view-8788530/)
