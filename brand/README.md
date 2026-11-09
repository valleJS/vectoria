# Vectoria brand kit

The mark is **Numeral V**: a Roman capital V turned on its side as the arrowhead, with detached
serifs. Its shaft is a legion signum with one phalera ring, and laurel leaves form the fletching.
The wordmark is `VECTORIA` in Syncopate Bold with 0.24 em tracking, converted to outlines, so no
font is needed to open the files.

## Colourways

| Name | Use | Mark | Shaft | Wordmark | Background |
| ---- | --- | ---- | ----- | -------- | ---------- |
| `day` | Light grounds, the game by day | ink `#3b2a18` / `#6b5434` | seal `#a3311f` | ink `#3b2a18` | parchment `#f6eedb` |
| `night` | Dark grounds, the game at night | gold `#f2c230` / `#c9951b` | red `#d4462e` | gold `#f2c230` | `#16130e` |
| `black` | One-colour print, stamps | `#16130e` | `#16130e` | `#16130e` | white |
| `white` | One-colour on photos and dark | white | white | white | dark |

## Folders

| Folder | Contents |
| ------ | -------- |
| `logo/svg/` | Masters with transparent background: `mark`, `wordmark`, `lockup-horizontal`, `lockup-stacked`, each in all four colourways |
| `logo/png/` | The same as transparent PNGs (mark 1024 px wide, horizontal lockup 2000 px, stacked lockup 1200 px) |
| `avatar/` | Profile pictures, 1:1, with and without text, 400 and 1024 px, plus SVG. The mark stays inside the inscribed circle, so circular crops are safe |
| `app-icon/` | Square app icons 192 / 512 / 1024, maskable 512 (80 % safe zone), Apple touch icon 180 |
| `favicon/` | Simplified mark (no fletching or ring) on a rounded tile: SVG, PNG 16 / 32 / 48, and a multi-size `favicon.ico` |
| `social/` | Link preview `og-image` 1200×630, `x-header` 1500×500, `linkedin-banner` 1584×396, `youtube-banner` 2560×1440 (logo inside the 1546×423 safe area), `discord-banner` 960×540, `instagram-post` 1080×1080, `instagram-portrait` 1080×1350, `story` 1080×1920. Each in `day` and `night`, with (`-text`) and without text |
| `source/` | `build.mjs`, the generator for everything above |

## Rebuild

The generator is not part of the npm workspaces. Run it from a scratch folder that has `sharp`
and `opentype.js` installed in `./tools/node_modules` and the Syncopate Bold TTF from Google Fonts:

```sh
node build.mjs <repo>/brand Syncopate-Bold.ttf <repo>/apps/client/public
```

The last argument also rewrites the app's `favicon.svg`, `favicon-night.svg`, `favicon-32.png`,
`apple-touch-icon.png`, `icon-*.png` and `og-image.png`. The in-game logo is
`apps/client/src/ui/BrandMark.tsx`; keep its geometry in step with `markInner` in `build.mjs`.
