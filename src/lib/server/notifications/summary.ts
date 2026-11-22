import { notifications } from '../../strings/notifications';

const s = notifications.summary;

type Channel = { name: string; private: boolean };

/** What a notification is about, as much as its sentence needs. Titles are never empty. */
export type Facts =
	| { about: 'mention'; in: 'post' | 'note'; title: string }
	| { about: 'mention'; in: 'comment' | 'reply' }
	| { about: 'comment'; title: string }
	| { about: 'reply'; whose: 'yours' | 'theirs' | { author: string } }
	| { about: 'reaction'; emoji: string; what: 'post' | 'comment' | 'reply' | 'note' }
	| { about: 'post'; channel: Channel }
	| { about: 'feedback' }
	| { about: 'follow_up'; title: string }
	| { about: 'note_shared'; title: string }
	| { about: 'added_to_project' | 'project_archived' | 'project_renamed'; channel: Channel }
	| { about: 'post_moved'; title: string; channel: Channel }
	| { about: 'post_resolved' | 'post_resolved_from_comment'; title: string };

/** The inbox line, push title and one-item mail subject for a notification, as Campsite words it. */
export function summarize(actor: string, facts: Facts): string {
	switch (facts.about) {
		case 'mention':
			if (facts.in === 'post' || facts.in === 'note') return s.mentionIn(actor, facts.title);
			return facts.in === 'comment' ? s.mentionInComment(actor) : s.mentionInReply(actor);
		case 'comment':
			return s.commentOn(actor, facts.title);
		case 'reply': {
			const { whose } = facts;
			return s.replyTo(
				actor,
				typeof whose === 'string' ? s.whose[whose] : s.whose.named(whose.author)
			);
		}
		case 'reaction':
			return s.reaction(actor, facts.emoji, facts.what);
		case 'post':
			return s.postedIn(actor, s.channel(facts.channel.name, facts.channel.private));
		case 'feedback':
			return s.feedback(actor);
		case 'follow_up':
			return s.followUp(facts.title);
		case 'note_shared':
			return s.shared(actor, facts.title);
		case 'added_to_project':
			return s.addedTo(actor, s.channel(facts.channel.name, facts.channel.private));
		case 'project_archived':
			return s.archived(actor, s.channel(facts.channel.name, facts.channel.private));
		case 'project_renamed':
			return s.renamed(actor, s.channel(facts.channel.name, facts.channel.private));
		case 'post_moved':
			return s.moved(actor, facts.title, s.channel(facts.channel.name, facts.channel.private));
		case 'post_resolved':
			return s.postResolved(actor, facts.title);
		case 'post_resolved_from_comment':
			return s.postResolvedFromComment(actor, facts.title);
	}
}
