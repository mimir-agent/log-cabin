// Domain events. Modules emit them; the JOBS consumer turns them into notifications,
// emails and pushes. Add a kind here when a module needs one.
// What a reaction or mention is attached to; subjectId is that row's id.
export type ContentKind = 'post' | 'comment' | 'note' | 'message';

export type DomainEvent =
	| { kind: 'post.created'; postId: string; projectId: string; authorId: string }
	| { kind: 'post.updated'; postId: string; projectId: string; authorId: string }
	| { kind: 'comment.created'; commentId: string; subjectId: string; authorId: string }
	/** A top-level comment's thread was resolved; its author hears of it. */
	| {
			kind: 'comment.resolved';
			commentId: string;
			subjectType: 'post' | 'note';
			resolvedBy: string;
	  }
	/** A post was resolved, perhaps by one of its comments; its followers hear of it. */
	| {
			kind: 'post.resolved';
			postId: string;
			commentId: string | null;
			resolvedBy: string;
			/** Tells one resolving from the next after the post was opened again. */
			resolvedAt: number;
	  }
	| {
			kind: 'reaction.created';
			reactionId: string;
			subjectType: ContentKind;
			subjectId: string;
			authorId: string;
	  }
	| {
			kind: 'mention';
			subjectType: ContentKind;
			subjectId: string;
			mentionedUserId: string;
			authorId: string;
	  }
	| {
			kind: 'message.created';
			messageId: string;
			threadId: string;
			authorId: string;
			/** Thread members to notify: everyone in the thread who isn't in it right now. */
			recipientIds: string[];
	  }
	| { kind: 'note.shared'; noteId: string; sharedWith: string[]; authorId: string }
	/** A comment or reply on a note; its subscribers hear of it. */
	| { kind: 'note.commented'; commentId: string; noteId: string; authorId: string }
	/** A note's body was stored from its live document, or it was renamed: draw its thumbnail again. */
	| { kind: 'note.thumbnail'; noteId: string }
	| { kind: 'member.invited'; inviteId: string; email: string; invitedBy: string }
	/** Someone asked to join; `origin` is where they signed in, for the link in the admins' mail. */
	| { kind: 'join.requested'; userId: string; origin: string }
	| { kind: 'call.started'; callId: string; roomId: string; startedBy: string }
	/** Sent 30 seconds after a call invitation starts ringing, to mark it missed if unanswered. */
	| { kind: 'call.ring.timeout'; invitationId: string }
	/** A post's author asked someone for feedback, or asked again after they dismissed it. */
	| { kind: 'feedback.requested'; requestId: string }
	/** Someone added another person to a project. */
	| { kind: 'project.member_added'; projectId: string; userId: string; addedBy: string }
	| { kind: 'project.renamed'; projectId: string; renamedBy: string }
	| { kind: 'project.archived'; projectId: string; archivedBy: string }
	/** A post, with its versions, moved into another project. */
	| { kind: 'post.moved'; postId: string; toProjectId: string; movedBy: string }
	/** A call ended; once its recordings are finished it gets its title and summary. */
	| { kind: 'call.ended'; callId: string }
	/** A recording sink wrote a segment of someone's audio to R2; transcribe it. */
	| { kind: 'recording.segment'; segmentId: string; recordingId: string; callId: string }
	/** Sent a while after a recording stops, once its sinks have written their last segments. */
	| { kind: 'recording.stopped'; recordingId: string; callId: string };

export type DomainEventKind = DomainEvent['kind'];

export type JobMessage = DomainEvent & { emittedAt: number };

/** Enqueues the event; with delaySeconds, the queue holds it back that long first. */
export async function emit(
	env: Env,
	event: DomainEvent,
	options: { delaySeconds?: number } = {}
): Promise<void> {
	await env.JOBS.send({ ...event, emittedAt: Date.now() } satisfies JobMessage, options);
}
