import { attachmentPath, type DocNode } from './doc.js';

export type Uploaded = { id: string; name: string; size: number; contentType: string };

/** Sends one file to an upload endpoint; throws the server's message if it refuses. */
export async function uploadFile(uploadUrl: string, file: File): Promise<Uploaded> {
	const body = new FormData();
	body.append('file', file);
	const response = await fetch(uploadUrl, { method: 'POST', body });
	if (!response.ok) {
		// A proxy or the platform can answer with a non-JSON error page.
		const error = await response.json().catch(() => ({ message: response.statusText }));
		throw new Error((error as { message: string }).message);
	}
	return (await response.json()) as Uploaded;
}

/** The node a document holds for an uploaded file: a picture for an image, else a file card. */
export function fileNode({ id, name, size, contentType }: Uploaded): DocNode {
	return contentType.startsWith('image/')
		? { type: 'image', attrs: { src: attachmentPath(id), alt: name } }
		: { type: 'attachment', attrs: { id, name, size, contentType } };
}
