# Excalibur SDF Text and Atlas Generation Plugin 

`@excaliburjs/sdf-text`

Why SDF text? It's a nice middle ground when you want to draw high fidelity text (non-pixel) at various font sizes fast and at a decent quality.
While avoiding operating system specific rendering, and slow rasterization.

The tradeoff is you lose all the fancy OS level text rendering capabilities and some quality (like multi-colored emojis, bolding, italics, etc), you gain speed 
near indistinguishable quality, fast drawing with batch rendering, OS independent rendering, and flexibility on glyphs in your font.

## Example

```typescript

const game = new Engine({
  width: 800,
  height: 800
});

// Requires a new renderer (in the future this will be handled with a ex.Plugin (TBD))
(game.graphicsContext as ExcaliburGraphicsContextWebGL).lazyRegister("ex.sdf-text-renderer", () => new SDFTextRenderer());

const sdfFont = new SDFFont({
  fontFile: './static/JetBrainsMono-Regular.ttf',
  fontFamily: 'JetBrainsMono',
  alphabet: [[0x0020, 0x00FF]],
  fontWeight: 100,
  fontSize: 100
});


await game.start(new Loader([sdfFont]));

const sdfText = new SDFText({
  sdfFont,
  // color: Color.Purple,
  text: '"{}^$@Hello\nSDF\nText!!@',
  visibleCharacters: 0,
  size: 100 
});

const sdfActor = new Actor({
  pos: vec(100, 100),
  width: 100,
  height: 100,
  graphic: sdfText
});
game.add(sdfActor);
setInterval(() => {
  sdfText.visibleCharacters++;
}, 200);

// Inspect the atlas
document.body.appendChild(sdfFont.atlasCanvas);

```

## Theory

Excalibur browser component for rendering SDF text into a game

## TODO
* [ ] Layout text ahead of time for alignment and justification (backport to excalibur core?)
* [ ] use skia-canvas to generate atlass ahead of time (cli command?)
* [ ] Update SDFFont to take in an existing atlas
* [ ] Experiment with an excalibur plugin system
  - Install renderer
  - Install system
  - 
* [ ] SDFTextRenderer Build an SDF text renderer for excalibur
* [ ] Build a vite plugin (unplugin) that can run in node to build sdf atlas
* [x] SDFText Graphic Pair the atlas with a resource type SDFFont that can load the atlas


