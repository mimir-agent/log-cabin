export const ai = {
	summary: {
		/** Heads the summary, and names the popover a note's summary opens in. */
		title: 'Summary',
		/** The button on threads and DMs, and the item in a note's "…" menu. */
		button: 'Summarize',
		/** On the button, or in a note's popover, while the summary is being written. */
		pending: 'Summarizing…',
		disclaimer: 'Written by AI from this page and its comments. It can get things wrong.',
		threadDisclaimer: 'Written by AI from this DM’s latest messages. It can get things wrong.',
		empty:
			'Every point the AI wrote added something that isn’t on this page, so there’s no summary to show.',
		tooShort: 'There’s too little here to summarize yet.',
		sources: 'Sources',
		citation: (n: number) => `Source ${n}`
	},
	/** What each numbered sentence is part of, shown with its quote and read by the model. */
	kinds: {
		title: 'title',
		post: 'thread',
		note: 'doc',
		message: 'message',
		comment: (n: number) => `comment ${n}`,
		reply: (n: number) => `reply to comment ${n}`
	},
	settings: {
		label: 'AI summaries',
		hint: 'Adds Summarize to threads, docs and DMs. Workers AI writes the summaries.',
		unconfigured: 'This deployment has no Workers AI binding, so summaries stay hidden.'
	},
	errors: {
		failed: 'The summary couldn’t be written just now. Try again in a minute.',
		off: 'AI summaries are turned off for this organization.'
	}
};
