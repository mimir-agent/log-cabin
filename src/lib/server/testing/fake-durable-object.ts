// A Durable Object's state and an R2 bucket for tests: the instance's SQLite on node:sqlite
// behind the slice of ctx.storage the hub calls, plus hibernating sockets the test drives.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/** A hibernating socket as a hub sees it: an attachment it reads back, and what it was sent. */
export class FakeSocket {
	sent: (string | Uint8Array)[] = [];
	closed: { code: number; reason: string } | null = null;
	readyState: number = WebSocket.OPEN;
	constructor(private attachment: unknown) {}
	serializeAttachment(value: unknown) {
		this.attachment = structuredClone(value);
	}
	deserializeAttachment() {
		return structuredClone(this.attachment);
	}
	send(message: string | Uint8Array) {
		if (this.readyState !== WebSocket.OPEN) throw new TypeError('send() after close()');
		this.sent.push(message);
	}
	close(code: number, reason: string) {
		this.closed = { code, reason };
		this.readyState = WebSocket.CLOSED;
	}
}

export function fakeDurableObjectState() {
	let sqlite = new DatabaseSync(':memory:');
	const sockets: FakeSocket[] = [];
	let alarm: number | null = null;
	const sql = {
		exec(query: string, ...bindings: SQLInputValue[]) {
			const statement = sqlite.prepare(query);
			const returnsRows = statement.columns().length > 0;
			const rows = returnsRows ? statement.all(...bindings) : (statement.run(...bindings), []);
			return {
				toArray: () => rows,
				one: () => {
					if (rows.length !== 1)
						throw new Error(`expected one row from "${query}", got ${rows.length}`);
					return rows[0];
				}
			};
		}
	};
	const ctx = {
		storage: {
			sql,
			transactionSync<T>(fn: () => T): T {
				sqlite.exec('BEGIN');
				try {
					const result = fn();
					sqlite.exec('COMMIT');
					return result;
				} catch (e) {
					sqlite.exec('ROLLBACK');
					throw e;
				}
			},
			setAlarm: async (at: number) => void (alarm = at),
			getAlarm: async () => alarm,
			deleteAlarm: async () => void (alarm = null),
			deleteAll: async () => void (sqlite = new DatabaseSync(':memory:'))
		},
		acceptWebSocket: (socket: FakeSocket) => sockets.push(socket),
		getWebSockets: (tag?: string) =>
			sockets.filter(
				(s) => !tag || tag === `user:${(s.deserializeAttachment() as { userId: string }).userId}`
			)
	};
	return { ctx: ctx as unknown as DurableObjectState, sockets, alarm: () => alarm };
}

export function fakeBucket() {
	const objects = new Map<string, Uint8Array>();
	const uploads = new Map<string, Map<number, Uint8Array>>();
	const stored = (key: string, value: Uint8Array, range?: { offset: number; length: number }) => {
		// The deployed Worker answered 500 for a range past the end, so this fails one as R2 did there.
		if (range && range.offset >= value.length) throw new Error(`R2 get ${key}: invalid range`);
		const bytes = range ? value.slice(range.offset, range.offset + range.length) : value.slice();
		return {
			size: value.length,
			httpEtag: `"${key}"`,
			writeHttpMetadata: (headers: Headers) => headers.set('content-type', 'video/webm'),
			body: new Blob([bytes]).stream(),
			arrayBuffer: async () => bytes.buffer
		};
	};
	const multipart = (key: string, uploadId: string) => ({
		uploadPart: async (partNumber: number, body: ArrayBuffer) => {
			uploads.get(uploadId)!.set(partNumber, new Uint8Array(body));
			return { partNumber, etag: `etag-${partNumber}` };
		},
		complete: async (parts: { partNumber: number }[]) => {
			const sent = uploads.get(uploadId)!;
			const chunks = parts.map((p) => [...sent.get(p.partNumber)!]);
			// R2 answers 500 to an upload whose parts, but the last, are not all the same size.
			const sizes = chunks.slice(0, -1).map((c) => c.length);
			if (sizes.some((n) => n !== sizes[0])) {
				throw new Error(`R2 complete ${key}: expected equal part sizes but the last, got ${sizes}`);
			}
			objects.set(key, new Uint8Array(chunks.flat()));
			uploads.delete(uploadId);
		},
		abort: async () => void uploads.delete(uploadId)
	});
	const bucket = {
		get: async (key: string, options?: { range?: { offset: number; length: number } }) => {
			const value = objects.get(key);
			return value ? stored(key, value, options?.range) : null;
		},
		head: async (key: string) => {
			const value = objects.get(key);
			return value ? stored(key, value) : null;
		},
		put: async (key: string, value: Uint8Array) => void objects.set(key, value.slice()),
		delete: async (keys: string | string[]) => {
			const all = [keys].flat();
			// R2 answers 500 to a delete of more than 1000 keys.
			if (all.length > 1000) {
				throw new Error(`R2 delete: expected at most 1000 keys, got ${all.length}`);
			}
			for (const key of all) objects.delete(key);
		},
		/** Pages of 1000 keys, as R2 lists them; the cursor is the last key listed, so deleting as you page is safe. */
		list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
			const matching = [...objects.keys()]
				.filter((key) => key.startsWith(prefix) && (cursor === undefined || key > cursor))
				.sort();
			const page = matching.slice(0, 1000);
			const truncated = matching.length > 1000;
			return {
				objects: page.map((key) => ({ key })),
				truncated,
				cursor: truncated ? page.at(-1) : undefined
			};
		},
		createMultipartUpload: async (key: string) => {
			const uploadId = `upload-${uploads.size + 1}`;
			uploads.set(uploadId, new Map());
			return { uploadId, ...multipart(key, uploadId) };
		},
		resumeMultipartUpload: multipart
	};
	return { bucket: bucket as unknown as R2Bucket, objects, uploads };
}
