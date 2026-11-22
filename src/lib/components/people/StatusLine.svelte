<script lang="ts">
	import { page } from '$app/state';
	import type { Status } from '#lib/people/status.js';
	import { people } from '#lib/strings/people.js';
	import { time } from '#lib/strings/time.js';
	import { calendarDay } from '#lib/time-zone.js';

	let { status }: { status: Status } = $props();

	function untilText(expiresAt: number, timeZone: string): string {
		const sameDay = calendarDay(expiresAt, timeZone) === calendarDay(Date.now(), timeZone);
		const format: Intl.DateTimeFormatOptions = sameDay
			? { hour: 'numeric', minute: '2-digit', timeZone }
			: { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone };
		return people.status.until(new Intl.DateTimeFormat(undefined, format).format(expiresAt));
	}
</script>

<span class="status">
	<span aria-hidden="true">{status.emoji}</span>
	{status.text}
	{#if status.expiresAt !== null}
		<span class="until" aria-hidden="true">·</span>
		<time
			class="until"
			datetime={new Date(status.expiresAt).toISOString()}
			title={time.long(status.expiresAt, page.data.timeZone)}
			>{untilText(status.expiresAt, page.data.timeZone)}</time
		>
	{/if}
</span>

<style>
	.until {
		color: var(--hue-z0-muted);
	}
</style>
