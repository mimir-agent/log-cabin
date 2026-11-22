// Every email's HTML and plain-text parts, from one description of its content. The HTML keeps
// to what mail clients render: tables, inline styles, system fonts and no images, so nothing
// remote loads when it's opened.

/** One piece of an email, top to bottom. */
export type EmailBlock =
	| { paragraph: string }
	/** The email's one action, as a button; the text part gives its URL on its own line. */
	| { button: { label: string; url: string } }
	/** A list of things that happened, each a line, what it's about, and a link. */
	| { items: { line: string; detail: string | null; url: string }[] }
	| { heading: string }
	/** Smaller and quieter: why you got this, how to stop it. */
	| { note: string };

export type EmailContent = { subject: string; blocks: EmailBlock[] };

export type RenderedEmail = { subject: string; text: string; html: string };

// The light theme's tokens as hex, since mail clients don't read custom properties or oklch:
// --hue-z0-bg, --hue-z0-fg, --hue-z0-muted, --hue-gray-200 (a hairline), and the primary
// button's --hue-accent with --hue-accent-fg.
const color = {
	page: '#fcfcfc',
	card: '#ffffff',
	text: '#171717',
	muted: '#737373',
	line: '#e5e5e5',
	button: '#262626',
	buttonText: '#fcfcfc'
};
const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

function textBlock(block: EmailBlock): string {
	if ('paragraph' in block) return block.paragraph;
	if ('heading' in block) return block.heading;
	if ('note' in block) return block.note;
	if ('button' in block) return `${block.button.label}: ${block.button.url}`;
	return block.items
		.map(({ line, detail, url }) =>
			detail ? `- ${line}: “${detail}”\n  ${url}` : `- ${line}\n  ${url}`
		)
		.join('\n');
}

function htmlBlock(block: EmailBlock): string {
	const cell = (style: string, content: string) =>
		`<tr><td style="padding:0 0 16px;${style}">${content}</td></tr>`;
	if ('paragraph' in block) {
		return cell('font-size:15px;line-height:22px;', escapeHtml(block.paragraph));
	}
	if ('heading' in block) {
		return cell('font-size:16px;line-height:22px;font-weight:600;', escapeHtml(block.heading));
	}
	if ('note' in block) {
		return cell(`font-size:13px;line-height:18px;color:${color.muted};`, escapeHtml(block.note));
	}
	if ('button' in block) {
		const { label, url } = block.button;
		return cell(
			'',
			`<a href="${escapeHtml(url)}" style="display:inline-block;padding:9px 16px;border-radius:8px;background-color:${color.button};color:${color.buttonText};font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>`
		);
	}
	const rows = block.items
		.map(
			({ line, detail, url }) =>
				`<tr><td style="padding:10px 0;border-top:1px solid ${color.line};"><a href="${escapeHtml(url)}" style="color:${color.text};text-decoration:none;"><span style="display:block;font-size:14px;line-height:20px;font-weight:600;">${escapeHtml(line)}</span>${detail ? `<span style="display:block;font-size:14px;line-height:20px;color:${color.muted};">${escapeHtml(detail)}</span>` : ''}</a></td></tr>`
		)
		.join('');
	return cell(
		'',
		`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
	);
}

/** The email's subject, its plain-text part and its HTML part, with the org's name at the top. */
export function renderEmail(content: EmailContent, orgName: string): RenderedEmail {
	const text = [orgName, ...content.blocks.map(textBlock)].join('\n\n');
	const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background-color:${color.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${color.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${color.card};border:1px solid ${color.line};border-radius:12px;font-family:${font};color:${color.text};">
<tr><td style="padding:24px 24px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 20px;font-size:14px;line-height:20px;font-weight:600;">${escapeHtml(orgName)}</td></tr>
${content.blocks.map(htmlBlock).join('\n')}
</table>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
	return { subject: content.subject, text, html };
}
