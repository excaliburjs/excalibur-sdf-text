import TinySDF from "@mapbox/tiny-sdf";
import type { TinySDFOptions } from "@mapbox/tiny-sdf";
import { BoundingBox, Color, FontSource, Vector } from "excalibur";
import type { Loadable } from "excalibur";

export type UnicodeCodePointRange = [startCodePoint: number, endCodePoint: number];

// TODO should we just make 1 file? and cook the image with the metadata?

export interface FromAtlasOptions {
  /**
   * Path to atlas image file
   */
  path: string;

  /**
   * JSON representation of FromFontOptions + Glyph meta data
   */
  dataFilePath: string;
}

export interface FromFontOptions {
  path: string; // ttf file
  family: string; // some name

  /**
   * Default black
   */
  color?: Color;
  /*
   * Default 100
   */
  weight?: number;
  /**
   * Default 'normal'
   */
  style?: string;
  /**
   * String of glyphs to bake into the sdf
   *
   * Default: ASCII printable characters (character code 32-127)
   */
  alphabet?: string | UnicodeCodePointRange[];
  /**
   * Intended font size for this sdf font
   *
   * Roughly pick the "biggest" size in pixels your text will be for the highest quality
   */
  size?: number;
}

export type SDFSource = FromFontOptions | FromFontOptions;
// Maybe just have a separate type SDFAtlas to avoid confusion? then SDFAtlas.toFont();
//

export interface SDFCanvas {
  getContext(context: '2d'): any;
  width: number;
  height: number;
}

export interface SDFImageData {
  data: any;
}

export interface SDFFontOptions {
  fontFile: string; // ttf file
  fontFamily: string; // some name

  sdfProvider?: (options: TinySDFOptions) => TinySDF;
  canvasProvider?: (width: number, height: number) => SDFCanvas;
  imageDataProvider?: (width: number, height: number) => SDFImageData;
  fontSourceLoader?: (fontFile: string, fontFamily: string) => Promise<void>;

  /**
   * Default black
   */
  color?: Color;
  /*
   * Default 100
   */
  fontWeight?: number;
  /**
   * Default 'normal'
   */
  fontStyle?: string;
  /**
   * String of glyphs to bake into the sdf
   *
   * Default: ASCII printable characters (character code 32-127)
   */
  alphabet?: string | UnicodeCodePointRange[];
  /**
   * Intended font size for this sdf font
   *
   * Roughly pick the "biggest" size your text will be for the highest quality
   */
  fontSize?: number;
}

export interface SDFGlyph {
  /**
   * x pixel coordinate on the SDF atlas image
   */
  x?: number;
  /**
   * y pixel coordinate on the SDF atlas image
   */
  y?: number;
  /**
   * Grayscale image data, 1 component per pixel
   */
  data: Uint8ClampedArray;
  /**
   * SDF image data width on the atlas (includes non-glyph buffer space)
   */
  width: number;
  /**
   * SDF image data height on the atlas (includes non-glyph buffer space)
   */
  height: number;
  /**
   * Actual glyph width
   */
  glyphWidth: number;
  /**
   * Actual glyph height (ascent from baseline + descent from baseline)
   */
  glyphHeight: number;
  /**
   * Top of the glyph (y coord) ascent from the baseline
   */
  glyphTop: number;
  /**
   * Left of the glyph (x coord) relative to pen position
   */
  glyphLeft: number;
  /**
   * Amount the glyph advances the cursor/pen while writing
   */
  glyphAdvance: number;


}

export function getCharactersFromUnicodeRanges(ranges: UnicodeCodePointRange[]) {
  return ranges.flatMap(([start, end]) =>
    Array.from(
      { length: end - start + 1 },
      (_, i) => String.fromCodePoint(start + i)
    )
  ).join('');
}

export class SDFFont implements Loadable<SDFCanvas> {
  atlasCanvas: SDFCanvas;
  atlasCtx: CanvasRenderingContext2D;

