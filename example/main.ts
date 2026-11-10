import { Actor, Color, Engine, Loader, vec } from 'excalibur';
import { SDFAtlas, SDFFont, SDFText, SDFTextPlugin } from '../src/index';

// Generated in the browser at load time from a font file...
const jetbrains = new SDFFont({
  fontFile: '/static/JetBrainsMono-Regular.ttf',
  fontFamily: 'JetBrainsMono',
  alphabet: [[0x0020, 0x00ff]],
  fontSize: 64,
  color: Color.White
});
// ...from a system font, no file needed...
const serif = new SDFFont({ fontFamily: 'serif', fontSize: 64, color: Color.fromHex('#ffd166') });
// ...or pre-generated with the CLI: npx ex-generate-sdf ./static/PixelifySans-Regular.ttf PixelifySans static/pixelfontsdf
const pixel = new SDFAtlas({ atlasPath: '/static/pixelfontsdf.png', metadataPath: '/static/pixelfontsdf.json' });

const game = new Engine({
  width: 800,
  height: 600,
  plugins: [new SDFTextPlugin()]
});

await game.start(new Loader([jetbrains, serif, pixel]));

const typewriter = new SDFText({ sdf: jetbrains, text: 'SDF text {}^$@\nin Excalibur', size: 48, visibleCharacters: 0 });
game.add(new Actor({ pos: vec(40, 40), anchor: vec(0, 0), graphic: typewriter }));
setInterval(() => (typewriter.visibleCharacters = (typewriter.visibleCharacters + 1) % (typewriter.text.length + 8)), 120);

// One atlas, any size
let y = 180;
for (const size of [8, 12, 16, 24, 36, 56]) {
  game.add(new Actor({ pos: vec(40, y), anchor: vec(0, 0), graphic: new SDFText({ sdf: serif, text: `${size}px from a 64px atlas`, size }) }));
  y += size * 1.4;
}

const spinner = new Actor({ pos: vec(600, 420), angularVelocity: 0.6 });
spinner.graphics.use(new SDFText({ sdf: pixel, text: 'ROTATE', size: 40, color: Color.fromHex('#8ecae6'), origin: vec(0, 0) }));
game.add(spinner);

const wrapped = new SDFText({
  sdf: jetbrains,
  text: 'Long lines wrap at maxWidth and can be centered, with crisp edges at any zoom level.',
  size: 18,
  maxWidth: 300,
  textAlign: 'center',
  color: Color.fromHex('#cfd2ff')
});
game.add(new Actor({ pos: vec(460, 40), anchor: vec(0, 0), graphic: wrapped }));

game.input.pointers.primary.on('wheel', (evt) => {
  game.currentScene.camera.zoom = Math.min(8, Math.max(0.25, game.currentScene.camera.zoom - evt.deltaY / 1000));
});

// Inspect the generated atlas
document.body.appendChild(jetbrains.atlas);
