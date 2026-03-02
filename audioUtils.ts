// A simple procedural 8-bit synthetic music engine using Web Audio API

let audioCtx: AudioContext | null = null;
let currentGain: GainNode | null = null;
let isMuted = false;
let playInterval: number | null = null;

const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

export const toggleMute = () => {
    isMuted = !isMuted;
    if (isMuted) stopMusic();
    return isMuted;
};

export const setMute = (muted: boolean) => {
    isMuted = muted;
};

export const getMute = () => isMuted;

const playTone = (freq: number, type: OscillatorType, startTime: number, duration: number, vol: number) => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    // Envelope for chiptune punchiness
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(vol, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);

    currentGain = gain; // Store latest gain for immediate kill switch
};

export const stopMusic = () => {
    if (playInterval !== null) {
        window.clearTimeout(playInterval);
        playInterval = null;
    }
    if (currentGain && audioCtx) {
        currentGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
    }
};

type Note = { f: number, d: number };

// Helper to play a sequence looping using timeouts to buffer audio ahead of time
const playSequence = (sequence: Note[], tempoMultiplier: number, type: OscillatorType = 'square', loop: boolean = true) => {
    stopMusic();
    initAudio();
    if (isMuted || !audioCtx) return;

    let noteIdx = 0;
    let nextNoteTime = audioCtx.currentTime + 0.1; // Small buffer
    let isFinished = false;

    const scheduleNotes = () => {
        if (isMuted || !audioCtx || isFinished) return;

        // Schedule next chunk of notes up to 0.5s ahead
        while (nextNoteTime < audioCtx.currentTime + 0.5 && !isFinished) {
            const note = sequence[noteIdx];
            const duration = note.d * tempoMultiplier;

            if (note.f > 0) {
                // Volume at 0.05 so it's background music and doesn't clip
                playTone(note.f, type, nextNoteTime, duration, 0.05);
            }

            nextNoteTime += duration;
            noteIdx++;

            if (noteIdx >= sequence.length) {
                if (loop) {
                    noteIdx = 0;
                } else {
                    isFinished = true;
                }
            }
        }

        if (!isFinished) {
            playInterval = window.setTimeout(scheduleNotes, 100);
        }
    };

    scheduleNotes();
};

// -- Frequencies
// Octave 2 (Bass)
const C2 = 65.41, D2 = 73.42, E2 = 82.41, F2 = 87.31, G2 = 98.00, A2 = 110.00, B2 = 123.47;
// Octave 3 (Mid)
const C3 = 130.81, D3 = 146.83, E3 = 164.81, F3 = 174.61, G3 = 196.00, A3 = 220.00, B3 = 246.94;
// Octave 4 (Melody)
const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392.00, A4 = 440.00, B4 = 493.88;
// Octave 5 (High)
const C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99, A5 = 880.00;
const R = 0; // Rest

export const playMenuMusic = () => {
    const seq: Note[] = [
        { f: C4, d: 0.3 }, { f: E4, d: 0.3 }, { f: G4, d: 0.3 }, { f: C5, d: 0.5 },
        { f: R, d: 0.1 }, { f: G4, d: 0.3 }, { f: E4, d: 0.3 }, { f: C4, d: 0.6 }
    ];
    playSequence(seq, 1.2, 'triangle');
};

export const playGameMusic = () => {
    // 80s Synthwave / Arpeggiator Style (longer, repetitive but driving)
    const baseTempo = 0.15;
    const arpC = [
        { f: C3, d: baseTempo }, { f: C4, d: baseTempo }, { f: G3, d: baseTempo }, { f: C4, d: baseTempo },
        { f: E3, d: baseTempo }, { f: C4, d: baseTempo }, { f: G3, d: baseTempo }, { f: C4, d: baseTempo }
    ];
    const arpA = [
        { f: A2, d: baseTempo }, { f: A3, d: baseTempo }, { f: E3, d: baseTempo }, { f: A3, d: baseTempo },
        { f: C3, d: baseTempo }, { f: A3, d: baseTempo }, { f: E3, d: baseTempo }, { f: A3, d: baseTempo }
    ];
    const arpF = [
        { f: F2, d: baseTempo }, { f: F3, d: baseTempo }, { f: C3, d: baseTempo }, { f: F3, d: baseTempo },
        { f: A2, d: baseTempo }, { f: F3, d: baseTempo }, { f: C3, d: baseTempo }, { f: F3, d: baseTempo }
    ];
    const arpG = [
        { f: G2, d: baseTempo }, { f: G3, d: baseTempo }, { f: D3, d: baseTempo }, { f: G3, d: baseTempo },
        { f: B2, d: baseTempo }, { f: G3, d: baseTempo }, { f: D3, d: baseTempo }, { f: G3, d: baseTempo }
    ];

    // Build the 80s track progression: C -> Am -> F -> G
    let seq: Note[] = [];
    // Play each arpeggio twice to extend the loop
    seq = seq.concat(arpC, arpC, arpA, arpA, arpF, arpF, arpG, arpG);

    // Speed up the tempo multiplier a bit for that driving Outrun / Synthwave feel
    playSequence(seq, 0.85, 'square', true);
};

export const playGameOverMusic = () => {
    // Classic dramatic "die" sound, played ONLY ONCE
    const seq: Note[] = [
        { f: G3, d: 0.2 }, { f: F3, d: 0.2 }, { f: E3, d: 0.3 }, { f: C3, d: 1.2 }
    ];
    playSequence(seq, 1.5, 'sawtooth', false); // loop = false
};
