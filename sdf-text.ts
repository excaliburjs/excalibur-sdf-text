import { Color, ExcaliburGraphicsContext, ExcaliburGraphicsContextWebGL, Graphic, vec } from "excalibur";
import { SDFSource } from "./sdf-font";
import { SDFTextRenderer } from "./sdf-text-renderer";

export interface SDFTextOptions {
  sdf: SDFSource;
  size: number;
  visibleCharacters: number;
  color?: Color;
  text: string;
}

export class SDFText extends Graphic {
  get text() {
    return this.options.text;
  }

  set text(val: string) {
    this.options.text = val;
  }

  constructor(private options: SDFTextOptions) {
    super(); // TODO super GraphicsOptions support
  }

  get visibleCharacters() {
    return this.options.visibleCharacters;
  }

  set visibleCharacters(val: number) {
    this.options.visibleCharacters = val;
  }

  protected _drawImage(ex: ExcaliburGraphicsContext, x: number, y: number): void {
    if (ex instanceof ExcaliburGraphicsContextWebGL) {
      ex.draw<SDFTextRenderer>(
        "ex.sdf-text-renderer",
        this.options.sdf,
        this.options.text,
        vec(x, y),
        this.options.size,
        this.options.visibleCharacters,
        this.options.color
      );
    }
  }

  clone(): SDFText {
    return new SDFText({
      ...this.options
    });
  }

}
