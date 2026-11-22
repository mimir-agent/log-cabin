// Every email the app sends, as its subject, plain-text part and HTML part.
import { auth } from '../../strings/auth';
import { invites } from '../../strings/invites';
import { renderEmail } from './layout';

export function signInMail(orgName: string, link: string) {
	const mail = auth.email.signIn;
	return renderEmail(
		{
			subject: mail.subject(orgName),
			blocks: [
				{ paragraph: mail.intro(orgName) },
				{ button: { label: mail.button, url: link } },
				{ note: mail.note }
			]
		},
		orgName
	);
}

export function resetMail(orgName: string, link: string) {
	const mail = auth.email.reset;
	return renderEmail(
		{
			subject: mail.subject(orgName),
			blocks: [
				{ paragraph: mail.intro(orgName) },
				{ button: { label: mail.button, url: link } },
				{ note: mail.note }
			]
		},
		orgName
	);
}

export function inviteMail(inviterName: string, orgName: string, link: string) {
	const mail = auth.email.invite;
	return renderEmail(
		{
			subject: mail.subject(orgName),
			blocks: [
				{ paragraph: mail.intro(inviterName, orgName) },
				{ button: { label: mail.button, url: link } },
				{ note: mail.note }
			]
		},
		orgName
	);
}

/** To each admin, when someone asks to join. */
export function joinRequestMail(
	requester: { name: string; email: string },
	orgName: string,
	link: string
) {
	const mail = invites.email.request;
	return renderEmail(
		{
			subject: mail.subject(requester.name, orgName),
			blocks: [
				{ paragraph: mail.intro(requester.name, requester.email, orgName) },
				{ button: { label: mail.button, url: link } }
			]
		},
		orgName
	);
}

export function joinApprovedMail(orgName: string, link: string) {
	const mail = invites.email.approved;
	return renderEmail(
		{
			subject: mail.subject(orgName),
			blocks: [{ paragraph: mail.intro(orgName) }, { button: { label: mail.button, url: link } }]
		},
		orgName
	);
}

export function joinDeniedMail(orgName: string) {
	const mail = invites.email.denied;
	return renderEmail(
		{ subject: mail.subject(orgName), blocks: [{ paragraph: mail.intro(orgName) }] },
		orgName
	);
}
