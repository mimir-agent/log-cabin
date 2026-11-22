// Invites II: bulk invites, starter projects, how people with the org's email domain join,
// and join requests.

const list = (items: string[]) =>
	new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(items);

export const invites = {
	bulk: {
		emails: 'Email addresses',
		emailsHint: 'Paste up to 100, separated by commas, spaces or new lines.',
		file: 'Or upload a CSV or text file',
		fileHint: 'Every address in the file is invited; other columns are ignored.',
		send: 'Send invitations',
		sent: (count: number) => (count === 1 ? 'Sent 1 invitation.' : `Sent ${count} invitations.`),
		noneSent: 'No invitations were sent.',
		notSentTitle: (count: number) =>
			count === 1 ? '1 address wasn’t invited' : `${count} addresses weren’t invited`
	},
	notSent: {
		invalid: 'not an email address',
		repeated: 'listed more than once',
		member: 'already a member',
		invited: 'already invited',
		mailFailed: 'the invitation email couldn’t be sent; try again later'
	},
	notSentLine: (email: string, reason: string) => `${email}: ${reason}`,
	starters: {
		label: 'Starter channels',
		hint: 'People who accept join these channels. Guests see only the channels they’re in.',
		none: 'There are no channels you can add people to yet.',
		onAccept: (names: string[]) => `You’ll join ${list(names)}.`
	},
	domain: {
		mode: 'People with this domain',
		modes: {
			off: 'Need an invitation',
			direct: 'Join directly',
			request: 'Ask to join'
		},
		hints: {
			off: 'Only people you invite can join.',
			direct: 'Anyone who signs in with a verified email at this domain becomes a member.',
			request:
				'Anyone who signs in with a verified email at this domain can ask to join. Admins approve or deny each request.'
		},
		errors: {
			domainMissing: 'Enter a domain to let people with it join or ask to join.'
		}
	},
	requests: {
		nav: 'Requests',
		/** Names the switch between the member list and the requests, for screen readers. */
		views: 'Which list',
		asked: (ago: string) => `Asked ${ago}`,
		approve: 'Approve',
		deny: 'Deny',
		approveAll: 'Approve all',
		undo: 'Undo',
		approved: (name: string) => `${name} is now a member.`,
		denied: (name: string) => `${name}’s request was denied.`,
		denying: (name: string) => `Denying ${name}’s request…`,
		approvedAll: (count: number) =>
			count === 1 ? 'Approved 1 request.' : `Approved ${count} requests.`,
		emptyTitle: 'No requests',
		emptyDescription:
			'When the domain setting lets people ask to join, their requests appear here.',
		domainSetting: 'Domain setting',
		gone: 'That request was already approved or denied.'
	},
	/** PA-A4: opening an invite link while signed in. */
	join: {
		joinAs: (name: string) => `Join as ${name}`,
		intro: (orgName: string) => `You’re invited to join ${orgName}.`,
		ask: 'Ask to join',
		asked: (orgName: string) =>
			`You’ve asked to join ${orgName}. An admin will review your request, and we’ll email you when they do.`,
		switchAccount: 'Not you? Sign out',
		errors: {
			linkInvalid: 'This invite link has expired or been revoked. Ask an admin for a new one.'
		}
	},
	/** PA-A4: the copyable invite link on the onboarding step and in invite settings. */
	linkField: {
		label: 'Invite link',
		hint: 'Share this link with people you want to invite. They can join with their own email.',
		copy: 'Copy link',
		copied: 'Link copied.',
		reset: 'Reset link',
		resetTitle: 'Reset invite link?',
		resetBody:
			'The current link stops working and a new one takes its place. People who already joined stay.',
		resetConfirm: 'Reset',
		resetCancel: 'Cancel',
		resetDone: 'The old link no longer works. Copy the new link below.'
	},
	/** PA-A4: the requester's own view of a join request. */
	requestStatus: {
		title: (orgName: string) => `Your request to join ${orgName}`,
		pending: 'Waiting for an admin to decide. We’ll email you when they do.',
		approved: 'An admin approved your request. Sign in to join.',
		denied:
			'An admin denied your request. If you think that’s a mistake, ask someone there for an invite.',
		none: 'There’s no request to join from your account.',
		asked: (ago: string) => `Asked ${ago}`
	},
	login: {
		requested: (orgName: string) =>
			`You’ve asked to join ${orgName}. An admin will review your request, and we’ll email you when they do.`,
		pending: (orgName: string) =>
			`Your request to join ${orgName} is waiting for an admin. We’ll email you when they decide.`
	},
	email: {
		request: {
			subject: (name: string, orgName: string) => `${name} asked to join ${orgName}`,
			intro: (name: string, email: string, orgName: string) =>
				`${name} (${email}) asked to join ${orgName}.`,
			button: 'Approve or deny'
		},
		approved: {
			subject: (orgName: string) => `You’ve joined ${orgName}`,
			intro: (orgName: string) => `An admin approved your request to join ${orgName}.`,
			button: 'Sign in'
		},
		denied: {
			subject: (orgName: string) => `Your request to join ${orgName}`,
			intro: (orgName: string) =>
				`An admin of ${orgName} denied your request to join. If you think that’s a mistake, ask someone there for an invitation.`
		}
	},
	errors: {
		noEmails: 'Enter at least one email address.',
		tooMany: (count: number, max: number) =>
			`That’s ${count} addresses. Invite up to ${max} at a time.`,
		projectNotAllowed: 'You can only add people to channels you belong to or manage.'
	}
};
