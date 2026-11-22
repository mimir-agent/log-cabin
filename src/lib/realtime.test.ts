import { afterEach, beforeEach, expect, it, vi } from 'vitest';

class FakeSocket {
	static OPEN = 1;
	static all: FakeSocket[] = [];
	readyState = 0;
	sent: unknown[] = [];
	onopen?: () => void;
	onmessage?: (event: { data: string }) => void;
	onclose?: (event: { code: number }) => void;
	constructor(public url: URL) {
		FakeSocket.all.push(this);
	}
	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	open() {
		this.readyState = FakeSocket.OPEN;
		this.onopen?.();
	}
	drop(code = 1006) {
		this.readyState = 3;
		this.onclose?.({ code });
	}
}

beforeEach(() => {
	FakeSocket.all = [];
	vi.useFakeTimers();
	vi.resetModules();
	vi.stubGlobal('WebSocket', FakeSocket);
	vi.stubGlobal('location', { href: 'https://camp.example/chat' });
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it('opens one socket to /realtime and subscribes to each topic once it opens', async () => {
	const { subscribe } = await import('./realtime');
	subscribe('thread:t1', () => {});
	subscribe('user:u1', () => {});
	expect(FakeSocket.all.map((s) => s.url.href)).toEqual(['wss://camp.example/realtime']);
	FakeSocket.all[0].open();
	expect(FakeSocket.all[0].sent).toEqual([
		{ type: 'subscribe', topic: 'thread:t1' },
		{ type: 'subscribe', topic: 'user:u1' }
	]);
});

it('reconnects after a drop, subscribes again, and tells listeners to catch up', async () => {
	const { subscribe } = await import('./realtime');
	const heard: unknown[] = [];
	subscribe('thread:t1', (payload) => heard.push(payload));
	FakeSocket.all[0].open();
	FakeSocket.all[0].drop();
	subscribe('user:u1', () => {});
	expect(FakeSocket.all).toHaveLength(1);
	await vi.advanceTimersByTimeAsync(1000);
	expect(FakeSocket.all).toHaveLength(2);
	FakeSocket.all[1].open();
	expect(FakeSocket.all[1].sent).toEqual([
		{ type: 'subscribe', topic: 'thread:t1' },
		{ type: 'subscribe', topic: 'user:u1' }
	]);
	expect(heard).toEqual([{ type: 'resync' }]);
});

it('stays closed when the hub signs the person out', async () => {
	const { subscribe } = await import('./realtime');
	subscribe('user:u1', () => {});
	FakeSocket.all[0].open();
	FakeSocket.all[0].drop(4001);
	await vi.advanceTimersByTimeAsync(60_000);
	expect(FakeSocket.all).toHaveLength(1);
});
