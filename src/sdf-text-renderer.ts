import { Color, QuadIndexBuffer, Shader, VertexBuffer, VertexLayout } from 'excalibur';
import type { ExcaliburGraphicsContextWebGL, HTMLImageSource, RendererPlugin, Vector } from 'excalibur';
import fragmentSource from './shaders/sdf-text.frag.glsl?raw';
import vertexSource from './shaders/sdf-text.vert.glsl?raw';
import type { SDFSource, SDFTextAlign } from './sdf-font';

/**
 * Per draw options for {@link SDFTextRenderer.draw}
 */
export interface SDFDrawOptions {
  /**
   * Only draw the first n characters, handy for typewriter effects. Default all.
   */
  visibleCharacters?: number;
  /**
   * Text color, defaults to the source's color
   */
  color?: Color;
  /**
   * Alignment of lines within the text block. Default 'left'.
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
 * Finds how many `if` branches the fragment shader can hold on this GPU, which bounds how many
 * atlases a batch can reference
 */
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
      testComplexity += i === 0 ? `if (index <= ${i}.5) {\n` : `   else if (index <= ${i}.5) {\n`;
      testComplexity += `      fragColor = vec4(1.0);\n`;
      testComplexity += `   }\n`;
    }
    return testShader.replace('%%complexity%%', testComplexity);
  };

  let canCompile = false;
  do {
    const shader = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(shader, assembleTestShader(numIfs));
    gl.compileShader(shader);
    canCompile = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    gl.deleteShader(shader);
    if (!canCompile) {
      numIfs = (numIfs / 2) | 0;
    }
  } while (!canCompile && numIfs > 0);
  return Math.max(numIfs, 1);
}

/**
 * Name the renderer is registered under on the graphics context
 */
export const SDF_TEXT_RENDERER = 'ex.sdf-text-renderer' as const;

const FLOATS_PER_VERTEX = 9; // position (2) + uv (2) + texture index (1) + color (4)

/**
 * Batched WebGL renderer for SDF text. Register it on the graphics context with
 * {@link SDFTextPlugin}, or by hand with `context.lazyRegister('ex.sdf-text-renderer', () => new SDFTextRenderer())`.
 *
 * Every glyph is one textured quad; quads from any number of {@link SDFText} draws are batched into
 * a single draw call until the vertex buffer or the texture slots fill up.
 */
export class SDFTextRenderer implements RendererPlugin {
  public readonly type = SDF_TEXT_RENDERER;
  public priority: number = 0;

  private _gl!: WebGL2RenderingContext;
  private _context!: ExcaliburGraphicsContextWebGL;
  private _shader!: Shader;
  private _buffer!: VertexBuffer;
  private _quads!: QuadIndexBuffer;
  private _layout!: VertexLayout;

  private _maxGlyphs: number = 10922; // max(uint16) / 6 indices per quad
  private _glyphCount: number = 0;
  private _vertexIndex: number = 0;

  private _maxTextures: number = 1;
  private _textures: WebGLTexture[] = [];
  private _textureToIndex = new Map<WebGLTexture, number>();
  private _images = new Set<HTMLImageSource>();

  private _gamma: number = 0;
  private _halo: number = 0;
  private _quad = [0, 0, 0, 0, 0, 0, 0, 0];

