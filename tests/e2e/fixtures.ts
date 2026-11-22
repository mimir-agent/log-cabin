// Who and what the end-to-end tests start with. serve.ts writes these into a fresh local
// database; the specs sign in with the tokens as session cookies.
import type { DocMark, DocNode } from '../../src/lib/editor/doc.ts';

export const port = 8799;
export const baseURL = `http://localhost:${port}`;
export const persistTo = '.wrangler/e2e';

/**
 * Settings the server runs with. Calls count as set up, so call pages and recording work;
 * nothing in the tests reaches the SFU, whose app these name doesn't exist. A spec that joins
 * a call answers its browser's SFU requests in the browser.
 */
export const devVars = {
	REALTIME_APP_ID: 'e2e',
	REALTIME_APP_TOKEN: 'e2e',
	APP_URL: baseURL,
	SESSION_SECRET: 'e2e-session-secret'
};

/** Ada writes the notes. Bo may edit the trip note, Cy may only view it, Dee can't see it.
 *  Eve is the one admin. Fay sets a password and turns on two-factor; she shares no notes. */
export const people = {
	ada: { id: '01E2EADA000000000000000000', name: 'Ada', token: 'e2e-session-ada', role: 'member' },
	bo: { id: '01E2EB0000000000000000000B', name: 'Bo', token: 'e2e-session-bo', role: 'member' },
	cy: { id: '01E2EC0000000000000000000C', name: 'Cy', token: 'e2e-session-cy', role: 'member' },
	dee: { id: '01E2ED0000000000000000000D', name: 'Dee', token: 'e2e-session-dee', role: 'member' },
	eve: { id: '01E2EE0000000000000000000E', name: 'Eve', token: 'e2e-session-eve', role: 'admin' },
	fay: { id: '01E2EF0000000000000000000F', name: 'Fay', token: 'e2e-session-fay', role: 'member' }
};
export type Person = keyof typeof people;

/** An open project anyone may post in. Ada has joined it, so it is in her sidebar. */
export const project = { id: '01E2EPR0JECT00000000000000', name: 'Trail' };

/** A second open project nobody has joined: somewhere else the new-post picker can send a post. */
export const camp = { id: '01E2EPR0JECTCAMP0000000000', name: 'Camp' };

/**
 * A private project only Ada and Bo are in, with Ada's post in it. Its name sorts after Trail's,
 * so Trail stays Ada's first project, where New post opens.
 */
export const cave = {
	id: '01E2ECAVE00000000000000000',
	name: 'Tunnel',
	members: ['ada', 'bo'] as Person[],
	post: { id: '01E2ECAVEP0ST0000000000000', title: 'Secret route', text: 'Over the ridge' },
	/** Its chat tab: a channel's thread, with Ada and Bo in it. */
	chatId: '01E2ECAVECHAT0000000000000'
};

/**
 * An open project Ada archived, with a chat tab. Its name sorts after Trail's, so Trail stays
 * Ada's first project.
 */
export const yard = {
	id: '01E2EYARD00000000000000000',
	name: 'Yard',
	chatId: '01E2EYARDCHAT0000000000000',
	/** Ada's post here, with a comment of Bo's: a channel nobody can comment in any more. */
	post: {
		id: '01E2EYARDP0ST0000000000000',
		title: 'Rota',
		text: 'Who mows?',
		comment: { id: '01E2EYARDC0MMENT0000000000', text: 'I will' }
	}
};

/** Bo's post in Trail with one comment and Bo's 👍, and the inbox item the comment gave Ada. */
export const post = {
	id: '01E2EP0ST00000000000000000',
	title: 'Gear list',
	text: 'Who has a stove?',
	comment: { id: '01E2EC0MMENT00000000000000', text: 'I can bring mine' },
	notification: '01E2EN0T1F1CAT10N000000000'
};

const paragraph = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const text = (value: string, marks?: DocMark[]): DocNode => ({ type: 'text', text: value, marks });

type Note = {
	id: string;
	title: string;
	body: DocNode;
	text: string;
	shares: [Person, 'view' | 'edit'][];
};

/** Ada's direct messages, each with one message from the other person she hasn't read. */
export const threads: Record<'bo' | 'cy', { id: string; with: Person; text: string }> = {
	bo: { id: '01E2ECHATB0000000000000000', with: 'bo', text: 'Tents are packed' },
	cy: { id: '01E2ECHATC0000000000000000', with: 'cy', text: 'Who brings the maps?' }
};

