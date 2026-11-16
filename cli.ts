#!/usr/bin/env node
// Generates an SDF atlas (png + json) from a font file, headless with skia-canvas.
// Usage: ex-generate-sdf <font-file> <font-family> <out-name> [font-size] [alphabet-start-hex alphabet-end-hex]
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Canvas, FontLibrary, ImageData } from 'skia-canvas';
import TinySDF from '@mapbox/tiny-sdf';
import { SDFFont } from './src/sdf-font.ts';

class TinySDFHeadless extends TinySDF {
  /**
   * Overrides the built in canvas creation to use the skia canvas for headless generation
   */
  _createCanvas(size: number) {
    return new Canvas(size, size);
  }
}

const [fontFile, fontFamily, outName, fontSizeArg, startHex, endHex] = process.argv.slice(2);
if (!fontFile || !fontFamily || !outName) {
  console.error('Usage: ex-generate-sdf <font-file> <font-family> <out-name> [font-size=64] [alphabet-start-hex=20 alphabet-end-hex=7E]');
  process.exit(1);
}
const fontSize = fontSizeArg ? Number(fontSizeArg) : 64;
const alphabet: [number, number] = [parseInt(startHex ?? '20', 16), parseInt(endHex ?? '7E', 16)];

const sdfFont = new SDFFont({
  fontFile,
  fontFamily,
  alphabet: [alphabet],
  fontSize,
  canvasProvider: (width, height) => new Canvas(width, height) as unknown as HTMLCanvasElement,
  sdfProvider: (options) => new TinySDFHeadless(options),
  fontSourceLoader: async (file, family) => {
    FontLibrary.use(family, [file]);
  },
  imageDataProvider: (width, height) => new ImageData(width, height)
});

await sdfFont.load();

const atlasFile = `${outName}.png`;
const metadataFile = `${outName}.json`;
// skia-canvas's Canvas has toFileSync, it is not on the DOM type
(sdfFont.atlas as any).toFileSync(atlasFile);
const metadata = sdfFont.toMetadata('./' + path.basename(atlasFile));
fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
console.log(`wrote ${atlasFile} (${sdfFont.atlas.width}x${sdfFont.atlas.height}, ${sdfFont.glyphs.size} glyphs) and ${metadataFile}`);
