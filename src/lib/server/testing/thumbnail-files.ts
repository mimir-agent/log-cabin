// Stands in for notes/thumbnail-files.ts under Vitest (see vite.config.ts): the same files,
// read from node_modules and compiled here, since Node may compile WebAssembly from bytes.
import { readFileSync } from 'node:fs';

const bytes = (path: string) => new Uint8Array(readFileSync(`node_modules/${path}`));

export const resvgWasm = new WebAssembly.Module(bytes('@resvg/resvg-wasm/index_bg.wasm'));
export const yogaWasm = new WebAssembly.Module(bytes('yoga-wasm-web/dist/yoga.wasm'));
export const interRegular = bytes('@fontsource/inter/files/inter-latin-400-normal.woff').buffer;
export const interBold = bytes('@fontsource/inter/files/inter-latin-700-normal.woff').buffer;
