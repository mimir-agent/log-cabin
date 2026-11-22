// People: profiles, usernames, status, local time, last seen, covers, the theme setting and
// image cropping.

export const people = {
	username: {
		label: 'Username',
		hint: 'Lowercase letters, numbers, “_” and “-”, 2 to 32 characters. Your profile is at /people/your-username, and an old username keeps working for 30 days after you change it.',
		at: (username: string) => `@${username}`,
		errors: {
			invalid: 'Use 2 to 32 lowercase letters, numbers, “_” or “-”.',
			taken: 'That username is taken. Try another.'
		}
	},
	status: {
		title: 'Status',
		set: 'Set a status',
		edit: 'Change status',
		emoji: 'Emoji',
		emojiChoices: ['💬', '🥪', '🗓️', '🧠', '🚶', '🏠', '✈️', '😷', '🌴', '🎧'],
		presetsLabel: 'Suggestions',
		text: 'What’s happening?',
		count: (left: number) => `${left} left`,
		clearAfter: 'Clear after',
		/** The "Clear after" button's name, with what it's set to. */
		clearAfterChoice: (choice: string) => `Clear after: ${choice}`,
		expiries: {
			'30m': '30 minutes',
			'1h': '1 hour',
			'4h': '4 hours',
			today: 'Today',
			this_week: 'This week',
			custom: 'Custom',
			never: 'Never'
		},
		customAt: 'Clear at',
		presets: {
			lunch: 'Lunch',
			meeting: 'In a meeting',
			deepWork: 'Deep work',
			sick: 'Sick',
			vacation: 'Vacationing'
		},
		save: 'Save status',
		clear: 'Clear status',
		until: (time: string) => `until ${time}`,
		errors: {
			textMissing: 'Write a status, or clear it.',
			textTooLong: 'Keep a status to 80 characters.',
			emojiMissing: 'Pick an emoji.',
			expiryInvalid: 'Choose when the status clears.',
			customInPast: 'Pick a time in the future.',
			notYours: 'You can only set your own status.'
		}
	},
	time: {
		local: (time: string) => `${time} local time`,
		ahead: (hours: string) => `${hours} ahead`,
		behind: (hours: string) => `${hours} behind`,
		hours: (hours: number) => (Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`)
	},
	seen: {
		activeNow: 'Active now',
		lastSeen: (ago: string) => `Last seen ${ago}`,
		never: 'Not seen yet'
	},
	card: {
		loading: 'Loading…',
		unavailable: 'This profile couldn’t be loaded.'
	},
	cover: {
		label: 'Cover photo'
	},
	theme: {
		label: 'Appearance',
		choices: { system: 'System', light: 'Light', dark: 'Dark' },
		saved: 'Appearance saved.',
		errors: {
			invalid: 'Choose System, Light or Dark.',
			saveFailed: 'Your appearance couldn’t be saved. Try again.'
		}
	},
	crop: {
		title: 'Crop image',
		description: 'Drag the image to move it in the frame. Use the slider to zoom.',
		zoom: 'Zoom',
		cancel: 'Cancel',
		save: 'Use image',
		errors: {
			unreadable: 'That file couldn’t be read as an image. Try a PNG, JPEG, GIF or WebP.'
		}
	},
	projectCover: {
		label: 'Channel cover',
		add: 'Add cover',
		change: 'Change cover',
		errors: {
			missing: 'Choose an image for the cover.',
			notAllowed: 'Only the channel’s creator or an admin can change its cover.'
		}
	}
};

export type StatusExpiry = keyof typeof people.status.expiries;
