import TinySDF from '@mapbox/tiny-sdf';
import type { TinySDFOptions } from '@mapbox/tiny-sdf';
import { BoundingBox, Color, FontSource, ImageFiltering, ImageSource, ImageSourceAttributeConstants, Resource, Vector } from 'excalibur';
import type { HTMLImageSource, Loadable } from 'excalibur';

export type UnicodeCodePointRange = [startCodePoint: number, endCodePoint: number];

export type SDFTextAlign = 'left' | 'center' | 'right';

/**
 * tiny-sdf's default cutoff: the fraction of the distance radius that lies outside the glyph edge
 */
const SDF_CUTOFF = 0.25;

/**
 * Placement of one glyph on the atlas, as produced by tiny-sdf
 */
export interface SDFGlyph {
  /**
   * x pixel coordinate on the SDF atlas image
   */
  x: number;
  /**
   * y pixel coordinate on the SDF atlas image
   */
  y: number;
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
   * Top of the glyph, ascent above the baseline in pixels
   */
  glyphTop: number;
  /**
   * Left of the glyph relative to the pen position
   */
  glyphLeft: number;
  /**
   * Amount the glyph advances the pen while writing
   */
  glyphAdvance: number;
}

/**
 * Glyph metadata plus the raw grayscale SDF pixels, before they are placed on the atlas
 */
export interface SDFGlyphData extends Omit<SDFGlyph, 'x' | 'y'> {
  data: Uint8ClampedArray;
}

/**
 * JSON written next to a pre-generated atlas image, see the `ex-generate-sdf` CLI
 */
export interface SDFMetadata {
  /**
   * Atlas image path, relative to the metadata file
   */
  atlas: string;
  color: string;
  alphabet: string;
  fontSize: number;
  buffer: number;
  /**
   * Max ascent above the baseline of any glyph, in atlas pixels
   */
  ascent: number;
  halo: number;
  gamma: number;
  glyphs: Record<string, SDFGlyph>;
}

export function getCharactersFromUnicodeRanges(ranges: UnicodeCodePointRange[]) {
  return ranges.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, i) => String.fromCodePoint(start + i))).join('');
}

/**
 * Everything the renderer needs to lay out and draw text from an SDF atlas. Implemented by
 * {@link SDFFont} (atlas generated in the browser at load time) and {@link SDFAtlas} (pre-generated).
 */
export abstract class SDFSource {
  /**
   * Code point to glyph placement on the atlas
   */
  public readonly glyphs: Map<string, SDFGlyph> = new Map();

  /**
   * The atlas image, uploaded to the GPU by the renderer
   */
  public abstract get atlas(): HTMLImageSource;

  public abstract get isLoaded(): boolean;

  /**
   * Default text color when an {@link SDFText} does not specify one
   */
  public color: Color = Color.Black;

  /**
   * Font size the atlas was generated at, text is scaled relative to this
   */
  public fontSize: number = 16;

  /**
   * Padding around every glyph on the atlas in pixels
   */
  public buffer: number = 2;

  /**
   * Max ascent above the baseline of any glyph in atlas pixels, used to place the first line
   */
  public ascent: number = 0;

  /**
   * Normalized distance at which a pixel counts as inside a glyph (0..1). tiny-sdf encodes the
   * edge at `1 - cutoff`, with the default cutoff of 0.25 that is 0.75.
   */
  public halo: number = 1 - SDF_CUTOFF;

  /**
   * Antialiasing ramp width around the glyph edge
   */
  public gamma: number = 0.1;

  private _cachedText?: string;
  private _cachedSize?: number;
  private _cachedMaxWidth?: number;
  private _cachedLines: string[] = [];

  /**
   * Split text into lines, honoring explicit newlines and wrapping at `maxWidth` pixels (when given)
   */
  public getLines(text: string, size: number, maxWidth?: number): string[] {
    if (this._cachedText === text && this._cachedSize === size && this._cachedMaxWidth === maxWidth) {
      return this._cachedLines;
    }
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (maxWidth == null || this.measureLine(paragraph, size) <= maxWidth) {
        lines.push(paragraph);
        continue;
      }
      // wrap on spaces, falling back to breaking a word that does not fit on a line by itself
      let line = '';
      for (const word of paragraph.split(' ')) {
        const candidate = line ? line + ' ' + word : word;
        if (this.measureLine(candidate, size) <= maxWidth) {
          line = candidate;
        } else {
          if (line) {
            lines.push(line);
          }
          line = word;
          while (this.measureLine(line, size) > maxWidth && line.length > 1) {
            let fit = line.length - 1;
            while (fit > 1 && this.measureLine(line.slice(0, fit), size) > maxWidth) {
              fit--;
            }
            lines.push(line.slice(0, fit));
            line = line.slice(fit);
          }
        }
      }
      lines.push(line);
    }
    this._cachedText = text;
    this._cachedSize = size;
    this._cachedMaxWidth = maxWidth;
    this._cachedLines = lines;
    return lines;
  }

  /**
   * Width in pixels of a single line of text at `size`
   */
  public measureLine(line: string, size: number): number {
    const scale = size / this.fontSize;
    let width = 0;
    for (const char of line) {
      const glyph = this.glyphs.get(char);
      if (glyph) {
        width += glyph.glyphAdvance * scale;
      }
    }
    return width;
  }

  /**
   * Bounds of a block of text at `size`, every line is `size * lineHeight` tall
   */
  public measureText(text: string, size: number, maxWidth?: number, lineHeight: number = 1.2): BoundingBox {
    if (!this.isLoaded) {
      throw new Error(`Cannot measureText("${text}") on an SDF source that is not loaded yet`);
    }
    const lines = this.getLines(text, size, maxWidth);
    let width = 0;
    for (const line of lines) {
      width = Math.max(width, this.measureLine(line, size));
    }
    return BoundingBox.fromDimension(width, lines.length * size * lineHeight, Vector.Zero);
  }

  protected _computeAscent() {
    let ascent = 0;
    for (const glyph of this.glyphs.values()) {
      ascent = Math.max(ascent, glyph.glyphTop);
    }
    this.ascent = ascent;
  }
}

