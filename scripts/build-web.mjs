import { build } from 'esbuild';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import path from 'node:path';
import schema from '../src/board.schema.json' with { type: 'json' };

// Compile the schema at build time so the browser can keep its strict CSP.
const ajv = new Ajv({ allErrors: true, code: { source: true, esm: true } });
const validator = standaloneCode(ajv, ajv.compile(schema));
await build({
  entryPoints: ['ui/browser-entry.mjs'],
  outfile: 'ui/browser.js',
  bundle: true,
  minify: true,
  platform: 'browser',
  target: 'es2022',
  plugins: [{
    name: 'compiled-board-schema',
    setup(builder) {
      builder.onLoad({ filter: /[/\\]src[/\\]validator\.mjs$/ }, () => ({
        contents: validator,
        resolveDir: path.resolve('src')
      }));
    }
  }]
});
