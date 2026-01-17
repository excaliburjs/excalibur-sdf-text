
import TinySDF, { TinySDFOptions } from '@mapbox/tiny-sdf';
import { Actor, BoundingBox, Color, Engine, ExcaliburGraphicsContext, ExcaliburGraphicsContextWebGL, Graphic, HTMLImageSource, ImageSource, ImageSourceAttributeConstants, parseImageFiltering, parseImageWrapping, QuadIndexBuffer, RendererPlugin, Shader, vec, Vector, VertexBuffer, VertexLayout } from 'excalibur';

import fragmentSource from './sdf-text.frag.glsl?raw';
import vertexSource from './sdf-text.vert.glsl?raw';

export interface SDFFontOptions {
  fontFile: string; // ttf file
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
   */
  alphabet?: string; // string of glyphs you wish to support in the sdf
  /**
   * Intended font size for this sdf font
   *
   * Roughly pick the "biggest" size your text will be for the highest quality
   */
  fontSize?: number;
}

export interface SDFGlyph {
  /**
   * Grayscale image data
   */
  data: Uint8ClampedArray;
  /**
   * SDF image data width
   */
  width: number;
  /**
   * SDF image data height
   */
  height: number;
  /**
   * Actual glyph width
   */
  glyphWidth: number;
  /**
   * Actual glyph height
   */
  glyphHeight: number;
  /**
   * Top of the glyph (y coord)
   */
  glyphTop: number;
  /**
   * Left of the glyph (x coord)
   */
  glyphLeft: number;
  /**
   * Amount the glyph advances the cursor/pen while writing
   */
  glyphAdvance: number;
}


export class SDFFont {
  atlasCanvas: HTMLCanvasElement;
  atlasCtx: CanvasRenderingContext2D;

  // codepoint to Glyph info
  glyphs: Map<string, SDFGlyph> = new Map();
  glyphAtlasLocation: Map<string, { x: number, y: number }> = new Map();

  private __tinySdf: TinySDF;
  private _color: Color;
  private _fontSize: number = 16;

  private _size: number;
  private _buffer: number;
  private _radius: number;

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



