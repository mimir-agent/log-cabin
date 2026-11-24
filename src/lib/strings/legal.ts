export type LegalDocument = {
	title: string;
	updated: string;
	/** Paragraphs before the first heading. */
	intro: string[];
	sections: { heading: string; paragraphs: string[] }[];
};

const email = 'mir@yaaia.id';

export const legal = {
	backToSignIn: 'Back to sign in',
	/** The sign-in page's footer line: the two links, with a dot between them. */
	footer: { privacy: 'Privacy', terms: 'Terms' },
	privacy: {
		title: 'Privacy policy',
		updated: 'Last updated 23 November 2026',
		intro: [
			'Log Cabin is an experimental, invite-only beta that I run at cabin.yaaia.id. It can break, change or go away. This page says what it collects and what happens to it.'
		],
		sections: [
			{
				heading: 'What I get from Google',
				paragraphs: [
					'If you sign in with Google, Log Cabin asks for three things: openid, email and profile. In return I get your name, your email address and your profile picture. I use them to sign you in and to show who you are to the other people in your organisation. I get nothing else from your Google account: no contacts, no calendar, no files.',
					'You can also sign in with an email link or a password. Then Log Cabin keeps your email address and the name you chose.'
				]
			},
			{
				heading: 'What you put in',
				paragraphs: [
					'Threads, comments, direct messages, notes, files, and call recordings with their transcripts and summaries belong to you and your organisation. They are visible to the people your organisation has given access to.',
					'Direct messages and group chats can be read only by the people in them. A private project can be read only by the people added to it.',
					'Recordings are kept for the period your organisation sets. The default is 30 days for audio and forever for transcripts and summaries; an organisation can choose shorter. Video from a call is never uploaded.',
					'Threads, comments, chat, notes and files are kept until someone deletes them.',
					'When an organisation deactivates someone, that person can no longer sign in. What they wrote stays.'
				]
			},
			{
				heading: 'AI features',
				paragraphs: [
					'Log Cabin uses AI to turn call audio into a transcript, and to write summaries and titles. For that, the audio of a call, or the text of the discussion being summarised, is sent to an AI service run by the company that hosts the app. Audio is sent only when someone records a call.'
				]
			},
			{
				heading: 'Email',
				paragraphs: [
					'Log Cabin sends email for sign-in links, password resets, invitations, and requests to join an organisation and the answers to them. A service that sends email for the app handles those messages.'
				]
			},
			{
				heading: 'Cookies',
				paragraphs: [
					'Log Cabin sets a cookie that keeps you signed in. It lasts up to 30 days. During sign-in it sets short-lived cookies to finish the step you are on, and a guest who joins a call gets one that lets them stay in it. I use no advertising or tracking cookies.'
				]
			},
			{
				heading: 'Who else sees your data',
				paragraphs: [
					'I don’t sell it, I don’t use it for ads, and I don’t share it. The only exception is the services that host the app, send its email and run its calls, which handle data because the app can’t work without them.'
				]
			},
			{
				heading: 'Deleting your data',
				paragraphs: [
					`Email ${email} from the address you signed up with and I will delete your account, or any content you name.`
				]
			},
			{
				heading: 'Changes',
				paragraphs: ['If this page changes, the date at the top changes with it.']
			},
			{ heading: 'Contact', paragraphs: [email] }
		]
	},
	terms: {
		title: 'Terms of service',
		updated: 'Last updated 23 November 2026',
		intro: [
			'Log Cabin is an experimental, invite-only beta that I run at cabin.yaaia.id. By using it you agree to these terms.'
		],
		sections: [
			{
				heading: 'Beta, as is',
				paragraphs: [
					'It is a work in progress. It may be slow, wrong, or down, and features may change or disappear. I provide it as it is, with no warranty. Please keep your own copy of anything you can’t lose.'
				]
			},
			{
				heading: 'Your content',
				paragraphs: [
					'What you put in Log Cabin stays yours, or your organisation’s. You give me permission to store it, process it and show it to the people you share it with, only so the app can run.'
				]
			},
			{
				heading: 'Using it well',
				paragraphs: [
					'Use Log Cabin for lawful work with the people in your organisation. Don’t try to break it, get into other people’s data, send spam through it, or put in anything you have no right to share.'
				]
			},
			{
				heading: 'Access',
				paragraphs: [
					'I can suspend or remove access, and I can end the beta, at any time. I will tell you first when I can.'
				]
			},
			{
				heading: 'Leaving',
				paragraphs: [
					`You can stop using Log Cabin whenever you like. To have your account or content deleted, email ${email}.`
				]
			},
			{
				heading: 'Liability',
				paragraphs: [
					'I’m not liable for lost data or other losses from using the beta, to the extent the law allows.'
				]
			},
			{
				heading: 'Changes',
				paragraphs: [
					'If these terms change, the date at the top changes, and continuing to use Log Cabin means you accept the new terms.'
				]
			},
			{ heading: 'Contact', paragraphs: [email] }
		]
	}
};
