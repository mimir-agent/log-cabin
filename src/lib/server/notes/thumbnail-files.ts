// The thumbnail renderer's WebAssembly and fonts. Workers can't compile WebAssembly from bytes,
// so wrangler's bundler turns each .wasm import into a compiled module (its default rule) and
// each .woff into an ArrayBuffer (the "Data" rule in wrangler.jsonc). Under Vitest,
// vite.config.ts points this module at testing/thumbnail-files.ts, which reads the same files.
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import yogaWasm from 'yoga-wasm-web/dist/yoga.wasm';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff';

export { resvgWasm, yogaWasm, interRegular, interBold };
