// Onboarding: the steps after someone's first sign-in, and the banner on Home that offers the
// rest when they leave midway.

export const onboarding = {
	title: 'Set up your account',
	position: (step: number, count: number) => `${step} of ${count}`,
	steps: {
		org: {
			title: 'Set up your organization',
			description: 'Add a logo, and choose how people with your email domain can join.'
		},
		profile: {
			title: 'Your profile',
			description: 'How people see you here. You can change any of it later in Settings.'
		},
		projects: {
			title: 'Join channels',
			description: 'Channels are where threads, docs and calls live. Join the ones you work on.',
			none: 'There are no open channels yet. You can create one or join one later.'
		},
		invite: {
			title: 'Invite your teammates',
			description: 'Paste their email addresses and we’ll send each of them an invitation.'
		}
	},
	actions: {
		continue: 'Continue',
		skip: 'Skip for now',
		back: 'Back',
		finish: (orgName: string) => `Go to ${orgName}`
	},
	invited: (count: number) => (count === 1 ? 'Sent 1 invitation.' : `Sent ${count} invitations.`),
	banner: {
		text: 'You haven’t finished setting up your account.',
		resume: 'Finish setup',
		dismiss: 'Dismiss'
	}
};
