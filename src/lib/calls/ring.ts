// The incoming-call tone: two short soft beeps, made with WebAudio so there's no sound file.
// A browser that hasn't had a click or key press on this site yet keeps the audio context
// suspended, and the ring is silent until it has; the on-screen ring still shows.

let context: AudioContext | null = null;

export function playRing(): void {
	context ??= new AudioContext();
	const start = context.currentTime;
	for (const offset of [0, 0.25]) {
		const tone = context.createOscillator();
		const volume = context.createGain();
		tone.frequency.value = 660;
		volume.gain.setValueAtTime(0, start + offset);
		volume.gain.linearRampToValueAtTime(0.15, start + offset + 0.02);
		volume.gain.linearRampToValueAtTime(0, start + offset + 0.18);
		tone.connect(volume).connect(context.destination);
		tone.start(start + offset);
		tone.stop(start + offset + 0.2);
	}
}