export type SDFCanvas = HTMLCanvasElement & {
  getContext(context: '2d'): any;
  width: number;
  height: number;
};

export interface SDFImageData {
  data: any;
}

export interface SDFFontOptions {
  /**
   * Font family to rasterize, either a system font or the family name of `fontFile`
   */
  fontFamily: string;
  /**
   * Optional font file (ttf/otf/woff) to load before generating, registered as `fontFamily`
   */
  fontFile?: string;
  /**
   * Default black
   */
  color?: Color;
  /**
   * Default 400
   */
  fontWeight?: number | string;
  /**
   * Default 'normal'
   */
  fontStyle?: string;
  /**
   * Glyphs to bake into the atlas, a string or a list of unicode code point ranges.
   * Default: ASCII printable characters (0x20-0x7E)
   */
  alphabet?: string | UnicodeCodePointRange[];
  /**
   * Font size the atlas is generated at. Roughly pick the "biggest" size your text will be drawn at,
   * smaller text scales down cleanly. Default 48.
   */
  fontSize?: number;

  // Providers exist so the same code can run headless (see the CLI, which swaps in skia-canvas)
  sdfProvider?: (options: TinySDFOptions) => TinySDF;
  canvasProvider?: (width: number, height: number) => SDFCanvas;
  imageDataProvider?: (width: number, height: number) => SDFImageData;
  fontSourceLoader?: (fontFile: string, fontFamily: string) => Promise<void>;
}

/**
 * Generates an SDF atlas when loaded, in the browser or headless. To ship a pre-generated atlas
 * instead use {@link SDFAtlas}.
 */
export class SDFFont extends SDFSource implements Loadable<SDFCanvas> {
  public readonly atlas: SDFCanvas;
  private _atlasCtx: CanvasRenderingContext2D;

  public get data() {
    return this.atlas;
  }

  private _isLoaded = false;
  public get isLoaded(): boolean {
    return this._isLoaded;
  }

  private _sdfProvider: (options: TinySDFOptions) => TinySDF = (options) => new TinySDF(options);
  private _canvasProvider: (width: number, height: number) => SDFCanvas = (width, height) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  private _imageDataProvider: (width: number, height: number) => SDFImageData = (width, height) => new ImageData(width, height);
  private _fontSourceLoader: (font: string, family: string) => Promise<void> = async (file, family) => {
    await new FontSource(file, family).load();
  };

  public readonly fontFamily: string;
  public readonly fontFile?: string;
  public readonly fontWeight: string;
  public readonly fontStyle: string;
  public readonly alphabet: string;
  /**
   * Distance field radius in pixels
   */
  public readonly radius: number;

