import { calendarDay } from '../time-zone';

/**
 * Short times for bylines and list rows, as Campsite shows them: "now", "5m", "3h", "2d",
 * then the date. The full date and time go in the element's title, for hover. Dates and
 * times are in `timeZone`, the reader's, from the page's data.
 */
export const time = {
	short: (at: number, timeZone: string, now = Date.now()) => {
		const minutes = Math.floor((now - at) / 60_000);
		if (minutes < 1) return 'now';
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d`;
		const year = (instant: number) => calendarDay(instant, timeZone).slice(0, 4);
		return new Date(at).toLocaleDateString('en', {
			month: 'short',
			day: 'numeric',
			timeZone,
			...(year(at) === year(now) ? {} : { year: 'numeric' })
		});
	},
	/** The full date and time. */
	long: (at: number, timeZone: string) =>
		new Date(at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone }),
	/** The time of day an instant falls on: "1:20 PM". A feed row's day is in the heading above it. */
	clock: (at: number, timeZone: string) =>
		new Date(at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', timeZone }),
	/** Between chat runs more than half an hour apart: "1:20 PM", or "Nov 12 · 1:20 PM" before today. */
	divider: (at: number, timeZone: string, now = Date.now()) => {
		const date = new Date(at);
		const clock = time.clock(at, timeZone);
		if (calendarDay(at, timeZone) === calendarDay(now, timeZone)) return clock;
		return `${date.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone })} · ${clock}`;
	},
	/** The time now where someone is, "2:32 PM"; null for a zone the browser doesn't know. */
	clockIn: (timeZone: string, now = Date.now()) => {
		try {
			return new Date(now).toLocaleTimeString('en', {
				hour: 'numeric',
				minute: '2-digit',
				timeZone
			});
		} catch {
			return null;
		}
	}
};
