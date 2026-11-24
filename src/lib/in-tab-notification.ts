export type NewNotification = { title: string; body: string | null; url: string };

/**
 * Raises a browser notification for a new inbox notification when this tab is hidden and the
 * person allowed notifications, as Campsite's inbox does. Clicking it comes back here and opens
 * the notification. It shares its tag with the push for the same page, so a device that gets
 * both shows one.
 */
export function showInTab({ title, body, url }: NewNotification, open: (url: string) => void) {
	if (!('Notification' in window)) return;
	if (document.visibilityState !== 'hidden' || Notification.permission !== 'granted') return;
	const shown = new Notification(title, { body: body ?? undefined, tag: url });
	shown.onclick = () => {
		window.focus();
		open(url);
		shown.close();
	};
}
