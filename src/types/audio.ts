
export interface Note {
  pitch: number; // MIDI note number (0-127)
  start: number; // Start time in seconds
  duration: number; // Duration in seconds
  velocity: number; // MIDI velocity (0-127)
  source?: 'original' | 'accompaniment'; // To distinguish note origins
}
