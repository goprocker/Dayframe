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
