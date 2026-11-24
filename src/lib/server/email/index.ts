import { db, schema } from '../db';
import { newId } from '../id';
import type { RenderedEmail } from './layout';

/**
 * Every email has both parts: build them with renderEmail. Headers go out only through the
 * cloudflare transport, and only the ones Cloudflare allows (see its Email headers page).
 */
export type EmailMessage = { to: string; headers?: Record<string, string> } & RenderedEmail;

/** Cloudflare refused the message in a way that sending it again cannot fix. */
export class EmailRejected extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(message);
	}
}

// Recipient refused, bad payload, bad sender, bad header. Everything else (rate and daily
// limits, delivery and server errors, a domain still being set up) can pass on a later try.
const permanentCloudflareCodes =
	/^E_(RECIPIENT_SUPPRESSED|RECIPIENT_NOT_ALLOWED|VALIDATION_ERROR|SENDER_|HEADER)/;

/** The binding takes a plain address or { email, name }, not "Name <address>". */
function cloudflareAddress(from: string): string | { email: string; name: string } {
	const match = /^\s*"?(.+?)"?\s*<([^<>]+)>\s*$/.exec(from);
	return match ? { name: match[1], email: match[2] } : from.trim();
}

type Transport = (env: Env, from: string, message: EmailMessage) => Promise<void>;

// EMAIL_TRANSPORT picks one. SMTP is not supported.
const transports = {
	// Development: mail lands in dev_mail and shows up at /__mail.
	log: async (env, from, message) => {
		await db(env).insert(schema.devMail).values({
			id: newId(),
			toAddress: message.to,
			fromAddress: from,
			subject: message.subject,
			textBody: message.text,
			htmlBody: message.html,
			createdAt: Date.now()
		});
	},
	cloudflare: async (env, from, message) => {
		if (!env.EMAIL) {
			throw new Error(
				'EMAIL_TRANSPORT is cloudflare but the EMAIL send_email binding is not configured in wrangler.jsonc'
			);
		}
		try {
			await env.EMAIL.send({
				from: cloudflareAddress(from),
				to: message.to,
				subject: message.subject,
				html: message.html,
				text: message.text,
				...(env.EMAIL_REPLY_TO ? { replyTo: env.EMAIL_REPLY_TO } : {}),
				...(message.headers && { headers: message.headers })
			});
		} catch (cause) {
			const code = (cause as { code?: unknown }).code;
			if (typeof code === 'string' && permanentCloudflareCodes.test(code)) {
				throw new EmailRejected(
					code,
					`sendEmail via cloudflare: ${code}: ${(cause as Error).message}`
				);
			}
			throw cause;
		}
	},
	resend: async (env, from, message) => {
		if (!env.RESEND_API_KEY) {
			throw new Error('EMAIL_TRANSPORT is resend but the RESEND_API_KEY secret is not set');
		}
		await post('resend', 'https://api.resend.com/emails', {
			headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
			body: {
				from,
				to: [message.to],
				subject: message.subject,
				text: message.text,
				html: message.html
			}
		});
	},
	postmark: async (env, from, message) => {
		if (!env.POSTMARK_TOKEN) {
			throw new Error('EMAIL_TRANSPORT is postmark but the POSTMARK_TOKEN secret is not set');
		}
		await post('postmark', 'https://api.postmarkapp.com/email', {
			headers: { 'x-postmark-server-token': env.POSTMARK_TOKEN },
			body: {
				From: from,
				To: message.to,
				Subject: message.subject,
				TextBody: message.text,
				HtmlBody: message.html,
				MessageStream: 'outbound'
			}
		});
	}
} satisfies Record<string, Transport>;

async function post(
	service: string,
	url: string,
	{ headers, body }: { headers: Record<string, string>; body: unknown }
): Promise<void> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
		body: JSON.stringify(body)
	});
	if (!response.ok) {
		const detail = (await response.text()).slice(0, 500);
		throw new Error(`sendEmail via ${service}: ${url} answered ${response.status}: ${detail}`);
	}
}

export async function sendEmail(env: Env, message: EmailMessage): Promise<void> {
	// wrangler types narrows the var to the literal in wrangler.jsonc; deployments override it.
	const name: string = env.EMAIL_TRANSPORT;
	if (!Object.hasOwn(transports, name)) {
		throw new Error(
			`EMAIL_TRANSPORT is "${name}"; expected one of ${Object.keys(transports).join(', ')}`
		);
	}
	const realMail = realMailOnTest(env, name);
	if (realMail.length > 0) {
		console.warn(
			`sendEmail: not sending "${message.subject}". The campfire-test Worker sends mail only with EMAIL_TRANSPORT=log and no mail credentials; found ${realMail.join(', ')}.`
		);
		return;
	}
	await transports[name as keyof typeof transports](env, env.EMAIL_FROM, message);
}

/**
 * For mail a cron sends again until it works: a message that can never be sent is logged and
 * counts as sent, so one bad address doesn't make every run fail.
 */
export async function sendEmailOnce(env: Env, message: EmailMessage): Promise<void> {
	try {
		await sendEmail(env, message);
	} catch (cause) {
		if (!(cause instanceof EmailRejected)) throw cause;
		console.error(`sendEmailOnce: not retrying "${message.subject}" to ${message.to}`, cause);
	}
}

// The test deployment's people are fake, so its mail must stay in dev_mail.
function realMailOnTest(env: Env, transport: string): string[] {
	if (env.WORKER_NAME !== 'campfire-test') return [];
	return [
		transport !== 'log' && `EMAIL_TRANSPORT=${transport}`,
		env.RESEND_API_KEY && 'RESEND_API_KEY',
		env.POSTMARK_TOKEN && 'POSTMARK_TOKEN',
		env.EMAIL && 'the EMAIL binding'
	].filter((found) => typeof found === 'string');
}
