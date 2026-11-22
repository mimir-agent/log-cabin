/** The design tools whose files Campsite opens in their own apps, by file extension. */
const appExtensions = { '.origami': 'origami', '.prd': 'principle', '.stitch': 'stitch' } as const;

export type AppFileKind = (typeof appExtensions)[keyof typeof appExtensions];

/** Which design tool's file this is, by its name, or null for any other file. */
export function appFileKind(name: string): AppFileKind | null {
	const lower = name.toLowerCase();
	const extension = (Object.keys(appExtensions) as (keyof typeof appExtensions)[]).find((e) =>
		lower.endsWith(e)
	);
	return extension ? appExtensions[extension] : null;
}

/** The scheme a design tool's app registers, which opens a file's address in it. */
export const appSchemes: Record<AppFileKind, string> = {
	origami: 'origami-public',
	principle: 'principle',
	stitch: 'stitch'
};
