import { getEnv } from '#lib/server/platform.js';
import { fail } from '@sveltejs/kit';
import { renderSVG } from 'uqr';
import { requireMember } from '#lib/server/auth/guard.js';
import {
	cancelFailure,
	minLength,
	newPasswordProblem,
	setPassword,
	storedPasswordHash,
	takeFailureSlot,
	verifyPassword
} from '#lib/server/auth/password.js';
import { provisioningUri } from '#lib/server/auth/totp.js';
import {
	confirmEnrolment,
	disableTwoFactor,
	regenerateRecoveryCodes,
	startEnrolment,
	twoFactorState
} from '#lib/server/auth/two-factor.js';
import { getOrg } from '#lib/server/org.js';
import { auth } from '#lib/strings/auth.js';
import type { Actions, PageServerLoad } from './$types';

// Only the signed-in person sees or changes these; there is no admin view of them.
export const load: PageServerLoad = async (event) => {
	const { user } = requireMember(event);
	const env = getEnv();
	const state = await twoFactorState(env, user.id);
	const enrolment = state.pendingSecret
		? {
				secret: state.pendingSecret,
				qr: `data:image/svg+xml;base64,${btoa(
					renderSVG(provisioningUri(state.pendingSecret, user.email, (await getOrg(env)).name))
				)}`
			}
		: null;
	return {
		hasPassword: (await storedPasswordHash(env, user.id)) !== null,
		minLength,
		twoFactor: { enabled: state.enabled, codesLeft: state.codesLeft },
		enrolment
	};
};

function code(form: FormData): string {
	return String(form.get('code') ?? '');
}

export const actions: Actions = {
	password: async (event) => {
		const { user } = requireMember(event);
		const env = getEnv();
		const form = await event.request.formData();
		const stored = await storedPasswordHash(env, user.id);
		if (stored) {
			const failure = await takeFailureSlot(env, `password:${user.email}`);
			if (failure === null) {
				return fail(429, { passwordMessage: auth.password.errors.rateLimited });
			}
			if (!(await verifyPassword(String(form.get('current') ?? ''), stored))) {
				return fail(400, { passwordMessage: auth.security.errors.currentWrong });
			}
			await cancelFailure(env, failure);
		}
		const password = String(form.get('password') ?? '');
		const problem = await newPasswordProblem(password);
		if (problem) return fail(400, { passwordMessage: problem });
		await setPassword(env, user.id, password);
		return { passwordSaved: true };
	},

	startTwoFactor: async (event) => {
		const { user } = requireMember(event);
		await startEnrolment(getEnv(), user.id);
	},

	confirmTwoFactor: async (event) => {
		const { user } = requireMember(event);
		const result = await confirmEnrolment(getEnv(), user.id, code(await event.request.formData()));
		if (!result.ok) return fail(400, { twoFactorMessage: result.message });
		return { recoveryCodes: result.codes };
	},

	disableTwoFactor: async (event) => {
		const { user } = requireMember(event);
		const result = await disableTwoFactor(getEnv(), user.id, code(await event.request.formData()));
		if (!result.ok) return fail(400, { twoFactorMessage: result.message });
		return { twoFactorDisabled: true };
	},

	regenerateCodes: async (event) => {
		const { user } = requireMember(event);
		const env = getEnv();
		if (!(await twoFactorState(env, user.id)).enabled) {
			return fail(400, { twoFactorMessage: auth.security.errors.notOn });
		}
		const result = await regenerateRecoveryCodes(
			env,
			user.id,
			code(await event.request.formData())
		);
		if (!result.ok) return fail(400, { twoFactorMessage: result.message });
		return { recoveryCodes: result.codes };
	}
};
