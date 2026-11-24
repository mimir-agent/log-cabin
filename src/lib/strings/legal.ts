export type LegalDocument = {
	title: string;
	updated: string;
	/** Paragraphs before the first heading. */
	intro: string[];
	sections: { heading: string; paragraphs: string[] }[];
};

/** Who runs this instance. Without a contact address, the people to ask are the admins. */
export type LegalOperator = { name: string | null; contact: string | null; admins: string[] };

const operatorOf = ({ name }: LegalOperator) =>
	name ? `the operator of this instance (${name})` : 'the operator of this instance';

const howToReach = ({ contact, admins }: LegalOperator) =>
	contact ? `Email ${contact}.` : `Ask the organization’s admins: ${admins.join(', ')}.`;

export const legal = {
	backToSignIn: 'Back to sign in',
	/** The sign-in page's footer line: the two links, with a dot between them. */
	footer: { privacy: 'Privacy', terms: 'Terms' },
	privacy: (operator: LegalOperator): LegalDocument => ({
		title: 'Privacy policy',
		updated: 'Last updated 24 November 2026',
		intro: [
			`Log Cabin is run by ${operatorOf(operator)}. This page says what it collects and what happens to it.`
		],
		sections: [
			{
				heading: 'What Log Cabin gets from Google',
				paragraphs: [
					'If you sign in with Google, Log Cabin asks for three things: openid, email and profile. In return it gets your name, your email address and your profile picture. It uses them to sign you in and to show who you are to the other people in your organization. It gets nothing else from your Google account: no contacts, no calendar, no files.',
					'You can also sign in with an email link or a password. Then Log Cabin keeps your email address and the name you chose.'
				]
			},
			{
				heading: 'What you put in',
				paragraphs: [
					'Threads, comments, direct messages, notes, files, and call recordings with their transcripts and summaries belong to you and your organization. They are visible to the people your organization has given access to.',
					'Direct messages and group chats can be read only by the people in them. A private project can be read only by the people added to it.',
					'Recordings are kept for the period your organization sets. The default is 30 days for audio and forever for transcripts and summaries; an organization can choose shorter. Video from a call is never uploaded.',
					'Threads, comments, chat, notes and files are kept until someone deletes them.',
					'When an organization deactivates someone, that person can no longer sign in. What they wrote stays.'
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
					'Log Cabin sends email for sign-in links, password resets, invitations, and requests to join an organization and the answers to them. A service that sends email for the app handles those messages.'
				]
			},
			{
				heading: 'Cookies',
				paragraphs: [
					'Log Cabin sets a cookie that keeps you signed in. It lasts up to 30 days. During sign-in it sets short-lived cookies to finish the step you are on, and a guest who joins a call gets one that lets them stay in it. There are no advertising or tracking cookies.'
				]
			},
			{
				heading: 'Who else sees your data',
				paragraphs: [
					'Your data is not sold, used for ads, or shared. The only exception is the services that host the app, send its email and run its calls, which handle data because the app can’t work without them.'
				]
			},
			{
				heading: 'Deleting your data',
				paragraphs: [
					`To have your account or any content you name deleted, send the request from the address you signed up with. ${howToReach(operator)}`
				]
			},
			{
				heading: 'Changes',
				paragraphs: ['If this page changes, the date at the top changes with it.']
			},
			{ heading: 'Contact', paragraphs: [howToReach(operator)] }
		]
	}),
	terms: (operator: LegalOperator): LegalDocument => ({
		title: 'Terms of service',
		updated: 'Last updated 24 November 2026',
		intro: [`Log Cabin is run by ${operatorOf(operator)}. By using it you agree to these terms.`],
		sections: [
			{
				heading: 'Beta, as is',
				paragraphs: [
					'It is a work in progress. It may be slow, wrong, or down, and features may change or disappear. It is provided as it is, with no warranty. Please keep your own copy of anything you can’t lose.'
				]
			},
			{
				heading: 'Your content',
				paragraphs: [
					'What you put in Log Cabin stays yours, or your organization’s. You give the operator permission to store it, process it and show it to the people you share it with, only so the app can run.'
				]
			},
			{
				heading: 'Using it well',
				paragraphs: [
					'Use Log Cabin for lawful work with the people in your organization. Don’t try to break it, get into other people’s data, send spam through it, or put in anything you have no right to share.'
				]
			},
			{
				heading: 'Access',
				paragraphs: [
					'The operator can suspend or remove access, and can end the service, at any time, and will tell you first when possible.'
				]
			},
			{
				heading: 'Leaving',
				paragraphs: [
					`You can stop using Log Cabin whenever you like. To have your account or content deleted, ask the operator. ${howToReach(operator)}`
				]
			},
			{
				heading: 'Liability',
				paragraphs: [
					'The operator is not liable for lost data or other losses from using Log Cabin, to the extent the law allows.'
				]
			},
			{
				heading: 'Changes',
				paragraphs: [
					'If these terms change, the date at the top changes, and continuing to use Log Cabin means you accept the new terms.'
				]
			},
			{ heading: 'Contact', paragraphs: [howToReach(operator)] }
		]
	})
};
