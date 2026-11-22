import type { InvitationStatus } from '../server/db/schema/calls';
import type { RecordingStatus } from '../server/db/schema/recordings';

export const calls = {
	place: {
		start: 'Start call',
		join: 'Join call',
		live: (names: string[]) =>
			names.length === 0 ? 'Call in progress' : `Call in progress with ${names.join(', ')}`,
		recent: 'Recent calls',
		/** A call that ended, among a thread's messages (Campsite's). */
		ended: (minutes: number, names: string[]) =>
			`Call · ${minutes < 1 ? 'under a minute' : minutes === 1 ? '1 minute' : `${minutes} minutes`} · ${names.join(', ')}`,
		summary: (minutes: number, names: string[]) =>
			`${minutes < 1 ? 'Under a minute' : minutes === 1 ? '1 minute' : `${minutes} minutes`} · ${names.join(', ')}`
	},
	room: {
		title: (place: string) => `Call in ${place}`,
		ready: 'Your camera and microphone turn on when you join.',
		join: 'Join',
		joining: 'Joining…',
		leave: 'Leave',
		leaveTitle: 'Leave the call?',
		leaveNote: 'You’re still in this call. Going to another page hangs up.',
		stay: 'Stay in call',
		leaveAndGo: 'Leave call',
		controls: 'Call controls',
		end: 'End call for everyone',
		mute: 'Mute',
		unmute: 'Unmute',
		cameraOff: 'Turn camera off',
		cameraOn: 'Turn camera on',
		share: 'Share screen',
		stopShare: 'Stop sharing',
		you: (name: string) => `${name} (you)`,
		screenOf: (name: string) => `${name}’s screen`,
		muted: 'Muted',
		participants: (n: number) => (n === 1 ? '1 person in the call' : `${n} people in the call`),
		ended: 'This call has ended.',
		waiting: 'Waiting for others to join…',
		noMedia:
			'Couldn’t use your camera or microphone. Allow this site to use them in your browser, then try again.',
		failed: (detail: string) => `Something went wrong in the call: ${detail}`
	},
	index: {
		nav: 'Calls',
		title: 'Calls',
		projectTitle: (project: string) => `Calls in ${project}`,
		back: (project: string) => `Back to ${project}`,
		tabsLabel: 'Which calls',
		tabs: { all: 'All', joined: 'Joined' },
		empty: {
			all: 'Record your calls',
			joined: 'You haven’t been in a call yet.',
			project: 'No calls in this channel yet.'
		},
		emptyHint: 'When you record a call, its transcript and summary appear here.',
		live: 'Live calls',
		liveIn: (place: string, names: string[]) => {
			const others = names.filter((name) => name !== place);
			return others.length === 0 ? place : `${place} · ${others.join(', ')}`;
		},
		start: 'Start a call',
		processing: 'Processing call…',
		recorded: 'Has a recording',
		transcribed: 'Has a transcript',
		yourRoom: 'Your room',
		more: 'Older calls',
		disabled: 'Calls aren’t set up for this organization yet.',
		duration: (ms: number) => {
			const minutes = Math.round(ms / 60_000);
			if (minutes < 1) return 'Under a minute';
			if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
			const hours = Math.floor(minutes / 60);
			const rest = minutes % 60;
			return `${hours} h${rest ? ` ${rest} min` : ''}`;
		},
		people: (names: string[]) => names.join(', '),
		time: (ms: number, timeZone: string) =>
			new Date(ms).toLocaleTimeString('en', { timeStyle: 'short', timeZone })
	},
	/** Editing a call's title and its notes. */
	edit: {
		titlePlaceholder: 'Meeting title',
		untitled: 'Untitled',
		notesPlaceholder: 'Add meeting notes…',
		edit: 'Edit',
		save: 'Save',
		cancel: 'Cancel',
		saved: 'Saved.',
		editedBy: (name: string) => `Edited by ${name}`,
		notesEmpty: 'Write something before you save.',
		cannotEdit: 'Only people who can edit this call can change its title or notes.'
	},
	/** Sharing a call into a channel after it has started, and taking it out. */
	share: {
		title: 'Share call',
		intoChannel: 'Share into a channel',
		channel: 'Channel',
		permission: 'Channel members can',
		view: 'View',
		edit: 'Edit',
		viewHint: 'Members can open the call and read it.',
		editHint: 'Members can also change its title and notes.',
		submit: 'Share',
		shared: (channel: string) => `Call shared in ${channel}.`,
		remove: 'Remove from channel',
		removed: 'Call removed from the channel. Its members no longer have access.',
		cannotShare: 'Only people who can edit this call can share it.'
	},
	/** The member's own call link, in settings. */
	personalLink: {
		title: 'Personal call links',
		intro: 'A call link that stays the same. Anyone you share it with can join your room.',
		copy: 'Copy link',
		copied: 'Personal call link copied to clipboard.'
	},
	/** Chat among the people in a call. */
	chat: {
		title: 'Chat',
		show: 'Show chat',
		hide: 'Hide chat',
		placeholder: 'Send a message',
		send: 'Send',
		empty: 'No messages yet.',
		privacy:
			'Only people in this call can see these messages. They are saved only if the call is recorded.',
		newMessages: (n: number) => (n === 1 ? '1 new message' : `${n} new messages`),
		errors: {
			notInCall: 'Only people in this call can read or send its chat.',
			sendFailed: 'Couldn’t send that message. Try again.'
		}
	},
	personalRoom: {
		yours: 'Your room',
		of: (name: string) => `${name}’s room`,
		intro: 'A call link that stays the same. Share it with anyone in your organization.',
		introOther: (name: string) => `Start or join a call with ${name}.`,
		link: 'Room link',
		copy: 'Copy link',
		copied: 'Copied',
		empty: 'Nobody is in this room right now.',
		inRoom: (names: string[]) => `In the room: ${names.join(', ')}`,
		start: 'Start call',
		join: 'Join call',
		call: 'Call'
	},
	devices: {
		legend: 'Camera, microphone and speaker',
		kinds: { audioinput: 'Microphone', videoinput: 'Camera', audiooutput: 'Speaker' },
		unnamed: (kind: 'audioinput' | 'videoinput' | 'audiooutput', n: number) =>
			`${calls.devices.kinds[kind]} ${n}`,
		noiseCancellation: 'Noise cancellation',
		settings: 'Devices',
		layout: 'Layout',
		speakerView: 'Speaker',
		gridView: 'Grid',
		preview: 'Your camera preview'
	},
	ringing: {
		pushTitle: (from: string) => `${from} invited you to a call`,
		incoming: (from: string) => `${from} is calling`,
		where: (place: string) => `Call in ${place}`,
		accept: 'Join',
		decline: 'Decline',
		invite: 'Invite',
		inviteTitle: 'Invite people to this call',
		inviteIntro:
			'Any tab they have open rings. If they have no tab open, their devices get a notification.',
		noOneToInvite: 'Everyone who can join this call is already in it.',
		send: 'Ring them',
		cancel: 'Cancel',
		status: {
			ringing: 'Ringing…',
			accepted: 'Joined',
			declined: 'Declined',
			missed: 'No answer',
			cancelled: 'Call ended'
		} satisfies Record<InvitationStatus, string>,
		invited: 'Invited'
	},
	errors: {
		callNotFound: 'That call doesn’t exist, or it’s somewhere you can’t see.',
		cannotInvite:
			'You can only invite active members who can see this call and aren’t already in it.',
		notRinging: 'That call isn’t ringing any more.',
		roomNotFound: 'That room doesn’t exist, or you can’t join it.',
		ended: 'This call has ended.',
		notInCall: 'You aren’t in this call.',
		cannotEnd: 'Only the person who started the call or an admin can end it for everyone.',
		unknownTrack: 'That audio or video isn’t part of this call any more. Reload the page.',
		disabled: 'Calls aren’t set up for this organization yet.'
	},
	recording: {
		banner: (name: string) => `Recording · started by ${name}`,
		pill: 'Recording',
		start: 'Record',
		stop: 'Stop recording',
		stopShort: 'Stop',
		starting: 'Starting…',
		videoHere:
			'Your browser is recording the call’s video. If you leave the call, the video stops, but the audio keeps recording.',
		title: 'Recordings',
		from: (at: string) => `Recording from ${at}`,
		notRecorded: 'Nobody recorded this call, so it has no summary, recording or transcript.',
		status: {
			recording: 'Recording now',
			processing: 'Writing the transcript…',
			ready: '',
			failed: 'Something went wrong with this recording. What was saved is below.'
		} satisfies Record<RecordingStatus, string>,
		video: 'Video',
		noVideo: 'No video was saved for this recording.',
		audio: 'Audio',
		playAudio: 'Load audio',
		loadingAudio: 'Mixing the audio…',
		retryAudio: 'Try again',
		transcript: 'Transcript',
		noTranscript: 'No speech was transcribed.',
		jumpToCurrent: 'Jump to current',
		at: (ms: number) => {
			const seconds = Math.floor(ms / 1000);
			const pad = (n: number) => String(n).padStart(2, '0');
			const h = Math.floor(seconds / 3600);
			const m = Math.floor((seconds % 3600) / 60);
			return h ? `${h}:${pad(m)}:${pad(seconds % 60)}` : `${m}:${pad(seconds % 60)}`;
		},
		/** The `topics` key stays; its heading reads Agenda, as in Campsite. */
		sections: { summary: 'Summary', topics: 'Agenda', nextSteps: 'Next steps' },
		/** Delete every recording of a call: the audio, video, transcript and summary. */
		deleteAll: 'Delete all recordings',
		deleteAllTitle: 'Delete all recordings',
		deleteAllBody:
			'This permanently deletes every recording of this call, with its audio, video, transcript and summary. This can’t be undone.',
		deleteAllConfirm: 'Delete recordings',
		deleteAllCancel: 'Cancel',
		deleteAllDone: 'Recordings deleted.',
		cannotDeleteAll: 'Only people who can edit this call can delete its recordings.',
		/** Transcript downloads. */
		download: 'Download transcript',
		downloadFormats: { srt: 'SRT', vtt: 'VTT', txt: 'TXT' },
		downloadAs: (format: string) => `Download transcript as ${format}`,
		/** The chat people had in the call, kept only when the call was recorded. */
		chatLinks: 'Links from the chat',
		chatLinksNone: 'Nobody shared a link in the chat.',
		chatLinkBy: (name: string, at: string) => `Shared by ${name} at ${at}`,
		chatDownload: 'Download chat',
		citation: (at: string) => `Play recording from ${at}`,
		disclaimer: 'Written by AI from the transcript. Each point links to what was said.',
		errors: {
			deleteNotReady:
				'You can delete recordings once the call has ended and they’ve finished processing.',
			cannotRecord: 'Only people who can write where this call is can start or stop a recording.',
			unavailable: 'Recording isn’t set up on this deployment.',
			sfuRefused: 'The call service refused to record the audio. Try again.',
			notRecorder: 'Only the person recording this call uploads its video.',
			notFound: 'That recording isn’t part of this call.',
			stopped: 'This recording has stopped.',
			videoStarted: 'This recording’s video is already being uploaded.',
			noVideo: 'This recording has no video.',
			// The cause goes to the console, never to the person.
			failedVideo: 'The video wasn’t saved. The audio and transcript were.',
			failedToggle: 'Couldn’t start or stop the recording. Try again.',
			audioFailed: 'Couldn’t load this recording’s audio. The transcript is still here.'
		}
	}
};
