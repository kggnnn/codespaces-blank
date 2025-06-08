import MidiWriter from 'midi-writer-js';
import type { Note } from '@/types/audio';

export function generateMidiData(notes: Note[], tempo: number = 120): Uint8Array {
  const track = new MidiWriter.Track();
  track.setTempo(tempo);

  // Group notes by instrument (optional, for now all on one instrument)
  // For simplicity, using program 0 (Acoustic Grand Piano)
  track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1 }));


  // Sort notes by start time to process them in order
  const sortedNotes = [...notes].sort((a, b) => a.start - b.start);

  for (const note of sortedNotes) {
    track.addEvent(
      new MidiWriter.NoteEvent({
        pitch: [note.pitch],
        duration: `T${Math.round(note.duration * MidiWriter.constants.TPQN_DEFAULT)}`, // Duration in ticks
        startTick: Math.round(note.start * MidiWriter.constants.TPQN_DEFAULT), // Start time in ticks
        velocity: note.velocity,
      })
    );
  }

  const writer = new MidiWriter.Writer([track]);
  return writer.buildFile();
}

export function downloadMidiFile(midiData: Uint8Array, filename: string = "audionotes_export.mid"): void {
  const blob = new Blob([midiData], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
