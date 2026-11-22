import { describe, expect, it } from 'vitest';
import { renderEmail } from './layout';
import {
	inviteMail,
	joinApprovedMail,
	joinDeniedMail,
	joinRequestMail,
	resetMail,
	signInMail
} from './templates';

const site = 'https://campfire.test';

describe('emails', () => {
	const every = {
		signIn: signInMail('Acme', `${site}/login/verify?token=t1`),
		reset: resetMail('Acme', `${site}/login/reset?token=t2`),
		invite: inviteMail('Ada', 'Acme', `${site}/invite/t3`),
		joinRequest: joinRequestMail(
			{ name: 'Bo', email: 'bo@example.com' },
			'Acme',
			`${site}/members?view=requests`
		),
		joinApproved: joinApprovedMail('Acme', `${site}/login`),
		joinDenied: joinDeniedMail('Acme')
	};

	for (const [name, mail] of Object.entries(every)) {
		it(`${name} has a plain-text part and an HTML part, each matching its snapshot`, () => {
			expect(mail.text).toMatchSnapshot('text');
			expect(mail.html).toMatchSnapshot('html');
		});
	}

	it('puts every link of the HTML part in the text part too', () => {
		for (const [name, mail] of Object.entries(every)) {
			const links = [...mail.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
			for (const link of links) {
				expect(mail.text, `${name}: the text part is missing ${link}`).toContain(link);
			}
		}
	});

	it('loads nothing remote when opened', () => {
		for (const [name, mail] of Object.entries(every)) {
			expect(mail.html, name).not.toMatch(/<img|<link|url\(|src=/);
		}
	});

	it('shows what people wrote as text, never as markup', () => {
		const mail = renderEmail(
			{
				subject: 'You have 1 unread notification',
				blocks: [
					{
						items: [
							{
								line: 'Eve <b>mentioned</b> you',
								detail: '<script>alert(1)</script> & "quotes"',
								url: `${site}/posts/p1?a=1&b=2`
							}
						]
					}
				]
			},
			'Acme <Labs>'
		);
		expect(mail.html).not.toContain('<script>');
		expect(mail.html).not.toContain('<b>');
		expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;');
		expect(mail.html).toContain('Acme &lt;Labs&gt;');
		expect(mail.html).toContain('href="https://campfire.test/posts/p1?a=1&amp;b=2"');
		expect(mail.text).toContain('Eve <b>mentioned</b> you: “<script>alert(1)</script> & "quotes"”');
	});
});