  constructor(private options: SDFFontOptions) {
    this.atlasCanvas = document.createElement('canvas');
    if (!this.atlasCanvas) throw new Error("Cannot Build SDF Font Atlas Canvas");
    this.atlasCtx = this.atlasCanvas.getContext('2d')!;
    if (!this.atlasCtx) throw new Error("Cannot Build SDF Font Atlas Context");

    this._color = options.color ?? Color.Black;

    this._fontSize = options.fontSize ?? this._fontSize;
    const fontWeight = options.fontWeight?.toString() ?? '100'; // TODO default
    const fontStyle = options.fontStyle ?? 'normal';
    const alphabet = options.alphabet ?? '🎶🎉🎂❤️◑﹏◐ abcdefghijklmnopqrstuvwxyz~!@#$%^&*\(\)<>?\'\":;ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890{}\\|';

    const buffer = Math.ceil(fontSize / 8);
    this._buffer = buffer;

    const radius = Math.ceil(fontSize / 3);
    this._radius = radius;

    const size = fontSize + buffer * 2;
    this._size = size;

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
    // This is goofy but it's the best way to support unicode/emojis in a string
    const codePoints = alphabet[Symbol.iterator]();
    let nextCodePoint = codePoints.next();
    if (nextCodePoint?.done) return;

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
        this.atlasCtx.putImageData(this._makeRGBAImageData(data, width, height), x, y);
        this.glyphAtlasLocation.set(codePoint, { x, y });

        // next iter
        nextCodePoint = codePoints.next();
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



  private _cachedText?: string;
  private _cachedLines?: string[];
  private _cachedRenderWidth?: number;
  protected _getLinesFromText(text: string, maxWidth?: number) {
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
      if (this.measureText(line).width > maxWidth) {
        while (this.measureText(line).width > maxWidth) {
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

  public measureText(text: string, maxWidth?: number): BoundingBox {
    return new BoundingBox();

    // TODO this needs to be loaded first I think

    // const lines = this._getLinesFromText(text, maxWidth);
    // const maxWidthLine = lines.reduce((a, b) => {
    //   return a.length > b.length ? a : b;
    // });
    //
    // const sprites = this._getCharacterSprites(maxWidthLine);
    // let width = 0;
    // let height = 0;
    // for (const sprite of sprites) {
    //   width += sprite.width + this.spacing;
    //   height = Math.max(height, sprite.height);
    // }
    // return BoundingBox.fromDimension(width * this.scale.x, height * lines.length * this.scale.y, Vector.Zero);
  }

  async load() {
    // TODO load the font file with the excalibur font loader 

  }
}


export function getMaxShaderComplexity(gl: WebGL2RenderingContext, numIfs: number): number {
  const assembleTestShader = (numIfs: number) => {
    const testShader = `#version 300 es
    precision mediump float;
    out vec4 fragColor;
    void main() {
      float index = 1.01;
      %%complexity%%
    }`;
    let testComplexity = '';
    for (let i = 0; i < numIfs; i++) {
      if (i === 0) {
        testComplexity += `if (index <= ${i}.5) {\n`;
      } else {
        testComplexity += `   else if (index <= ${i}.5) {\n`;
      }

      testComplexity += `      fragColor = vec4(1.0);\n`;
      testComplexity += `   }\n`;
    }
    return testShader.replace('%%complexity%%', testComplexity);
  };

  let canCompile = false;
  do {
    const test = assembleTestShader(numIfs);

    const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, test);
    gl.compileShader(shader);

    canCompile = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!canCompile) {
      numIfs = (numIfs / 2) | 0;
    }
  } while (!canCompile);
  return numIfs;
}

export class SDFTextRenderer implements RendererPlugin {
  public readonly type = 'ex.sdf-text-renderer' as const;
  public priority: number = 0;
  private _gl: WebGL2RenderingContext;
  private _context: ExcaliburGraphicsContextWebGL;
  private _shader: Shader;
  private _buffer: VertexBuffer;
  private _quads: QuadIndexBuffer;
  private _layout: VertexLayout;


  private _maxImages: number = 10922; // max(uint16) / 6 verts
  private _imageCount: number = 0;

  private _maxTextures: number;
  private _textures: WebGLTexture[] = [];
  private _textureIndex = 0;
  private _textureToIndex = new Map<WebGLTexture, number>();
  private _images = new Set<HTMLImageSource>();

  private _vertexIndex: number = 0;

  // Batch render SDF text up to n number of SDFFonts to texture limit

  initialize(gl: WebGL2RenderingContext, context: ExcaliburGraphicsContextWebGL): void {

    this._gl = gl;
    this._context = context;
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    const maxComplexity = getMaxShaderComplexity(gl, maxTexture);
    this._maxTextures = Math.min(maxTexture, maxComplexity);
    const transformedFrag = this._transformFragmentSource(fragmentSource, this._maxTextures);
    // Compile shader
    this._shader = new Shader({
      graphicsContext: context,
      fragmentSource: transformedFrag,
      vertexSource: vertexSource
    });
    this._shader.compile();

    // setup uniforms
    this._shader.use();
    this._shader.setUniformMatrix('u_matrix', context.ortho);
    // Initialize texture slots to [0, 1, 2, 3, 4, .... maxGPUTextures]
    this._shader.setUniformIntArray(
      'u_textures',
      [...Array(this._maxTextures)].map((_, i) => i)
    );

    // Setup memory layout
    this._buffer = new VertexBuffer({
      gl,
      size: 9 * 4 * this._maxImages, // 9 components * 4 verts
      type: 'dynamic'
    });
    this._layout = new VertexLayout({
      gl,
      shader: this._shader,
      vertexBuffer: this._buffer,
      attributes: [
        ['a_position', 2],
        ['a_uv', 2],
        ['a_textureIndex', 1],
        ['a_color', 4]
      ]
    });

    // Setup index buffer
    this._quads = new QuadIndexBuffer(gl, this._maxImages, true);
  }


  private _transformFragmentSource(source: string, maxTextures: number): string {
    let newSource = source.replace('%%count%%', maxTextures.toString());
    let texturePickerBuilder = '';
    for (let i = 0; i < maxTextures; i++) {
      if (i === 0) {
        texturePickerBuilder += `if (v_textureIndex <= ${i}.5) {\n`;
      } else {
        texturePickerBuilder += `   else if (v_textureIndex <= ${i}.5) {\n`;
      }

      texturePickerBuilder += `      dist = texture(u_textures[${i}], v_uv).r;\n`;
      texturePickerBuilder += `   }\n`;
    }
    newSource = newSource.replace('%%texture_picker%%', texturePickerBuilder);
    return newSource;
  }


  private _addImageAsTexture(image: HTMLImageSource) {
    if (this._images.has(image)) {
      return;
    }
    const maybeFiltering = image.getAttribute(ImageSourceAttributeConstants.Filtering);
    const filtering = maybeFiltering ? parseImageFiltering(maybeFiltering) : undefined;
    const wrapX = parseImageWrapping(image.getAttribute(ImageSourceAttributeConstants.WrappingX) as any);
    const wrapY = parseImageWrapping(image.getAttribute(ImageSourceAttributeConstants.WrappingY) as any);

    const force = image.getAttribute('forceUpload') === 'true' ? true : false;
    const texture = this._context.textureLoader.load(
      image,
      {
        filtering,
        wrapping: { x: wrapX, y: wrapY }
      },
      force
    )!;
    // remove force attribute after upload
    image.removeAttribute('forceUpload');
    if (this._textures.indexOf(texture) === -1) {
      this._textures.push(texture);
      this._textureToIndex.set(texture, this._textureIndex++);
      this._images.add(image);
    }
  }

  private _bindTextures(gl: WebGLRenderingContext) {
    // Bind textures in the correct order
    for (let i = 0; i < this._maxTextures; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this._textures[i] || this._textures[0]);
    }
  }

  private _getTextureIdForImage(image: HTMLImageSource) {
    if (image) {
      const maybeTexture = this._context.textureLoader.get(image);
      return this._textureToIndex.get(maybeTexture) ?? -1; //this._textures.indexOf(maybeTexture);
    }
    return -1;
  }

  private _isFull() {
    if (this._imageCount >= this._maxImages) {
      return true;
    }
    if (this._textures.length >= this._maxTextures) {
      return true;
    }
    return false;
  }


  private _imageToWidth = new Map<HTMLImageSource, number>();
  private _getImageWidth(image: HTMLImageSource) {
    let maybeWidth = this._imageToWidth.get(image);
    if (maybeWidth === undefined) {
      maybeWidth = image.width;
      this._imageToWidth.set(image, maybeWidth);
    }
    return maybeWidth;
  }

  private _imageToHeight = new Map<HTMLImageSource, number>();
  private _getImageHeight(image: HTMLImageSource) {
    let maybeHeight = this._imageToHeight.get(image);
    if (maybeHeight === undefined) {
      maybeHeight = image.height;
      this._imageToHeight.set(image, maybeHeight);
    }
    return maybeHeight;
  }

  private _dest = [0, 0];
  private _quad = [0, 0, 0, 0, 0, 0, 0, 0];

  private _sdfGamma: number = 2 * 1.4142 / 16;
  private _sdfHalo: number = .75;
  private _defaultColor = Color.Black;

  draw(font: SDFFont, text: string, pos: Vector, size: number, color?: Color): void {
    // Force a render if the batch is full
    if (this._isFull()) {
      this.flush();
    }

    if (this._sdfGamma !== font.gamma ||
      this._sdfHalo !== font.halo) {
      this.flush();
      this._sdfGamma = font.gamma;
      this._sdfHalo = font.halo;
    }

    if (!color) {
      color = font.color ?? this._defaultColor;
    }

    // This creates and uploads the texture if not already done
    this._addImageAsTexture(font.atlasCanvas);
    const maybeImageWidth = this._getImageWidth(font.atlasCanvas);
    const maybeImageHeight = this._getImageHeight(font.atlasCanvas);
    const textureId = this._getTextureIdForImage(font.atlasCanvas);

    const transform = this._context.getTransform();
    const vertexBuffer = this._layout.vertexBuffer.bufferData;

    let pen = pos.clone();
    // for of is correct to iterate on emoji code points, index acess does not wor
    for (const char of text) {
      if (this._isFull()) {
        this.flush();
      }
      const glyph = font.glyphs.get(char);
      const glyphPos = font.glyphAtlasLocation.get(char);
      if (!glyph || !glyphPos) continue;

      const sx = glyphPos.x;
      const sy = glyphPos.y;
      const sw = glyph.width;
      const sh = glyph.height;

      const scale = size / font.fontSize; // TODO calculate this from font size?

      const baseline = font.fontSize / 2 + font.buffer;


      // TODO for each glyph add a quad
      this._imageCount++;

      // generate geometry
      this._dest[0] = pen.x;
      this._dest[1] = pen.y - (glyph.height - baseline) * scale;

      // top left
      this._quad[0] = this._dest[0];
      this._quad[1] = this._dest[1];

      // top right
      this._quad[2] = this._dest[0] + glyph.width * scale;
      this._quad[3] = this._dest[1];

      // bottom left
      this._quad[4] = this._dest[0];
      this._quad[5] = this._dest[1] + glyph.height * scale;

      // bottom right
      this._quad[6] = this._dest[0] + glyph.width * scale;
      this._quad[7] = this._dest[1] + glyph.height * scale;

      // advnace pen
      pen.x += glyph.glyphAdvance * scale;
      // FIXME max width or newline new row
      // pen.y += 

      transform.multiplyQuadInPlace(this._quad);


      const imageWidth = maybeImageWidth;
      const imageHeight = maybeImageHeight;

      // TODO uv padding needed?
      const uvx0 = (sx) / imageWidth;
      const uvy0 = (sy) / imageHeight;
      const uvx1 = (sx + sw) / imageWidth;
      const uvy1 = (sy + sh) / imageHeight;


      // (0, 0) - 0
      vertexBuffer[this._vertexIndex++] = this._quad[0];
      vertexBuffer[this._vertexIndex++] = this._quad[1];
      vertexBuffer[this._vertexIndex++] = uvx0;
      vertexBuffer[this._vertexIndex++] = uvy0;
      vertexBuffer[this._vertexIndex++] = textureId;
      vertexBuffer[this._vertexIndex++] = color.r / 255;
      vertexBuffer[this._vertexIndex++] = color.g / 255;
      vertexBuffer[this._vertexIndex++] = color.b / 255;
      vertexBuffer[this._vertexIndex++] = color.a;

      // (0, 1) - 1
      vertexBuffer[this._vertexIndex++] = this._quad[4];
      vertexBuffer[this._vertexIndex++] = this._quad[5];
      vertexBuffer[this._vertexIndex++] = uvx0;
      vertexBuffer[this._vertexIndex++] = uvy1;
      vertexBuffer[this._vertexIndex++] = textureId;
      vertexBuffer[this._vertexIndex++] = color.r / 255;
      vertexBuffer[this._vertexIndex++] = color.g / 255;
      vertexBuffer[this._vertexIndex++] = color.b / 255;
      vertexBuffer[this._vertexIndex++] = color.a;

      // (1, 0) - 2
      vertexBuffer[this._vertexIndex++] = this._quad[2];
      vertexBuffer[this._vertexIndex++] = this._quad[3];
      vertexBuffer[this._vertexIndex++] = uvx1;
      vertexBuffer[this._vertexIndex++] = uvy0;
      vertexBuffer[this._vertexIndex++] = textureId;
      vertexBuffer[this._vertexIndex++] = color.r / 255;
      vertexBuffer[this._vertexIndex++] = color.g / 255;
      vertexBuffer[this._vertexIndex++] = color.b / 255;
      vertexBuffer[this._vertexIndex++] = color.a;

      // (1, 1) - 3
      vertexBuffer[this._vertexIndex++] = this._quad[6];
      vertexBuffer[this._vertexIndex++] = this._quad[7];
      vertexBuffer[this._vertexIndex++] = uvx1;
      vertexBuffer[this._vertexIndex++] = uvy1;
      vertexBuffer[this._vertexIndex++] = textureId;
      vertexBuffer[this._vertexIndex++] = color.r / 255;
      vertexBuffer[this._vertexIndex++] = color.g / 255;
      vertexBuffer[this._vertexIndex++] = color.b / 255;
      vertexBuffer[this._vertexIndex++] = color.a;
    }

  }

  hasPendingDraws(): boolean {
    return this._imageCount !== 0;
  }

  flush(): void {
    // nothing to draw early exit
    if (this._imageCount === 0) {
      return;
    }

    const gl = this._gl;
    // Bind the shader
    this._shader.use();

    // Bind the memory layout and upload data
    this._layout.use(true, 4 * 9 * this._imageCount); // 4 verts * 9 components

    // Update ortho matrix uniform
    this._shader.setUniformMatrix('u_matrix', this._context.ortho);

    // Update uniforms from current sdf font
    this._shader.setUniformFloat('u_gamma', this._sdfGamma);
    this._shader.setUniformFloat('u_buffer', this._sdfHalo);

    // Bind textures to
    this._bindTextures(gl);

    // Bind index buffer
    this._quads.bind();

    // Draw all the quads
    gl.drawElements(gl.TRIANGLES, this._imageCount * 6, this._quads.bufferGlType, 0);

    // FIXME no way to report diagnostics from outside ex
    // GraphicsDiagnostics.DrawnImagesCount += this._imageCount;
    // GraphicsDiagnostics.DrawCallCount++;

    // Reset
    this._imageCount = 0;
    this._vertexIndex = 0;
    this._textures.length = 0;
    this._textureIndex = 0;
    this._textureToIndex.clear();
    this._images.clear();
    this._imageToWidth.clear();
    this._imageToHeight.clear();
  }

  dispose(): void {
    this._buffer.dispose();
    this._quads.dispose();
    this._shader.dispose();
    this._textures.length = 0;
    this._context = null as any;
    this._gl = null as any;
  }
}

export interface SDFTextOptions {
  sdfFont: SDFFont;
  size: number;
  color?: Color;
  text: string;
}
export class SDFText extends Graphic {
  constructor(private options: SDFTextOptions) {
    super(); // TODO super GraphicsOptions support
  }