  constructor(options: SDFFontOptions) {
    super();
    this._sdfProvider = options.sdfProvider ?? this._sdfProvider;
    this._canvasProvider = options.canvasProvider ?? this._canvasProvider;
    this._imageDataProvider = options.imageDataProvider ?? this._imageDataProvider;
    this._fontSourceLoader = options.fontSourceLoader ?? this._fontSourceLoader;

    this.color = options.color ?? Color.Black;
    this.fontFile = options.fontFile;
    this.fontFamily = options.fontFamily;
    this.fontSize = options.fontSize ?? 48;
    this.fontWeight = options.fontWeight?.toString() ?? '400';
    this.fontStyle = options.fontStyle ?? 'normal';
    this.alphabet = Array.isArray(options.alphabet)
      ? getCharactersFromUnicodeRanges(options.alphabet)
      : (options.alphabet ?? getCharactersFromUnicodeRanges([[0x0020, 0x007e]]));

    this.buffer = Math.ceil(this.fontSize / 8);
    this.radius = Math.ceil(this.fontSize / 3);
    this.gamma = (2 * 1.4142) / this.fontSize;

    const cell = this.fontSize + this.buffer * 2;
    const dimension = Math.ceil(Math.sqrt([...this.alphabet].length)) * cell;
    this.atlas = this._canvasProvider(dimension, dimension);
    if (!this.atlas) {
      throw new Error('Cannot build the SDF atlas canvas');
    }
    // Distance fields must be sampled with linear filtering or the edges go jagged
    this.atlas.setAttribute?.(ImageSourceAttributeConstants.Filtering, ImageFiltering.Blended);
    const ctx = this.atlas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) {
      throw new Error('Cannot build the SDF atlas 2D context');
    }
    this._atlasCtx = ctx;
  }

  private _toRGBAImageData(alphaChannel: Uint8ClampedArray, width: number, height: number) {
    const imageData = this._imageDataProvider(width, height);
    for (let i = 0; i < alphaChannel.length; i++) {
      imageData.data[4 * i + 0] = alphaChannel[i];
      imageData.data[4 * i + 1] = alphaChannel[i];
      imageData.data[4 * i + 2] = alphaChannel[i];
      imageData.data[4 * i + 3] = 255;
    }
    return imageData;
  }

  async load(): Promise<SDFCanvas> {
    if (this._isLoaded) {
      return this.atlas;
    }
    if (this.fontFile) {
      await this._fontSourceLoader(this.fontFile, this.fontFamily);
    }

    const tinySdf = this._sdfProvider({
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontStyle: this.fontStyle,
      fontWeight: this.fontWeight,
      buffer: this.buffer,
      radius: this.radius,
      cutoff: SDF_CUTOFF
    } satisfies TinySDFOptions);

    // Rasterize every glyph into a distance field, then pack them left to right, top to bottom
    const glyphs: [string, SDFGlyphData][] = [];
    for (const char of this.alphabet) {
      glyphs.push([char, tinySdf.draw(char)]);
    }
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const [char, glyph] of glyphs) {
      if (x + glyph.width > this.atlas.width) {
        x = 0;
        y += rowHeight;
        rowHeight = 0;
      }
      if (y + glyph.height > this.atlas.height) {
        throw new Error(`SDF atlas is too small for the alphabet of "${this.fontFamily}", this is a bug`);
      }
      this._atlasCtx.putImageData(this._toRGBAImageData(glyph.data, glyph.width, glyph.height) as any, x, y);
      const { data, ...placement } = glyph;
      this.glyphs.set(char, { ...placement, x, y });
      x += glyph.width;
      rowHeight = Math.max(rowHeight, glyph.height);
    }
    this._computeAscent();
    this._isLoaded = true;
    return this.atlas;
  }

  /**
   * Metadata describing this atlas, write it next to the atlas image to load later with {@link SDFAtlas}
   */
  public toMetadata(atlasPath: string): SDFMetadata {
    const glyphs: Record<string, SDFGlyph> = {};
    for (const [char, glyph] of this.glyphs) {
      glyphs[char] = glyph;
    }
    return {
      atlas: atlasPath,
      color: this.color.toHex(),
      alphabet: this.alphabet,
      fontSize: this.fontSize,
      buffer: this.buffer,
      ascent: this.ascent,
      halo: this.halo,
      gamma: this.gamma,
      glyphs
    };
  }
}

export interface SDFAtlasOptions {
  /**
   * Path to the atlas image file
   */
  atlasPath: string;
  /**
   * Path to the JSON glyph metadata written by the CLI
   */
  metadataPath: string;
}

/**
 * Loads a pre-generated SDF atlas (image + JSON metadata), see the `ex-generate-sdf` CLI
 */
export class SDFAtlas extends SDFSource implements Loadable<ImageSource> {
  public readonly data: ImageSource;
  public readonly metadata: Resource<SDFMetadata>;

  public get atlas(): HTMLImageElement {
    return this.data.image;
  }

  public get isLoaded(): boolean {
    return this.data.isLoaded && this.metadata.isLoaded;
  }

  constructor(options: SDFAtlasOptions) {
    super();
    this.data = new ImageSource(options.atlasPath, { filtering: ImageFiltering.Blended });
    this.metadata = new Resource<SDFMetadata>(options.metadataPath, 'json');
  }

  async load(): Promise<ImageSource> {
    const [, metadata] = await Promise.all([this.data.load(), this.metadata.load()]);
    for (const [char, glyph] of Object.entries(metadata.glyphs)) {
      this.glyphs.set(char, glyph);
    }
    this.color = Color.fromHex(metadata.color);
    this.halo = metadata.halo;
    this.gamma = metadata.gamma;
    this.fontSize = metadata.fontSize;
    this.buffer = metadata.buffer;
    if (metadata.ascent != null) {
      this.ascent = metadata.ascent;
    } else {
      this._computeAscent();
    }
    return this.data;
  }
}