/**
 * A group of Ada, Bo and Cy named Crew, with 300 messages Bo and Cy wrote, "Message 001" to
 * "Message 300", oldest first, and all of them read by Ada.
 */
export const crew = {
	id: '01E2ECHATCREW0000000000000',
	title: 'Crew',
	messageCount: 300,
	text: (n: number) => `Message ${String(n).padStart(3, '0')}`
};

/**
 * A live call in Ada and Bo's thread with both of them in it. serve.ts dates their joins
 * `joinedAfterSeedMs` after it seeds, so the join grace (20 s) runs out while the test runs.
 */
export const call = {
	id: '01E2ECA11000000000000000CA',
	threadId: threads.bo.id,
	participants: { ada: '01E2ECA11ADA0000000000000P', bo: '01E2ECA11B00000000000000BP' },
	joinedAfterSeedMs: 30_000
};

/**
 * Live calls Ada started, for ending: one in the project with Ada and Cy in it, which they
 * join from the page, and one in their thread with only Cy in it. Both joins are dated an
 * hour after seeding, so nobody is taken out of either call while the tests run.
 */
export const endingCalls = {
	project: {
		id: '01E2EENDPR0JECTCA110000000',
		participants: { ada: '01E2EENDPR0JECTADA00000000', cy: '01E2EENDPR0JECTCY000000000' }
	},
	thread: { id: '01E2EENDTHREADCA1100000000', participants: { cy: '01E2EENDTHREADCY0000000000' } },
	joinedAfterSeedMs: 3_600_000
};

/** A call Ada and Cy had in their thread, over by the time the tests run: 03:58 UTC. */
export const pastCall = {
	id: '01E2EPA5TCA11000000000000C',
	threadId: threads.cy.id,
	participant: '01E2EPA5TCA11ADA000000000P',
	startedAt: Date.UTC(2026, 10, 19, 3, 58),
	endedAt: Date.UTC(2026, 10, 19, 4, 1)
};

/**
 * Two moments that fall on another day in UTC than for the reader they're for, with Ada's
 * post, note, read inbox item, call and a message from Dee at each, in Ada and Dee's thread.
 * `pacific` is Oct 14, 6:30 PM in Los Angeles and Oct 15, 1:30 AM in UTC; `tokyo` is Oct 9,
 * 1:45 AM in Tokyo and Oct 8, 4:45 PM in UTC.
 */
export const zoned = {
	threadId: '01E2EZ0NEDTHREAD000000000D',
	at: { pacific: Date.UTC(2026, 9, 15, 1, 30), tokyo: Date.UTC(2026, 9, 8, 16, 45) },
	id: (kind: 'P0ST' | 'N0TE' | 'NT1F' | 'MSG' | 'CA11' | 'PART', moment: 'pacific' | 'tokyo') =>
		`01E2EZ0NED${kind}${moment === 'pacific' ? 'P' : 'T'}`.padEnd(26, '0')
};

/** Both notes exist before live editing does: a body in D1, no live document yet. */
export const notes: Record<'trip' | 'old' | 'tasks' | 'camp' | 'meeting' | 'route', Note> = {
	trip: {
		id: '01E2ETR1P00000000000000000',
		title: 'Trip',
		body: { type: 'doc', content: [paragraph(text('Packing list'))] },
		text: 'Packing list',
		shares: [
			['bo', 'edit'],
			['cy', 'view']
		]
	},
	old: {
		id: '01E2E0LD0000000000000000NT',
		title: 'Old plans',
		body: {
			type: 'doc',
			content: [
				{ type: 'heading', attrs: { level: 2 }, content: [text('Route')] },
				paragraph(text('Start at the '), text('north gate', [{ type: 'bold' }]), text('.')),
				{
					type: 'bulletList',
					content: [
						{ type: 'listItem', content: [paragraph(text('Water'))] },
						{ type: 'listItem', content: [paragraph(text('Maps'))] }
					]
				}
			]
		},
		text: 'Route\nStart at the north gate.\nWater\nMaps',
		shares: []
	},
	tasks: {
		id: '01E2ETASKN0TE0000000000000',
		title: 'Chores',
		body: { type: 'doc', content: [checklist('Sweep', 'Stack wood')] },
		text: 'Sweep\nStack wood',
		shares: []
	},
	camp: {
		id: '01E2EB10CKS000000000000000',
		title: 'Camp guide',
		body: { type: 'doc', content: [paragraph(text('Camp guide'))] },
		text: 'Camp guide',
		shares: [['bo', 'edit']]
	},
	// Bo is in the Tunnel project and Cy isn't, so they see a mention of its post differently.
	meeting: {
		id: '01E2EMEET1NG00000000000000',
		title: 'Meeting',
		body: { type: 'doc', content: [paragraph(text('Agenda'))] },
		text: 'Agenda',
		shares: [
			['bo', 'edit'],
			['cy', 'view']
		]
	},
	// Cy, who may only view, comments on words in it while Bo edits around them.
	route: {
		id: '01E2EPASSAGEN0TE0000000000',
		title: 'Route plan',
		body: { type: 'doc', content: [paragraph(text('Meet at the north gate before sunrise'))] },
		text: 'Meet at the north gate before sunrise',
		shares: [
			['bo', 'edit'],
			['cy', 'view']
		]
	}
};