  initialize(gl: WebGL2RenderingContext, context: ExcaliburGraphicsContextWebGL): void {
    this._gl = gl;
    this._context = context;
    const maxTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    this._maxTextures = Math.min(maxTextureUnits, getMaxShaderComplexity(gl, maxTextureUnits));

    this._shader = new Shader({
      name: 'ex.sdf-text-renderer',
      graphicsContext: context,
      vertexSource,
      fragmentSource: this._transformFragmentSource(fragmentSource, this._maxTextures)
    });
    this._shader.compile();
    this._shader.use();
    this._shader.setUniformMatrix('u_matrix', context.ortho);
    // Texture slots are [0, 1, 2, ... maxTextures - 1]
    this._shader.setUniformIntArray(
      'u_textures',
      [...Array(this._maxTextures)].map((_, i) => i)
    );

    this._buffer = new VertexBuffer({
      gl,
      size: FLOATS_PER_VERTEX * 4 * this._maxGlyphs,
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
    this._quads = new QuadIndexBuffer(gl, this._maxGlyphs, true);
  }

  private _transformFragmentSource(source: string, maxTextures: number): string {
    let texturePicker = '';
    for (let i = 0; i < maxTextures; i++) {
      texturePicker += i === 0 ? `if (v_textureIndex <= ${i}.5) {\n` : `   else if (v_textureIndex <= ${i}.5) {\n`;
      texturePicker += `      dist = texture(u_textures[${i}], v_uv).r;\n`;
      texturePicker += `   }\n`;
    }
    return source.replace('%%count%%', maxTextures.toString()).replace('%%texture_picker%%', texturePicker);
  }

  /**
   * Upload the atlas once (the engine's texture loader caches it) and reserve a slot in this batch
   */
  private _addAtlasTexture(image: HTMLImageSource): number {
    const texture = this._context.textureLoader.load(image, undefined, image.getAttribute('forceUpload') === 'true')!;
    image.removeAttribute('forceUpload');
    let index = this._textureToIndex.get(texture);
    if (index === undefined) {
      index = this._textures.length;
      this._textures.push(texture);
      this._textureToIndex.set(texture, index);
      this._images.add(image);
    }
    return index;
  }

  private _isFull(): boolean {
    return this._glyphCount >= this._maxGlyphs || this._textures.length >= this._maxTextures;
  }

  /**
   * Queue a block of text. `pos` is the top left of the text block, `size` the font size in pixels.
   */
  draw(source: SDFSource, text: string, pos: Vector, size: number, options?: SDFDrawOptions): void {
    if (!source.isLoaded) {
      return;
    }
    const { visibleCharacters = Infinity, textAlign = 'left', maxWidth, lineHeight = 1.2 } = options ?? {};
    const color = options?.color ?? source.color;

    // The edge uniforms are per atlas, a change means a new batch
    if (this._gamma !== source.gamma || this._halo !== source.halo) {
      this.flush();
      this._gamma = source.gamma;
      this._halo = source.halo;
    }
    if (this._isFull() && !this._images.has(source.atlas)) {
      this.flush();
    }

    const atlas = source.atlas;
    const textureId = this._addAtlasTexture(atlas);
    const atlasWidth = atlas.width;
    const atlasHeight = atlas.height;
    const transform = this._context.getTransform();
    const vertices = this._layout.vertexBuffer.bufferData;

    const scale = size / source.fontSize;
    const lines = source.getLines(text, size, maxWidth);
    const blockWidth = maxWidth ?? Math.max(...lines.map((line) => source.measureLine(line, size)));
    const alignFactor = textAlign === 'center' ? 0.5 : textAlign === 'right' ? 1 : 0;

    let drawn = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let penX = pos.x + (blockWidth - source.measureLine(line, size)) * alignFactor;
      const baseline = pos.y + source.ascent * scale + lineIndex * size * lineHeight;

      for (const char of line) {
        if (drawn >= visibleCharacters) {
          return;
        }
        drawn++;
        const glyph = source.glyphs.get(char);
        if (!glyph) {
          continue;
        }
        if (this._isFull()) {
          // flush keeps the current atlas resident so the texture index stays valid
          const resident = atlas;
          this.flush();
          this._addAtlasTexture(resident);
        }

        // tiny-sdf rasterizes each glyph at (buffer, buffer + glyphTop) inside its cell
        const x = penX + (glyph.glyphLeft - source.buffer) * scale;
        const y = baseline - (glyph.glyphTop + source.buffer) * scale;
        const w = glyph.width * scale;
        const h = glyph.height * scale;
        penX += glyph.glyphAdvance * scale;

        const quad = this._quad;
        quad[0] = x;
        quad[1] = y;
        quad[2] = x + w;
        quad[3] = y;
        quad[4] = x;
        quad[5] = y + h;
        quad[6] = x + w;
        quad[7] = y + h;
        transform.multiplyQuadInPlace(quad);

        const u0 = glyph.x / atlasWidth;
        const v0 = glyph.y / atlasHeight;
        const u1 = (glyph.x + glyph.width) / atlasWidth;
        const v1 = (glyph.y + glyph.height) / atlasHeight;

        this._pushVertex(vertices, quad[0], quad[1], u0, v0, textureId, color);
        this._pushVertex(vertices, quad[4], quad[5], u0, v1, textureId, color);
        this._pushVertex(vertices, quad[2], quad[3], u1, v0, textureId, color);
        this._pushVertex(vertices, quad[6], quad[7], u1, v1, textureId, color);
        this._glyphCount++;
      }
    }
  }

  private _pushVertex(vertices: Float32Array, x: number, y: number, u: number, v: number, textureId: number, color: Color) {
    vertices[this._vertexIndex++] = x;
    vertices[this._vertexIndex++] = y;
    vertices[this._vertexIndex++] = u;
    vertices[this._vertexIndex++] = v;
    vertices[this._vertexIndex++] = textureId;
    vertices[this._vertexIndex++] = color.r / 255;
    vertices[this._vertexIndex++] = color.g / 255;
    vertices[this._vertexIndex++] = color.b / 255;
    vertices[this._vertexIndex++] = color.a;
  }

  public get hasPendingDraws(): boolean {
    return this._glyphCount !== 0;
  }

  flush(): void {
    if (this._glyphCount === 0) {
      return;
    }
    const gl = this._gl;
    this._shader.use();
    this._layout.use(true, FLOATS_PER_VERTEX * 4 * this._glyphCount);
    this._shader.setUniformMatrix('u_matrix', this._context.ortho);
    this._shader.setUniformFloat('u_gamma', this._gamma);
    this._shader.setUniformFloat('u_buffer', this._halo);

    for (let i = 0; i < this._maxTextures; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this._textures[i] || this._textures[0]);
    }

    this._quads.bind();
    gl.drawElements(gl.TRIANGLES, this._glyphCount * 6, this._quads.bufferGlType, 0);

    this._glyphCount = 0;
    this._vertexIndex = 0;
    this._textures.length = 0;
    this._textureToIndex.clear();
    this._images.clear();
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
