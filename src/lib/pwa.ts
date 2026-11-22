/**
 * The page background, `--hue-z0-bg`, in each scheme. The web app manifest and the
 * theme-color meta tags can't read CSS, so they take these; a browser test holds them to the
 * tokens.
 */
export const pageBackground = { light: '#ffffff', dark: '#0d0d0d' } as const;
