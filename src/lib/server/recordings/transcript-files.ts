type Line = { startMs: number; endMs: number; speaker: string; text: string };

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `HH:MM:SS<sep>mmm`; SRT separates the milliseconds with a comma, VTT with a dot. */
function stamp(ms: number, separator: ',' | '.') {
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = Math.floor((ms % 60_000) / 1000);
	return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

/** One line of speech: a blank line would end its cue early, so whitespace runs become one space. */
const spoken = (line: Line) => `${line.speaker}: ${line.text.replace(/\s+/g, ' ').trim()}`;

export function srt(lines: Line[]): string {
	return lines
		.map(
			(line, i) =>
				`${i + 1}\n${stamp(line.startMs, ',')} --> ${stamp(line.endMs, ',')}\n${spoken(line)}\n`
		)
		.join('\n');
}

/** VTT reads `&` and `<` as markup, so the words are escaped. */
const markup = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function vtt(lines: Line[]): string {
	const cues = lines.map(
		(line) =>
			`${stamp(line.startMs, '.')} --> ${stamp(line.endMs, '.')}\n${markup(spoken(line)).replace(/-->/g, '--&gt;')}\n`
	);
	return ['WEBVTT\n', ...cues].join('\n');
}

export function txt(lines: Line[]): string {
	return lines
		.map((line) => `[${stamp(line.startMs, '.').slice(0, 8)}] ${spoken(line)}\n`)
		.join('');
}

const files = {
	srt: { mime: 'application/x-subrip', write: srt },
	vtt: { mime: 'text/vtt', write: vtt },
	txt: { mime: 'text/plain', write: txt }
};

/** The file type named by a URL's last segment, or undefined when it names none of srt, vtt, txt. */
export function transcriptFile(format: string) {
	return Object.hasOwn(files, format) ? files[format as keyof typeof files] : undefined;
}
