import { getEnv } from '#lib/server/platform.js';
import { loadPublicPost } from '#lib/server/posts/public-links.js';
import { attachmentIdOf, type DocNode } from '#lib/editor/doc.js';
import type { PageServerLoad } from './$types';

function firstImage(node: DocNode): string | null {
	if (node.type === 'image') return String(node.attrs?.src);
	for (const child of node.content ?? []) {
		const src = firstImage(child);
		if (src) return src;
	}
	return null;
}

export const load: PageServerLoad = async ({ params, url, setHeaders }) => {
	const post = await loadPublicPost(getEnv(), params.token);
	// Revoking must take effect at once, so nothing may keep a copy.
	setHeaders({
		'cache-control': 'no-store',
		...(post.org.indexable ? {} : { 'x-robots-tag': 'noindex' })
	});
	const base = `/p/${params.token}`;
	const logoUrl = post.org.logoKey ? `${base}/logo` : null;
	const image = firstImage(post.body);
	// og:image: the post's first image, else the org logo, else none.
	const imagePath = image ? `${base}/files/${attachmentIdOf(image)}` : logoUrl;
	return {
		title: post.title,
		body: post.body,
		authorName: post.authorName,
		createdAt: post.createdAt,
		orgName: post.org.name,
		indexable: post.org.indexable,
		logoUrl,
		filesUrl: `${base}/files/`,
		url: url.href,
		description: post.bodyText.slice(0, 160),
		imageUrl: imagePath && new URL(imagePath, url).href
	};
};
