export const auth = {
	nav: {
		members: 'People',
		invites: 'Invitations',
		orgSettings: 'Organization',
		profile: 'Profile',
		security: 'Password and security'
	},
	login: {
		title: 'Sign in',
		intro: 'Enter your email and we’ll send you a sign-in link.',
		email: 'Email',
		submit: 'Email me a link',
		google: 'Sign in with Google',
		withPassword: 'Sign in with a password',
		or: 'or',
		sent: (email: string) =>
			`If ${email} can sign in here, we’ve sent it a sign-in link. The link works once and expires in 15 minutes.`,
		errors: {
			emailInvalid: 'Enter an email address like name@example.com.',
			rateLimited: 'Too many emails were requested. Wait 15 minutes, then try again.',
			linkInvalid:
				'This sign-in link has expired or has already been used. Enter your email to get a new one.',
			notMember:
				'There’s no account for that email. Ask an admin for an invitation, or sign in with the email you were invited with.',
			deactivated: 'This account has been deactivated. Ask an admin to reactivate it.',
			unverified: 'Google hasn’t verified that email address, so it can’t be used to sign in.',
			googleFailed: 'Google sign-in didn’t finish. Try again.',
			twoFactorExpired: 'That sign-in took too long to finish. Sign in again.',
			inviteUsed:
				'This invitation has expired, been revoked or already been used. Ask an admin for a new one.'
		}
	},
	verify: {
		title: 'Finish signing in',
		intro: 'Select Sign in to open your account.',
		submit: 'Sign in'
	},
	password: {
		title: 'Sign in with a password',
		email: 'Email',
		password: 'Password',
		submit: 'Sign in',
		forgot: 'Forgot your password?',
		withLink: 'Email me a sign-in link instead',
		errors: {
			wrong: 'That email and password don’t match an account. Check them and try again.',
			rateLimited: 'Too many attempts. Wait 15 minutes, then try again.',
			tooShort: (min: number) => `Use at least ${min} characters.`,
			pwned:
				'This password has appeared in a data breach, so it isn’t safe to use. Choose a different one.'
		}
	},
	reset: {
		requestTitle: 'Reset your password',
		requestIntro: 'Enter your email and we’ll send you a link to choose a new password.',
		email: 'Email',
		send: 'Email me a reset link',
		sent: (email: string) =>
			`If ${email} has an account here, we’ve sent it a reset link. The link works once and expires in 30 minutes.`,
		title: 'Choose a new password',
		intro: 'Saving a new password signs you out on every device.',
		password: 'New password',
		save: 'Save password',
		done: 'Your password has been changed, and you’re signed out everywhere. Sign in with your new password.',
		errors: {
			rateLimited: 'Too many reset emails were requested. Wait 15 minutes, then try again.',
			linkInvalid: 'This reset link has expired or has already been used. Ask for a new one below.'
		}
	},
	twoFactor: {
		title: 'Two-factor authentication',
		intro: 'Enter the 6-digit code from your authenticator app, or one of your recovery codes.',
		code: 'Code',
		submit: 'Verify',
		errors: {
			wrong:
				'That code isn’t right. Enter the current code from your authenticator app, or a recovery code you haven’t used.',
			rateLimited: 'Too many wrong codes. Wait 15 minutes, then try again.'
		}
	},
	security: {
		title: 'Password and security',
		passwordHeading: 'Password',
		passwordNone:
			'You don’t have a password. You can sign in with an emailed link, or set a password here.',
		passwordSet: 'You can sign in with your email and password.',
		currentPassword: 'Current password',
		newPassword: 'New password',
		passwordHint: (min: number) => `At least ${min} characters.`,
		setPassword: 'Set password',
		changePassword: 'Change password',
		passwordSaved: 'Password saved.',
		twoFactorHeading: 'Two-factor authentication',
		twoFactorOff:
			'When it’s on, you enter a code from an authenticator app every time you sign in, whichever way you sign in.',
		twoFactorOn: 'On. You enter a code from your authenticator app every time you sign in.',
		turnOn: 'Set up two-factor authentication',
		scan: 'Scan this QR code with your authenticator app, or enter the key by hand.',
		qrAlt: 'QR code for your authenticator app',
		manualKey: 'Setup key',
		confirmCode: 'Code from the app',
		confirm: 'Turn on',
		codesLeft: (n: number) => (n === 1 ? '1 recovery code left.' : `${n} recovery codes left.`),
		codesTitle: 'Your recovery codes',
		codesIntro:
			'Save these somewhere safe. If you lose your device, each one works once in place of a code from your app. They won’t be shown again.',
		disableCode: 'Code from your app or a recovery code',
		disable: 'Turn off two-factor authentication',
		disabled: 'Two-factor authentication is off.',
		regenerateCode: 'Code from your app',
		regenerate: 'Make new recovery codes',
		errors: {
			currentWrong: 'Your current password isn’t right.',
			notOn: 'Two-factor authentication isn’t on.'
		}
	},
	signOut: 'Sign out',
	email: {
		signIn: {
			subject: (orgName: string) => `Your sign-in link for ${orgName}`,
			intro: (orgName: string) => `Use this link to sign in to ${orgName}.`,
			button: 'Sign in',
			note: 'The link works once and expires in 15 minutes. If you didn’t ask for it, you can ignore this email.'
		},
		reset: {
			subject: (orgName: string) => `Reset your password for ${orgName}`,
			intro: (orgName: string) => `Use this link to choose a new password for ${orgName}.`,
			button: 'Choose a new password',
			note: 'The link works once and expires in 30 minutes. Choosing a new password signs you out on every device. If you didn’t ask for this, you can ignore this email; your password hasn’t changed.'
		},
		/** PA-A1: to the new address, with the link that makes it the sign-in email. */
		confirmEmail: {
			subject: (orgName: string) => `Confirm your new email for ${orgName}`,
			intro: (newEmail: string, orgName: string) =>
				`Use this link to make ${newEmail} your sign-in email for ${orgName}.`,
			button: 'Confirm email',
			note: (hours: number) =>
				`The link works once and expires in ${hours === 1 ? '1 hour' : `${hours} hours`}. If you didn’t ask for this, you can ignore this email; your sign-in email hasn’t changed.`
		},
		/** PA-A1: to the old address, after the change is confirmed. */
		emailChanged: {
			subject: (orgName: string) => `Your sign-in email for ${orgName} was changed`,
			intro: (newEmail: string) => `Your sign-in email was changed to ${newEmail}.`,
			button: (orgName: string) => `Open ${orgName}`,
			note: 'If you didn’t make this change, tell an admin of your organization right away.'
		},
		invite: {
			subject: (orgName: string) => `You’re invited to ${orgName}`,
			intro: (inviterName: string, orgName: string) =>
				`${inviterName} invited you to join ${orgName}.`,
			button: 'Accept the invitation',
			note: 'The link expires in 7 days. If you weren’t expecting this invitation, you can ignore this email.'
		}
	},
	setupDone:
		'Your organization is ready. Check your email for a sign-in link. It works once and expires in 15 minutes.',
	members: {
		title: 'People',
		search: 'Search by name',
		empty: 'No members match that name.',
		deactivated: 'Deactivated',
		invite: 'Invite people'
	},
	profile: {
		email: 'Email',
		joined: 'Joined',
		changeRole: 'Change role',
		saveRole: 'Save role',
		deactivate: 'Deactivate',
		reactivate: 'Reactivate',
		deactivatedNote: 'This member is deactivated and can’t sign in.',
		errors: {
			lastAdmin: 'An organization needs at least one admin. Make someone else an admin first.',
			roleInvalid: 'Choose one of the listed roles.',
			notFound: 'That member doesn’t exist.'
		}
	},
	ownProfile: {
		title: 'Your profile',
		name: 'Display name',
		avatar: 'Avatar',
		save: 'Save profile',
		saved: 'Profile saved.',
		errors: {
			nameMissing: 'Enter a display name.'
		}
	},
	/** PA-A1: changing your sign-in email. The old address keeps working until the link is opened. */
	emailChange: {
		heading: 'Sign-in email',
		change: 'Change email',
		newEmail: 'New email address',
		send: 'Send confirmation link',
		cancel: 'Cancel',
		sent: (newEmail: string, oldEmail: string) =>
			`We sent a link to ${newEmail}. Open it to finish the change. Until then, keep signing in with ${oldEmail}.`,
		pending: (newEmail: string) => `Waiting for you to confirm ${newEmail}.`,
		resend: 'Send the link again',
		confirmTitle: 'Confirm your new email',
		confirmIntro: (newEmail: string) => `Select Confirm to make ${newEmail} your sign-in email.`,
		confirm: 'Confirm',
		doneTitle: 'Email changed',
		done: (newEmail: string) => `Your sign-in email is now ${newEmail}.`,
		continue: 'Continue',
		errors: {
			emailInvalid: 'Enter an email address like name@example.com.',
			same: 'That’s already your sign-in email.',
			taken: 'That email address can’t be used. Try another.',
			rateLimited: 'Too many emails were requested. Wait 15 minutes, then try again.',
			linkInvalid:
				'This confirmation link has expired or has already been used. Send a new one from your profile settings.'
		}
	},
	/** PA-A2: leaving the organization from account settings. */
	leave: {
		heading: 'Leave organization',
		intro: 'Your posts and activity stay visible to other members.',
		button: 'Leave organization',
		title: (orgName: string) => `Leave ${orgName}?`,
		body: 'Your posts and activity will still be visible to other members. You’ll be signed out, and you won’t be able to sign back in unless an admin reactivates you.',
		confirm: 'Leave',
		cancel: 'Cancel',
		errors: {
			lastAdmin: 'You’re the only admin. Make someone else an admin before you leave.'
		}
	},
	/** PA-A3: what a member sees, and the refusal an API or form action returns, when the organization requires two-factor and they haven't set it up. */
	twoFactorRequired: {
		title: 'Set up two-factor authentication',
		intro: (orgName: string) =>
			`${orgName} requires everyone to use two-factor authentication. Set it up to keep using the app.`,
		signOutNote: 'You can sign out without setting it up.',
		refused:
			'Your organization requires two-factor authentication. Set it up in Password and security to continue.'
	},
	images: {
		errors: {
			type: 'Upload a PNG, JPEG, GIF or WebP image.',
			size: 'Choose an image of 2 MB or less.'
		}
	},
	orgSettings: {
		title: 'Organization settings',
		name: 'Organization name',
		logo: 'Logo',
		domain: 'Email domain',
		domainHint:
			'Your organization’s own domain, without the @. Leave it empty if people only join by invitation.',
		google: 'Offer Google sign-in',
		googleUnconfigured:
			'Google sign-in also needs the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets set on this deployment.',
		/** PA-A3 */
		requireTwoFactor: 'Require two-factor authentication',
		requireTwoFactorHint:
			'Everyone, you included, has to set up two-factor authentication before using the app. Members who haven’t are asked the next time they open it.',
		save: 'Save settings',
		saved: 'Settings saved.',
		errors: {
			notAdmin: 'Only an admin can change organization settings.',
			nameMissing: 'Enter the organization’s name.',
			domainInvalid: 'Enter a domain like example.com, without the @.'
		}
	},
	invites: {
		title: 'Invitations',
		byEmail: 'Invite by email',
		role: 'Role',
		byLink: 'Invitation link',
		linkIntro: 'Anyone with this link can request an invitation to their own email.',
		expiry: 'Expires after',
		days: (days: number) => (days === 1 ? '1 day' : `${days} days`),
		createLink: 'Create link',
		linkCreated: 'Copy this link now. It won’t be shown again.',
		open: 'Pending invitations',
		none: 'No pending invitations.',
		linkLabel: 'Invitation link',
		expires: 'Expires',
		revoke: 'Revoke',
		errors: {
			roleInvalid: 'Choose one of the listed roles.',
			expiryInvalid: 'Choose one of the listed expiry times.'
		}
	},
	accept: {
		title: (orgName: string) => `Join ${orgName}`,
		asRole: (role: string) => `Your role: ${role}`,
		name: 'Your name',
		email: 'Your email',
		accept: 'Accept invitation',
		request: 'Email me an invitation',
		requested: (email: string) =>
			`If ${email} doesn’t already have an account, we’ve sent it an invitation. Open the link in that email to join.`,
		invalid:
			'This invitation has expired, been revoked or already been used. Ask an admin for a new one.',
		errors: {
			nameMissing: 'Enter your name.',
			emailInvalid: 'Enter an email address like name@example.com.',
			alreadyMember: 'That email already has an account. Sign in instead.'
		}
	}
};
