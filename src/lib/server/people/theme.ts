import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { ThemeChoice } from '../../styles/theme';

/** Saves a person's light, dark or system choice; every page they open after uses it. */
export async function setTheme(env: Env, userId: string, theme: ThemeChoice): Promise<void> {
	await db(env).update(schema.users).set({ theme }).where(eq(schema.users.id, userId));
}
