# Excalibur SDF Text Plugin

`@excaliburjs/plugin-sdf-text`

Signed distance field text for [Excalibur](https://excaliburjs.com): one atlas, crisp text at any size, rotation or zoom, drawn by a batched WebGL renderer. It is also a worked example of an Excalibur `Plugin` that installs a custom `RendererPlugin` on the graphics context.

Why SDF text? `ex.Text` rasterizes with the 2D canvas, which looks great at the size it was rasterized at and goes soft when scaled or zoomed. A distance field atlas is generated once (at load time or ahead of time with the CLI) and the fragment shader reconstructs a sharp edge at whatever size you draw. You lose the browser's text shaping (ligatures, multi-colored emoji, bold and italic synthesized per draw), you gain resolution independence, batching, and the same output on every OS.

https://github.com/user-attachments/assets/1c915bb4-0c8e-49b8-896a-e4fe2332a638

## Install

```sh
npm install @excaliburjs/plugin-sdf-text
```

Requires `excalibur@^1.0.0` and WebGL (the renderer is a no-op on the 2D canvas fallback).

## Usage

```typescript
import * as ex from 'excalibur';
import { SDFFont, SDFText, SDFTextPlugin } from '@excaliburjs/plugin-sdf-text';

// Generates a 64px atlas from the browser's serif font at load time (or pass a `fontFile`)
const font = new SDFFont({ fontFamily: 'Georgia, serif', fontSize: 64, color: ex.Color.White });

const game = new ex.Engine({
  plugins: [new SDFTextPlugin()] // registers the renderer on the WebGL graphics context
});

await game.start(new ex.Loader([font]));

const text = new SDFText({
  sdf: font,
  text: 'Crisp at any size',
  size: 180, // bigger than the atlas is fine
  textAlign: 'center',
  maxWidth: 600
});
game.add(new ex.Actor({ pos: ex.vec(100, 100), graphic: text }));
```

`SDFText` is a regular `ex.Graphic`: use it anywhere a sprite goes, scale, rotate and tint it, give it `opacity`, and combine it with other graphics in a `GraphicsGroup`. Its `width` and `height` are measured from the atlas so actor bounds and offscreen culling work.

### SDFFont options

| option | default | notes |
| --- | --- | --- |
| `fontFamily` | required | a system font, or the family name you give `fontFile` |
| `fontFile` | none | ttf/otf/woff to load before generating |
| `fontSize` | 48 | size the atlas is generated at, roughly the biggest size you will draw |
| `fontWeight` / `fontStyle` | 400 / normal | |
| `alphabet` | printable ASCII | a string, or unicode code point ranges like `[[0x20, 0xff]]` |
| `color` | black | default color for text drawn with this font |

### SDFText options

`text`, `size`, `color`, `visibleCharacters` (typewriter effects), `textAlign` (`left` | `center` | `right`), `maxWidth` (wraps on spaces), `lineHeight` (multiple of `size`, default 1.2), plus every `GraphicOptions` field (`opacity`, `scale`, `rotation`, `origin`, ...).

## Pre-generated atlases

Generating in the browser costs a few hundred milliseconds for a 64px ASCII atlas. For big alphabets or large sizes, bake the atlas ahead of time with the CLI (uses [skia-canvas](https://github.com/samizdatco/skia-canvas), an optional dependency) and ship the image and metadata with your game:

```sh
# after npm install @excaliburjs/plugin-sdf-text
npx ex-generate-sdf ./fonts/PixelifySans-Regular.ttf PixelifySans ./public/pixelfont 64
#  writes ./public/pixelfont.png and ./public/pixelfont.json
```

Or one-off without adding it to your game's dependencies (`--package` tells `npx` which package provides the command):

```sh
npx --package @excaliburjs/plugin-sdf-text ex-generate-sdf ./fonts/PixelifySans-Regular.ttf PixelifySans ./public/pixelfont 64
```

```
ex-generate-sdf <font-file> <font-family> <out-name> [font-size=64] [alphabet-start-hex=20 alphabet-end-hex=7E]
```

The CLI ships as type-stripped ESM and needs Node 24 or newer (it is not bundled into the library); the library itself is a prebuilt ESM bundle and runs anywhere your game does.

```typescript
const pixel = new SDFAtlas({ atlasPath: '/pixelfont.png', metadataPath: '/pixelfont.json' });
await game.start(new ex.Loader([pixel]));
new SDFText({ sdf: pixel, text: 'from a baked atlas', size: 32 });
```

## Using the renderer directly

The plugin is a thin wrapper. If you manage renderers yourself:

```typescript
const context = game.graphicsContext as ex.ExcaliburGraphicsContextWebGL;
context.lazyRegister('ex.sdf-text-renderer', () => new SDFTextRenderer());

// later, inside a Graphic's _drawImage
context.draw<SDFTextRenderer>('ex.sdf-text-renderer', font, 'hello', ex.vec(x, y), 32, { color: ex.Color.Red });
```

Glyphs from every `SDFText` in a frame are batched into one draw call per atlas edge setting, up to the GPU's texture unit limit.

## Development

```sh
npm install
npm start          # example app
npm run build      # dist/excalibur-sdf-text.js, .min.js and types
npm test           # headless smoke test (needs `npx playwright install chromium`)
```

## Credits

Distance fields are generated with [@mapbox/tiny-sdf](https://github.com/mapbox/tiny-sdf). Example fonts: JetBrains Mono (OFL), Roboto (Apache 2.0), Pixelify Sans (OFL).
