export const calcom = {
	settings: {
		title: 'Cal.com',
		link: 'Cal.com bookings',
		intro:
			'Meetings people book with you on Cal.com get a call here. Connect your own Cal.com account and choose where those calls happen.',
		place: 'Calls for your bookings happen in',
		personalRoom: 'Your personal room',
		placeHint:
			'Your personal room is open to every member. In a channel, everyone who can see the channel can join.',
		apiKey: 'Cal.com API key',
		apiKeyHint:
			'Create one in Cal.com under Settings → Developer → API keys. It’s used to put the call link on each of your bookings, so it shows in the confirmation and the calendar invite.',
		apiKeyKept: 'A key is saved. Leave this blank to keep it, or paste a new one to replace it.',
		connect: 'Connect Cal.com',
		save: 'Save',
		saved: 'Saved.',
		disconnect: 'Disconnect Cal.com',
		disconnected: 'Cal.com is disconnected.',
		webhookTitle: 'Add this webhook in Cal.com',
		webhookSteps:
			'In Cal.com, open Settings → Developer → Webhooks, or the Webhooks tab of an event type, and add a webhook with this URL and secret. Choose the triggers Booking created, Booking rescheduled and Booking cancelled. The URL and secret are yours alone; nobody else’s Cal.com can use them.',
		webhookUrl: 'Subscriber URL',
		webhookSecret: 'Secret',
		unavailable: {
			calls:
				'Cal.com needs calls, and calls aren’t set up on this deployment. Set the REALTIME_APP_ID and REALTIME_APP_TOKEN secrets (README, Calls).',
			sessionSecret:
				'Cal.com needs the SESSION_SECRET secret, which encrypts its settings, and this deployment doesn’t have it. script/deploy creates it.',
			both: 'Cal.com needs calls and the SESSION_SECRET secret, and this deployment has neither. Set REALTIME_APP_ID and REALTIME_APP_TOKEN (README, Calls), and run script/deploy to create SESSION_SECRET.'
		}
	},
	org: {
		label: 'Let members connect Cal.com',
		hint: 'Each member connects their own Cal.com account. Turning this off stops every member’s bookings from getting calls here and hides the Cal.com page.'
	},
	booking: {
		title: 'Booked on Cal.com',
		attendees: (people: { name: string; email: string }[]) =>
			`Attendees: ${people.map((p) => `${p.name} (${p.email})`).join(', ')}`,
		cancelled: 'This booking was cancelled on Cal.com.'
	},
	guest: {
		intro:
			'You’re joining as a guest. Choose your name, so the others in the call know who you are.',
		when: (startsAt: number, endsAt: number, timeZone: string) =>
			`Booked for ${new Date(startsAt).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone })} to ${new Date(endsAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone })}`,
		name: 'Your name',
		join: 'Join the call',
		noGuests: 'Everyone on this booking has an account here. Sign in to join the call.',
		closed: {
			early: 'The call opens 15 minutes before the booking starts. Come back then.',
			over: 'This booking’s call is over, and its link no longer works.',
			cancelled: 'This booking was cancelled on Cal.com.'
		},
		joiningAs: (name: string) =>
			`You’re joining this call as ${name}. As a guest you can use your camera and microphone, and nothing else here.`,
		removed:
			'You’re no longer in this call. Your guest link may have run out, or your connection dropped for too long. Open the link from your booking to join again.',
		linkInvalid:
			'This guest link doesn’t work for this call. Open the link from your booking again.'
	},
	errors: {
		placeMissing: 'Choose your personal room or a channel you can start a thread in.',
		guestMissing: 'Choose your name from the list.',
		apiKeyMissing: 'Paste a Cal.com API key to connect.',
		off: 'Cal.com is turned off here.',
		notConnected: 'No Cal.com account is connected to this webhook.',
		ownerDisconnected:
			'The person this booking was made with has disconnected Cal.com, so it has no call here.',
		badSignature: 'The webhook signature doesn’t match the secret.',
		bookingNotFound: 'This booking link doesn’t exist.'
	}
};
