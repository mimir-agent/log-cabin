import { chat } from '#lib/strings/chat.js';

type Person = { id: string; name: string };

/** The quiet "Replying to …" line under a reply: "you" and "yourself" as Campsite says them. */
export function replyLabel({
	quoted,
	replier,
	viewerId
}: {
	quoted: Person;
	replier: Person;
	viewerId: string;
}): string {
	const s = chat.thread;
	if (quoted.id !== viewerId) return s.replyingTo(quoted.name);
	return replier.id === viewerId ? s.replyingToYourself : s.replyingToYou;
}
