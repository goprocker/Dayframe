# Dayframe landing page

Marketing site for Dayframe. Plain HTML/CSS/JS built with Vite; separate from the desktop app.

```sh
cd landing
npm install
npm run dev       # http://localhost:5180
npm run build     # output in landing/dist
npm run preview
```

## Layout

```
landing/
  index.html          page markup + SVG cloud filters
  public/img/         app screenshots and icon
  src/main.js         loader, flowers, scroll reveal, version stamp
  src/clouds.js       generates hero clouds, scattered clouds, cloud bands
  src/styles/
    base.css          tokens, nav, buttons, loader, shared section styles
    clouds.css        cloud layers and bands
    sections.css      per-section styles
```

## Versioning

The version lives in `package.json` and is shown on the page (download panel and footer). To release: bump `version`, add a `CHANGELOG.md` entry, and tag the commit `landing-vX.Y.Z`.

## Image credits

- `hero-meadow.jpg`: supplied by the project owner.
- Timeline illustrations from [Pixabay](https://pixabay.com) under the Pixabay Content License:
  - `day-start.jpg`: [Anime cartoon indoors room](https://pixabay.com/illustrations/anime-cartoon-indoors-art-room-8912095/)
  - `day-focus.jpg`: [Books, bookshelves](https://pixabay.com/illustrations/ai-generated-books-bookshelves-7847758/)
  - `day-away.jpg`: [Girl, coffee, morning](https://pixabay.com/illustrations/ai-generated-girl-coffee-morning-9033691/)
  - `day-review.jpg`: [Anime room at night](https://pixabay.com/illustrations/anime-room-night-nocturnal-view-8788530/)
