import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig } from 'tsup';

/**
 * esbuild keeps relative imports as written (`./enums`), but an ESM package
 * must name the file (`./enums.js`), or bundlers resolving it "fully
 * specified" refuse it. Every relative import here points at a file.
 */
async function addJsExtensions(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await addJsExtensions(file);
    } else if (entry.name.endsWith('.js')) {
      const source = await readFile(file, 'utf8');
      const fixed = source.replace(
        /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+?)(?<!\.js)\2/g,
        (_match, lead: string, quote: string, specifier: string) => `${lead}${quote}${specifier}.js${quote}`,
      );
      if (fixed !== source) await writeFile(file, fixed);
    }
  }
}

export default defineConfig([
  // Node (the API, jest): a single CommonJS bundle
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    sourcemap: true,
    target: 'es2022',
    outExtension: () => ({ js: '.cjs' }),
  },
  // The storefront: one ES module per source file. The package is free of side
  // effects, so a page that only formats prices never pulls in the zod schemas
  // (≈90 KB gzipped of code that would otherwise run on every page load).
  {
    entry: ['src/**/*.ts', '!src/**/__tests__/**'],
    format: ['esm'],
    bundle: false,
    sourcemap: true,
    target: 'es2022',
    dts: { entry: { index: 'src/index.ts' } },
    outExtension: () => ({ js: '.js' }),
    onSuccess: () => addJsExtensions('dist'),
  },
]);
