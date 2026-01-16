
import TinySDF, { TinySDFOptions } from '@mapbox/tiny-sdf';
import { Actor, Color, Engine, ImageSource, vec } from 'excalibur';

export interface SDFFontOptions {
  fontFile: string; // ttf file
  /*
   * Default 100
   */
  fontWeight?: number;
  /**
   * Default 'normal'
   */
  fontStyle?: string;
  alphabet?: string; // string of glyphs you wish to support in the sdf
  fontSize?: number;
  // These are from TinySDF
  // size: number;
  // halo: number;
  // angle: number;
  // gamma: number
}

export interface Glyph {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  glyphWidth: number;
  glyphHeight: number;
  glyphTop: number;
  glyphLeft: number;
  glyphAdvance: number;
}



export class SDFFont {
  atlasCanvas: HTMLCanvasElement;
  atlasCtx: CanvasRenderingContext2D;

  // codepoint to Glyph info
  glyphs: Map<string, Glyph> = new Map();
  glyphAtlasLocation: Map<string, {x: number, y: number}> = new Map();

  private __tinySdf: TinySDF;

  constructor(private options: SDFFontOptions) {
    this.atlasCanvas = document.createElement('canvas');
    if (!this.atlasCanvas) throw new Error("Cannot Build SDF Font Atlas Canvas");
    this.atlasCtx = this.atlasCanvas.getContext('2d')!;
    if (!this.atlasCtx) throw new Error("Cannot Build SDF Font Atlas Context");


    const fontSize = options.fontSize ?? 16;
    const fontWeight = options.fontWeight?.toString() ?? '100'; // TODO default
    const fontStyle = options.fontStyle ?? 'normal';
    const alphabet = options.alphabet ?? 'abcdefghijklmnopqrstuvwxyz~!@#$%^&*\(\)<>?\'\":;ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890{}\\|';
    const buffer = Math.ceil(fontSize / 8);
    const radius = Math.ceil(fontSize / 3);

    const size = fontSize + buffer * 2;
    const dimension = Math.ceil(Math.sqrt(alphabet.length)) * size;
    this.atlasCanvas.width = dimension;
    this.atlasCanvas.height = dimension;

    // TinySDF generator
    this.__tinySdf = new TinySDF({
      fontSize,
      fontFamily: 'sans-serif', // TODO extract font family?
      fontStyle,
      fontWeight,
      buffer,
      radius,
    } satisfies TinySDFOptions);

    // Generate sdf atlas data
    for (const codePoint of alphabet) {
      this.glyphs.set(codePoint, this.__tinySdf.draw(codePoint));
    }

    // Build atlas
    const codePoints = Array.from(this.glyphs.entries());
    const codePointsLength = codePoints.length
    let i = 0;
    let [codePoint, glyph] = codePoints[i];
    let currentSize = Math.max(glyph.width, glyph.height);
    for (let y = 0; y + currentSize <= this.atlasCanvas.height && i < codePointsLength; y += currentSize) {
      for (let x = 0; x + currentSize <= this.atlasCanvas.width && i < codePointsLength; x += currentSize) {
        const { data, width, height } = glyph;
        currentSize = Math.max(glyph.width, glyph.height);
        // build atlas and stash info
        this.atlasCtx.putImageData(this._makeRGBAImageData(data, width, height), x, y);
        this.glyphAtlasLocation.set(codePoint, {x, y});
        // next iter
        i++
        if (codePoints[i]) {
          [codePoint, glyph] = codePoints[i]
        }
      }
    }
  }

  private _makeRGBAImageData(alphaChannel: Uint8ClampedArray, width: number, height: number) {
    const imageData = new ImageData(width, height);
    for (let i = 0; i < alphaChannel.length; i++) {
      imageData.data[4 * i + 0] = alphaChannel[i];
      imageData.data[4 * i + 1] = alphaChannel[i];
      imageData.data[4 * i + 2] = alphaChannel[i];
      imageData.data[4 * i + 3] = 255;
    }
    return imageData;
  }

  async load() {
    // TODO load the font file with the excalibur font loader 

  }
}


// export interface SDFTextOptions {
//   sdfFont: SDFFont;
//   text: string;
// }
//
// export class SDFText {
//   constructor(options: SDFTextOptions) {
//   }
// }
//

const glsl = tags => tags[0];

const sdf = new SDFFont({
  fontFile: './static/Roboto-Regular.ttf',
  fontWeight: 100,
  fontSize: 30,
  // alphabet: 'abcd'
});

document.body.appendChild(sdf.atlasCanvas);

const game = new Engine({
  width: 800,
  height: 800

});

await game.start();

const textAtlas = ImageSource.fromHtmlCanvasElement(sdf.atlasCanvas);
await textAtlas.ready;

const textActor = new Actor({
  width: 500,
  height: 100,
  color: Color.Red,
  pos: vec(400, 400)
});
textActor.graphics.material = game.graphicsContext.createMaterial({
  name: 'text',
  color: Color.Red,
  fragmentSource: glsl`#version 300 es
    precision mediump float;

    uniform float u_time_ms;
    uniform vec4 u_color;
    uniform float u_buffer;
    uniform float u_gamma;
    uniform sampler2D u_graphic;
    uniform sampler2D u_text_atlas;

    in vec2 v_uv;
    in vec2 v_screenuv;
    out vec4 fragColor;
    void main() {
      float dist = texture(u_text_atlas, v_uv).r;
      fragColor = vec4(vec3(dist), 1.0);
      // float alpha = smoothstep(u_buffer - u_gamma, u_buffer + u_gamma, dist);
      // fragColor = vec4(u_color.rgb, alpha * u_color.a);
      // fragColor.rgb *= fragColor.a;
    }
  `,
  uniforms: {
    u_gamma: 2,
    u_buffer: .55
  },
  images: {
    u_text_atlas: textAtlas // TODO add ready check
  }

});
game.add(textActor);

