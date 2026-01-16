
import TinySDF, { TinySDFOptions } from '@mapbox/tiny-sdf';

export interface SDFFontOptions {
  /*
   * Default 100
   */
  fontWeight: number | undefined;
  /**
   * Default 'normal'
   */
  fontStyle: string | undefined;
  fontFile: string; // ttf file
  alphabet: string; // string of glyphs you wish to support in the sdf
  // These are from TinySDF
  size: number;
  halo: number;
  angle: number;
  gamma: number
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

  private __tinySdf: TinySDF;

  constructor(private options: SDFFontOptions) {
    this.atlasCanvas = document.createElement('canvas');
    if (!this.atlasCanvas) throw new Error("Cannot Build SDF Font Atlas Canvas");
    this.atlasCtx = this.atlasCanvas.getContext('2d')!;
    if (!this.atlasCtx) throw new Error("Cannot Build SDF Font Atlas Context");


    const fontSize = options.size;
    const fontWeight = options.fontWeight?.toString() ?? '100'; // TODO default
    const fontStyle = options.fontStyle ?? 'normal';
    const buffer = Math.ceil(fontSize / 8);
    const radius = Math.ceil(fontSize / 3);

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
    for (const codePoint of this.options.alphabet) {
      this.glyphs.set(codePoint, this.__tinySdf.draw(codePoint));
    }

    // Build atlas
    const size = fontSize + buffer * 2;
    const codePoints = Array.from(this.glyphs.entries());
    const codePointsLength = codePoints.length
    let i = 0;
    let [codePoint, glyph] = codePoints[i];
    for (let y = 0; y + size <= this.atlasCanvas.height && i < codePointsLength; y += size) {
      for (let x = 0; x + size <= this.atlasCanvas.width && i < codePointsLength; x += size) {
        const { data, width, height } = glyph;
        this.atlasCtx.putImageData(this._makeRGBAImageData(data, width, height), x, y);
        // sdfs[codePoint.value] = {x, y};
        i++;
        [codePoint, glyph] = codePoints[i]
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


  }
}



export interface SDFTextOptions {
  sdfFont: SDFFont;
  text: string;
}

export class SDFText {
  constructor(options: SDFTextOptions) {
  }
}





