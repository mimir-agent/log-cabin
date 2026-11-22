import { env } from 'cloudflare:workers';

// The Worker's bindings, vars and secrets. adapter-cloudflare doesn't pass them as
// event.platform; they come from the runtime module. app.d.ts declares the secrets.
export function getEnv(): Env {
	return env as Env;
}
