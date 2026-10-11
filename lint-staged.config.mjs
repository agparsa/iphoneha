// pre-commit: Prettier for everything staged, ESLint --fix for source files.
// Each workspace package has its own flat ESLint config and its own eslint
// binary, so ESLint is run from inside the package that owns the file
// (a repo-root `eslint` would pick up neither).
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname);
const packages = ['apps/api', 'apps/web', 'packages/shared', 'e2e'];

const quote = (file) => `'${file.replaceAll("'", "'\\''")}'`;

/** @type {import('lint-staged').Configuration} */
export default {
  '*.{ts,tsx,mjs,cjs,js}': (files) => {
    const commands = [`prettier --write ${files.map(quote).join(' ')}`];
    for (const pkg of packages) {
      const own = files.filter((file) => relative(resolve(root, pkg), file).startsWith('..') === false);
      if (own.length > 0) {
        commands.push(`pnpm -C ${pkg} exec eslint --fix --no-warn-ignored ${own.map(quote).join(' ')}`);
      }
    }
    return commands;
  },
  '*.{json,yml,yaml,css,md}': 'prettier --write',
};
