#!/usr/bin/env node

import * as fs from 'node:fs';

import { Canvas, FontLibrary, ImageData } from 'skia-canvas'
import TinySDF from "@mapbox/tiny-sdf";
import { SDFFont } from './sdf-font.ts';
import type { SDFGlyph } from './sdf-font.ts';

export class TinySDFHeadless extends TinySDF {
  /**
   * Overrids the built in canvas creation to the Skia canvas for headless
   */
  _createCanvas(size: number) {
    return new Canvas(size, size);
  }
}

const args = process.argv;
const cwd = process.cwd;
// TODO better arg parsing please
const fontFile = args[2];
const fontFamily = args[3]
const outname = args[4];

const sdfFont = new SDFFont({
  fontFile: fontFile, //'./static/PixelifySans-Regular.ttf',
  fontFamily: fontFamily,
  alphabet: [[0x0020, 0x00FF]],
  fontWeight: 100,
  fontSize: 100,

  canvasProvider: (width, height) => new Canvas(width, height),
  sdfProvider: (options) => new TinySDFHeadless(options),
  fontSourceLoader: async (font, family) => { FontLibrary.use(family, [font]) },
  imageDataProvider: (width, height) => new ImageData(width, height),
});

await sdfFont.load();

// Tust me this exists on skia cnavas
const outAtlasFile = `./${outname}.png`;
(sdfFont.atlasCanvas as any).toFileSync(outAtlasFile);

let output: {
  atlas: string,
  glyphs: Record<string, Omit<SDFGlyph, 'data'>>
} = {
  atlas: outAtlasFile,
  glyphs: {}
};

for (const [codePoint, glyph] of sdfFont.glyphs) {
  output.glyphs[codePoint] = {
    ...glyph,
  }
  delete (output.glyphs[codePoint] as any).data
}

const fileOutput = JSON.stringify(output, null, 2);
fs.writeFileSync(`./${outname}.json`, fileOutput);

