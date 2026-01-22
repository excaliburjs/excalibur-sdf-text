
import {
  Actor,
  Engine,
  ExcaliburGraphicsContextWebGL,
  Loader,
  vec,
} from 'excalibur';
import { SDFFont } from './sdf-font';
import { SDFTextRenderer } from './sdf-text-renderer';
import { SDFText } from './sdf-text';



const glsl = tags => tags[0];
const sdfFont = new SDFFont({
  // fontFile: './static/Roboto-Regular.ttf',
  // fontFamily: 'Roboto',
  // fontFile: './static/PixelifySans-Regular.ttf',
  // fontFamily: 'PixelifySans',
  fontFile: './static/JetBrainsMono-Regular.ttf',
  fontFamily: 'JetBrainsMono',
  alphabet: [[0x0020, 0x00FF]],
  fontWeight: 100,
  fontSize: 100
});


const game = new Engine({
  width: 800,
  height: 800
});

// TODO plugin system
(game.graphicsContext as ExcaliburGraphicsContextWebGL).lazyRegister("ex.sdf-text-renderer", () => new SDFTextRenderer());

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

console.log(sdfFont.measureText(sdfText.text, 100));

document.body.appendChild(sdfFont.atlasCanvas);
