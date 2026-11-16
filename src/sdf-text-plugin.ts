import { ExcaliburGraphicsContextWebGL, Plugin } from 'excalibur';
import type { ExcaliburGraphicsContext } from 'excalibur';
import { SDF_TEXT_RENDERER, SDFTextRenderer } from './sdf-text-renderer';

/**
 * Installs the {@link SDFTextRenderer} on the engine's WebGL graphics context.
 *
 * ```typescript
 * const game = new ex.Engine({ plugins: [new SDFTextPlugin()] });
 * ```
 */
export class SDFTextPlugin extends Plugin {
  constructor() {
    super('sdf-text');
  }

  override onGraphicsPostInitialize(context: ExcaliburGraphicsContext): void {
    if (context instanceof ExcaliburGraphicsContextWebGL) {
      // Lazy: the renderer compiles its shader the first time an SDFText is drawn
      context.lazyRegister(SDF_TEXT_RENDERER, () => new SDFTextRenderer());
    }
  }
}
