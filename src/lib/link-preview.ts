/** What the server found for a link: an Open Graph card, or a YouTube video to embed. */
export type LinkPreview =
	| {
			kind: 'page';
			url: string;
			title: string;
			description: string | null;
			image: string | null;
			/** The page's host without a leading www., shown under the title. */
			domain: string;
	  }
	| { kind: 'youtube'; url: string; videoId: string; title: string | null }
	/** A post here, for a reader who can read it. */
	| { kind: 'post'; id: string; title: string; project: string; author: string }
	/** A post here this reader can't read, or one that's gone. */
	| { kind: 'unavailable' };
