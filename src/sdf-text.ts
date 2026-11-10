import { Color, ExcaliburGraphicsContextWebGL, Graphic, vec } from 'excalibur';
import type { ExcaliburGraphicsContext, GraphicOptions } from 'excalibur';
import type { SDFSource, SDFTextAlign } from './sdf-font';
import { SDF_TEXT_RENDERER } from './sdf-text-renderer';
import type { SDFTextRenderer } from './sdf-text-renderer';

export interface SDFTextOptions extends GraphicOptions {
  /**
   * The {@link SDFFont} or {@link SDFAtlas} to draw with
   */
  sdf: SDFSource;
  text: string;
  /**
   * Font size in pixels, any size works, the atlas is a distance field. Default is the source's `fontSize`.
   */
  size?: number;
  /**
   * Defaults to the source's color
   */
  color?: Color;
  /**
   * Draw only the first n characters, for typewriter effects. Default all.
   */
  visibleCharacters?: number;
  /**
   * Alignment of lines within the block. Default 'left'.
   */
  textAlign?: SDFTextAlign;
  /**
   * Wrap lines longer than this many pixels
   */
  maxWidth?: number;
  /**
   * Line height as a multiple of `size`. Default 1.2.
   */
  lineHeight?: number;
}

/**
 * A text {@link Graphic} drawn from a signed distance field atlas by the {@link SDFTextRenderer}.
 * Crisp at any size, rotation or zoom, and batched with other SDF text in the same frame.
 */
export class SDFText extends Graphic {
  public sdf: SDFSource;
  public size: number;
  public color?: Color;
  public visibleCharacters: number;
  public textAlign: SDFTextAlign;
  public maxWidth?: number;
  public lineHeight: number;

  private _text: string;
  private _measuredFor?: string;

  constructor(options: SDFTextOptions) {
    super(options);
    this.sdf = options.sdf;
    this._text = options.text;
    this.size = options.size ?? options.sdf.fontSize;
    this.color = options.color;
    this.visibleCharacters = options.visibleCharacters ?? Infinity;
    this.textAlign = options.textAlign ?? 'left';
    this.maxWidth = options.maxWidth;
    this.lineHeight = options.lineHeight ?? 1.2;
    this._calculateDimension();
  }

  public get text(): string {
    return this._text;
  }

  public set text(value: string) {
    this._text = value;
    this._calculateDimension();
  }

  public override get width(): number {
    this._calculateDimension();
    return super.width;
  }

  public override set width(value: number) {
    super.width = value;
  }

  public override get height(): number {
    this._calculateDimension();
    return super.height;
  }

  public override set height(value: number) {
    super.height = value;
  }

  private _calculateDimension() {
    if (!this.sdf.isLoaded) {
      return;
    }
    const key = `${this._text}|${this.size}|${this.maxWidth}|${this.lineHeight}`;
    if (this._measuredFor === key) {
      return;
    }
    this._measuredFor = key;
    const { width, height } = this.sdf.measureText(this._text, this.size, this.maxWidth, this.lineHeight);
    super.width = width;
    super.height = height;
  }

  protected _drawImage(ex: ExcaliburGraphicsContext, x: number, y: number): void {
    if (ex instanceof ExcaliburGraphicsContextWebGL) {
      ex.draw<SDFTextRenderer>(SDF_TEXT_RENDERER, this.sdf, this._text, vec(x, y), this.size, {
        visibleCharacters: this.visibleCharacters,
        color: this.color,
        textAlign: this.textAlign,
        maxWidth: this.maxWidth,
        lineHeight: this.lineHeight
      });
    }
  }

  clone(): SDFText {
    return new SDFText({
      ...this.cloneGraphicOptions(),
      sdf: this.sdf,
      text: this._text,
      size: this.size,
      color: this.color,
      visibleCharacters: this.visibleCharacters,
      textAlign: this.textAlign,
      maxWidth: this.maxWidth,
      lineHeight: this.lineHeight
    });
  }
}
