/**
 * What a guest's page does when its heartbeat fails. A failure with no status is the
 * network, which is tried again on the next beat. Otherwise the beat stops: 403, the server
 * took the guest out; 404, the pass ran out; 410, the call ended; anything else is shown.
 */
export function afterFailedBeat(e: unknown): 'retry' | 'removed' | 'ended' | 'failed' {
	const status = (e as { status?: number }).status;
	if (status === undefined) return 'retry';
	if (status === 410) return 'ended';
	if (status === 403 || status === 404) return 'removed';
	return 'failed';
}
