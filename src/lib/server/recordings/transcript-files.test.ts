import { describe, expect, it } from 'vitest';
import { srt, transcriptFile, txt, vtt } from './transcript-files';

const lines = [
	{ startMs: 1_500, endMs: 3_000, speaker: 'Bo', text: 'I will price tents.' },
	{ startMs: 3_661_007, endMs: 3_662_000, speaker: 'Ada', text: 'Fine & <good>\n\n--> done' }
];

describe('transcript files', () => {
	it('writes SRT: numbered cues, comma milliseconds, one line of speech each', () => {
		expect(srt(lines)).toBe(
			[
				'1',
				'00:00:01,500 --> 00:00:03,000',
				'Bo: I will price tents.',
				'',
				'2',
				'01:01:01,007 --> 01:01:02,000',
				'Ada: Fine & <good> --> done',
				''
			].join('\n')
		);
	});

	it('writes VTT: a WEBVTT header, dot milliseconds, and no markup or arrow in the words', () => {
		const file = vtt(lines);
		expect(file).toBe(
			[
				'WEBVTT',
				'',
				'00:00:01.500 --> 00:00:03.000',
				'Bo: I will price tents.',
				'',
				'01:01:01.007 --> 01:01:02.000',
				'Ada: Fine &amp; &lt;good> --&gt; done',
				''
			].join('\n')
		);
		// Each cue holds exactly one arrow, the one between its times.
		expect(file.match(/-->/g)).toHaveLength(2);
	});

	it('writes TXT: the time the line starts, then who and what', () => {
		expect(txt(lines)).toBe(
			'[00:00:01] Bo: I will price tents.\n[01:01:01] Ada: Fine & <good> --> done\n'
		);
	});

	it('writes a valid empty file for a call nobody spoke in', () => {
		expect([srt([]), vtt([]), txt([])]).toEqual(['', 'WEBVTT\n', '']);
	});

	it('names a file type only for srt, vtt and txt, not for what every object inherits', () => {
		expect(transcriptFile('srt')?.mime).toBe('application/x-subrip');
		for (const name of ['pdf', 'toString', 'constructor', '__proto__'])
			expect(transcriptFile(name)).toBeUndefined();
	});
});
