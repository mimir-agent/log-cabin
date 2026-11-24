import { notifications as strings } from '../../strings/notifications';

const limit = 140;

/** The body's words on one line, cut at a word to at most 140 characters; null when it has none. */
export function excerpt(bodyText: string): string | null {
	const text = bodyText.replace(/\s+/g, ' ').trim();
	if (text.length <= limit) return text || null;
	const head = text.slice(0, limit - 1);
	const wholeWords = text[limit - 1] === ' ' ? head : head.slice(0, head.lastIndexOf(' '));
	return `${wholeWords.trimEnd()}…`;
}

/** "<prefix>: <excerpt>" for a post, comment, reply or note. */
export function bodyPreview(prefix: string, bodyText: string): string | null {
	const quoted = excerpt(bodyText);
	return quoted ? strings.bodyPreview.line(prefix, quoted) : null;
}

/** What a chat message shows under its thread's name: its text, or that it brought a file. */
export function messagePreview(
	sender: string,
	message: { bodyText: string; hasAttachment: boolean },
	direct: boolean
): string | null {
	const quoted = excerpt(message.bodyText);
	if (quoted) return direct ? quoted : strings.messagePreview.text(sender, quoted);
	return message.hasAttachment ? strings.messagePreview.attachment(sender) : null;
}

/**
 * The push a notification makes, as Campsite sends it: the sentence as the title and the
 * preview as the body. A message's title is its thread's name.
 */
export function pushPayload(
	notification: { kind: string; title: string | null; url: string; preview?: string | null },
	sentence: string,
	unread: number
) {
	const title = notification.kind === 'message' ? (notification.title ?? sentence) : sentence;
	return { title, body: notification.preview ?? null, url: notification.url, unread };
}