  get data() {
    return this.atlasCanvas;
  }

  private _isLoaded = false;
  isLoaded(): boolean {
    return this._isLoaded;
  }

  /**
   * Codepoint to SDF Glyph info
   *
   * Readonly
   */
  glyphs: Map<string, SDFGlyph> = new Map();

  private __tinySdf: TinySDF;
  private _sdfProvider: (options: TinySDFOptions) => TinySDF =
    (options) => new TinySDF(options);

  private _canvasProvider: (width: number, height: number) => SDFCanvas =
    (width, height) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }

  private _imageDataProvider: (width: number, height: number) => SDFImageData =
    (width, height) => new ImageData(width, height)

  private _fontSourceLoader: (font: string, family: string) => Promise<void> =
    async (file, family) => {
    const fontFile = new FontSource(file, family);
    await fontFile.load();
  }

  private _color: Color;
  private _fontSize: number = 16;

  private _size: number;
  private _buffer: number;
  private _radius: number;
  private _fontWeight: string = '100';
  private _fontStyle: string = 'normal';
  private _fontFamily: string = 'sans-serif';

  /**
   * ASCII printable characters (character code 32-127)
   */
  private _alphabet: string = getCharactersFromUnicodeRanges([
    [0x0020, 0x007E], // Basic Latin
    // [0x00A0, 0x00FF], // Latin-1 Supplement
    // [0x0100, 0x017F], // Latin Extended-A;
  ]);

  private _fontFile: string;

  get gamma() {
    return 2 * 1.4142 / this._fontSize;
  }

  get halo() {
    return .75;
  }

  get color() {
    return this._color;
  }

  get fontSize() {
    return this._fontSize;
  }

  get size() {
    return this._size;
  }

  get buffer() {
    return this._buffer;
  }

  get radius() {
    return this._radius;
  }

  constructor(options: SDFFontOptions) {

    this._sdfProvider = options.sdfProvider ?? this._sdfProvider;
    this._canvasProvider = options.canvasProvider ?? this._canvasProvider;
    this._imageDataProvider = options.imageDataProvider ?? this._imageDataProvider;
    this._fontSourceLoader = options.fontSourceLoader ?? this._fontSourceLoader;

    this._color = options.color ?? Color.Black;

    this._fontFile = options.fontFile;
    this._fontFamily = options.fontFamily ?? this._fontFamily;

    this._fontSize = options.fontSize ?? this._fontSize;
    this._fontWeight = options.fontWeight?.toString() ?? this._fontWeight;
    this._fontStyle = options.fontStyle ?? this._fontStyle;
    if (Array.isArray(options.alphabet)) {
      this._alphabet = getCharactersFromUnicodeRanges(options.alphabet);
    } else {
      this._alphabet = options.alphabet ?? this._alphabet;
    }

    const buffer = Math.ceil(this._fontSize / 8);
    this._buffer = buffer;

    const radius = Math.ceil(this._fontSize / 3);
    this._radius = radius;

    const size = this._fontSize + buffer * 2;
    this._size = size;

    const dimension = Math.ceil(Math.sqrt(this._alphabet.length)) * size;

    this.atlasCanvas = this._canvasProvider(dimension, dimension);
    if (!this.atlasCanvas) throw new Error("Cannot Build SDF Font Atlas Canvas");

    this.atlasCtx = this.atlasCanvas.getContext('2d')!;
    if (!this.atlasCtx) throw new Error("Cannot Build SDF Font Atlas Context");
  }

  private _makeRGBAImageData(alphaChannel: Uint8ClampedArray, width: number, height: number) {
    const imageData = this._imageDataProvider(width, height);
    for (let i = 0; i < alphaChannel.length; i++) {
      imageData.data[4 * i + 0] = alphaChannel[i];
      imageData.data[4 * i + 1] = alphaChannel[i];
      imageData.data[4 * i + 2] = alphaChannel[i];
      imageData.data[4 * i + 3] = 255;
    }
    return imageData;
  }



  private _cachedText?: string;
  private _cachedLines?: string[];
  private _cachedRenderWidth?: number;
  protected _getLinesFromText(text: string, size: number, maxWidth?: number) {
    if (this._cachedText === text && this._cachedRenderWidth === maxWidth && this._cachedLines?.length) {
      return this._cachedLines;
    }

    const lines = text.split('\n');

    if (maxWidth == null) {
      return lines;
    }

    // If the current line goes past the maxWidth, append a new line without modifying the underlying text.
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let newLine = '';
      // Note: we subtract the spacing to counter the initial padding on the left side.
      if (this.measureText(line, size).width > maxWidth) {
        while (this.measureText(line, size).width > maxWidth) {
          newLine = line[line.length - 1] + newLine;
          line = line.slice(0, -1); // Remove last character from line
        }

        // Update the array with our new values
        lines[i] = line;
        lines[i + 1] = newLine;
      }
    }

    this._cachedText = text;
    this._cachedLines = lines;
    this._cachedRenderWidth = maxWidth;

    return lines;
  }

  public measureText(text: string, size: number, maxWidth?: number): BoundingBox {
    if (!this.isLoaded()) {
      throw new Error(`Cannot measureText(${text}) on a font [${this._fontFile}] that is not loaded.`)
    }

    const lines = this._getLinesFromText(text, size, maxWidth);
    const maxWidthLine = lines.reduce((a, b) => {
      return a.length > b.length ? a : b;
    });
    const glyphs: SDFGlyph[] = [];
    for (let char of maxWidthLine) {
      const maybeGlyph = this.glyphs.get(char);
      if (maybeGlyph) {
        glyphs.push(maybeGlyph);
      }
    }
    let width = 0;
    let height = 0;
    const scale = size / this.fontSize;

    for (const glyph of glyphs) {
      width += glyph.glyphAdvance * scale;
      height = Math.max(height, glyph.glyphHeight * scale);
    }
    return BoundingBox.fromDimension(width, height * lines.length, Vector.Zero);
  }

  async load(): Promise<SDFCanvas> {
    if (this._isLoaded) return this.atlasCanvas;
    await this._fontSourceLoader(this._fontFile, this._fontFamily);

    // TinySDF generator
    this.__tinySdf = this._sdfProvider({
      fontSize: this._fontSize,
      fontFamily: this._fontFamily,
      fontStyle: this._fontStyle,
      fontWeight: this._fontWeight,
      buffer: this._buffer,
      radius: this._radius,
    } satisfies TinySDFOptions);

    // Generate sdf atlas data
    for (const codePoint of this._alphabet) {
      this.glyphs.set(codePoint, this.__tinySdf.draw(codePoint));
    }

    // Build atlas
    // This is goofy but it's the best way to support unicode/emojis in a string
    const codePoints = this._alphabet[Symbol.iterator]();
    let nextCodePoint = codePoints.next();
    if (nextCodePoint?.done) throw new Error(`SDFFont Invalid alphabet: [${this._alphabet}]`);

    let currentSize = 0;
    let maxHeight = 0;

    for (let y = 0; y + maxHeight <= this.atlasCanvas.height && !nextCodePoint.done; y += maxHeight) {
      maxHeight = 0;
      for (let x = 0; x + currentSize <= this.atlasCanvas.width && !nextCodePoint.done; x += currentSize) {
        let codePoint = nextCodePoint.value;
        let glyph = this.glyphs.get(codePoint)!;
        const { data, width, height } = glyph;

        // advance in the atlas
        currentSize = glyph.width;
        maxHeight = Math.max(maxHeight, glyph.height);

        // build atlas and stash info
        this.atlasCtx.putImageData(this._makeRGBAImageData(data, width, height) as any, x, y);
        glyph.x = x;
        glyph.y = y;

        // next iter
        nextCodePoint = codePoints.next();
      }
    }

    this._isLoaded = true;
    return this.atlasCanvas!;
  }
}
