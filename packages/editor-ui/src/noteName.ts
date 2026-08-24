const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * MIDI note number to a name, in the octave numbering Live shows (60 = C3).
 * Live's own preference can display C4 instead; this follows the default
 * rather than trying to detect something a file does not record.
 */
export function noteName(note: number): string {
  return `${NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 2}`;
}