/**
 * Ada's note shared with the Trail project to view and with Bo to edit, with Bo's comment on
 * it, a page whose link preview is already fetched, and an emoji of the org's own.
 */
export const snow = {
	note: {
		id: '01E2ESN0WN0TE0000000000000',
		title: 'Snow kit',
		body: { type: 'doc', content: [paragraph(text('Snow kit'))] } as DocNode,
		text: 'Snow kit'
	},
	project,
	comment: { id: '01E2ESN0WC0MMENT0000000000', text: 'Chains for the car?' },
	link: {
		url: 'https://camp.example/snow-chains',
		title: 'Fitting snow chains',
		description: 'Lay them flat, drive on, hook them up.'
	},
	emoji: { id: '01E2EEM0J1000000000000000M', name: 'marshmallow' }
};

function checklist(...items: string[]): DocNode {
	return {
		type: 'taskList',
		content: items.map((item) => ({
			type: 'taskItem',
			attrs: { checked: false },
			content: [paragraph(text(item))]
		}))
	};
}

/** Four uploaded images, each a small PNG in R2. */
export const images = [1, 2, 3, 4].map((n) => ({
	id: `01E2E1MAGE00000000000000${n}0`.slice(0, 26),
	name: `photo-${n}.png`
}));

type Post = { id: string; title: string; body: DocNode; text: string };

const image = (id: string, alt: string): DocNode => ({
	type: 'image',
	attrs: { src: `/files/attachments/${id}`, alt }
});

/** Ada's posts in the project; Bo has commented a checklist on the packing post. */
export const posts: Record<'packing' | 'photos', Post> = {
	packing: {
		id: '01E2EP0STPACK1NG0000000000',
		title: 'Packing',
		body: { type: 'doc', content: [checklist('Tents', 'Lanterns')] },
		text: 'Tents\nLanterns'
	},
	photos: {
		id: '01E2EP0STPH0T0S00000000000',
		title: 'Photos',
		body: {
			type: 'doc',
			content: [
				paragraph(text('From the lake')),
				...images.flatMap((i) => [image(i.id, i.name), paragraph()])
			]
		},
		text: 'From the lake'
	}
};

export const comment = {
	id: '01E2EC0MMENTPACK1NG0000000',
	postId: posts.packing.id,
	body: { type: 'doc', content: [checklist('Maps')] } as DocNode,
	text: 'Maps'
};

/**
 * A group of Ada and Bo named Photos, for a phone's width: Bo's four pictures, three pictures
 * and a word too long to break, then Ada's own two pictures. The pictures are small PNGs.
 */
const photoFiles = [1, 2, 3, 4].map((n) => ({
	id: `01E2ECHATPH0T0F1LE0000000${n}`,
	name: `snap-${n}.png`
}));
const pictures = (count: number) =>
	photoFiles.slice(0, count).map((file) => image(file.id, file.name));
export const photos = {
	id: '01E2ECHATPH0T0S0000000000',
	title: 'Photos',
	files: photoFiles,
	messages: [
		{ id: '01E2EPH0T0M0000000000000A1', from: 'bo', content: pictures(4) },
		{ id: '01E2EPH0T0M0000000000000A2', from: 'bo', content: pictures(3) },
		{
			id: '01E2EPH0T0M0000000000000A3',
			from: 'bo',
			content: [paragraph(text('x'.repeat(120)))]
		},
		{ id: '01E2EPH0T0M0000000000000A4', from: 'ada', content: pictures(2) }
	] as { id: string; from: Person; content: DocNode[] }[]
};
