// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Role } from '#lib/server/db/schema/index.js';
import type { ThemeChoice } from '#lib/styles/theme.js';

declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			user: {
				id: string;
				name: string;
				username: string;
				email: string;
				avatarUrl: string | null;
				theme: ThemeChoice;
			} | null;
			member: { id: string; role: Role } | null;
		}

		interface PageState {
			/** The project a new post is being written in, in the dialog over the page. */
			newPost?: string;
			/** The message that post starts from, by Start a post… on it. */
			fromMessage?: { id: string; body: import('#lib/editor/doc.js').DocNode };
			/** The doc that post shares (Share in a thread…), and whether it is in a channel yet. */
			shareDoc?: { id: string; title: string; inChannel: boolean };
		}
	}

	// Secrets and optional bindings. wrangler types only sees what wrangler.jsonc declares.
	interface Env {
		SESSION_SECRET?: string;
		SETUP_TOKEN?: string;
		MAIL_VIEWER_TOKEN?: string;
		DEV_LOGIN?: string;
		RESEND_API_KEY?: string;
		POSTMARK_TOKEN?: string;
		VAPID_PUBLIC_KEY?: string;
		VAPID_PRIVATE_KEY?: string;
		/** The deployment's base URL, for links in email sent from cron jobs. */
		APP_URL?: string;
		/** This deployment's OAuth client key for AT Protocol sign-in: an ES256 P-256 private JWK. */
		ATPROTO_CLIENT_KEY?: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
		/** Cal.com's API base, for a self-hosted Cal.com; Cal.com's own when unset. */
		CALCOM_API_URL?: string;
		/** Cloudflare Realtime SFU app; calls are hidden unless both are set. */
		REALTIME_APP_ID?: string;
		REALTIME_APP_TOKEN?: string;
		/** Optional Cloudflare TURN key, for people behind networks that block direct media. */
		REALTIME_TURN_KEY_ID?: string;
		REALTIME_TURN_KEY_TOKEN?: string;
		IMAGES?: ImagesBinding;
		EMAIL?: SendEmail;
	}
}

export {};
