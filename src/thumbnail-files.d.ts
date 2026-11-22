// What wrangler's module rules make of the thumbnail renderer's files (see
// src/lib/server/notes/thumbnail-files.ts).
declare module '@resvg/resvg-wasm/index_bg.wasm' {
	const module: WebAssembly.Module;
	export default module;
}
declare module 'yoga-wasm-web/dist/yoga.wasm' {
	const module: WebAssembly.Module;
	export default module;
}
declare module '@fontsource/inter/files/inter-latin-400-normal.woff' {
	const data: ArrayBuffer;
	export default data;
}
declare module '@fontsource/inter/files/inter-latin-700-normal.woff' {
	const data: ArrayBuffer;
	export default data;
}