  protected _drawImage(ex: ExcaliburGraphicsContext, x: number, y: number): void {
    if (ex instanceof ExcaliburGraphicsContextWebGL) {
      ex.draw<SDFTextRenderer>(
        "ex.sdf-text-renderer",
        this.options.sdfFont,
        this.options.text,
        vec(x, y),
        this.options.size,
        this.options.color
      );
    }
  }

  clone(): Graphic {
    throw new Error('Method not implemented.');
  }

}

const glsl = tags => tags[0];

const fontSize = 100;
const sdfFont = new SDFFont({
  fontFile: './static/Roboto-Regular.ttf',
  fontWeight: 100,
  fontSize
});


const game = new Engine({
  width: 800,
  height: 800
});

// TODO plugin system
(game.graphicsContext as ExcaliburGraphicsContextWebGL).lazyRegister("ex.sdf-text-renderer", () => new SDFTextRenderer());

await game.start();


const textAtlas = ImageSource.fromHtmlCanvasElement(sdfFont.atlasCanvas);
await textAtlas.ready;

const textActor = new Actor({
  width: 400,
  height: 400,
  color: Color.Red,
  pos: vec(400, 400)
});
// TODO this will be replaced by a SDF Renderer
textActor.graphics.material = game.graphicsContext.createMaterial({
  name: 'text',
  color: Color.Violet,
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
      float alpha = smoothstep(u_buffer - u_gamma, u_buffer + u_gamma, dist);
      fragColor = vec4(u_color.rgb, alpha * u_color.a);
      fragColor.rgb *= fragColor.a;
    }
  `,
  uniforms: {
    u_gamma: 2 * 1.4142 / fontSize,
    u_buffer: .75
  },
  images: {
    u_text_atlas: textAtlas // TODO add ready check
  }

});
game.add(textActor);

const sdfActor = new Actor({
  pos: vec(100, 100),
  width: 100,
  height: 100,
  graphic: new SDFText({
    sdfFont,
    color: Color.Purple,
    text: '🎉🎂Hello SDF Text! ◑﹏◐ !',
    size: 32
  }),
});
game.add(sdfActor);

// Add visible glyphs
// TODO text effects
// TODO support ansi codes for colors???
// TODO handle newlines
// TODO handle measureText

document.body.appendChild(sdfFont.atlasCanvas);
