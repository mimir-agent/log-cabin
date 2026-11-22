export const mail = {
	title: 'Dev mail',
	intro: 'The 50 most recent emails sent with EMAIL_TRANSPORT=log, newest first.',
	empty: 'No mail sent yet.',
	to: 'To',
	from: 'From',
	sent: 'Sent',
	html: 'HTML',
	htmlTitle: (subject: string) => `HTML of “${subject}”`,
	noHtml: 'This email has no HTML part.',
	text: 'Plain text'
};
