import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  // Native / large dependencies stay in node_modules
  packages: 'external',
  // ...but the workspace package is TypeScript source and must be bundled
  plugins: [
    {
      name: 'bundle-workspace',
      setup(b) {
        b.onResolve({ filter: /^@classinteract\/shared$/ }, async () => ({
          path: new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
        }));
      },
    },
  ],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
console.log('API built to dist/index.js');
