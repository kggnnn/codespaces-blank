
'use server';
/**
 * @fileOverview Generates an accompaniment melody based on an existing set of musical notes,
 * with options for customization.
 *
 * - generateAccompaniment - A function that creates an accompaniment.
 * - AccompanimentInput - The input type (melody, key, style, complexity, mood).
 * - AccompanimentOutput - The output type (array of new notes for accompaniment).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const NoteSchema = z.object({
  pitch: z.number().int().min(0).max(127).describe('MIDI note number (0-127)'),
  start: z.number().min(0).describe('Start time in seconds from the beginning of the piece'),
  duration: z.number().min(0).describe('Duration in seconds (should be > 0 for a valid note)'),
  velocity: z.number().int().min(1).max(127).describe('MIDI velocity (1-127, loudness)'),
  source: z.enum(['original', 'accompaniment']).optional().default('original').describe('Source of the note'),
});
export type Note = z.infer<typeof NoteSchema>;


const AccompanimentInputSchema = z.object({
  melodyNotes: z.array(NoteSchema).describe('An array of notes representing the main melody to accompany. These are the notes already present.'),
  customKeySignature: z.string().optional().describe("The desired musical key for the accompaniment (e.g., 'C Major', 'A minor', 'G Mixolydian'). If provided, guide the harmony towards this key. If omitted, AI will infer or choose a complementary key."),
  customStyle: z.string().optional().describe("A textual description for the desired style and instrumentation of the accompaniment. Users can request elements like drum patterns, chord progressions, basslines, pads, or counter-melodies here (e.g., 'upbeat jazz bassline with walking patterns and light ride cymbal', 'gentle flowing piano arpeggios and string pads', 'minimalist synth pads with a slow kick drum', 'driving rock drums and power chords with a high synth counter-melody'). Be specific for better results. Defaults to a complementary piano harmony."),
  customComplexity: z.enum(['simple', 'moderate', 'complex']).optional().default('moderate').describe("Desired complexity of the accompaniment. 'simple' for basic harmony/rhythm, 'moderate' for more developed musical ideas, 'complex' for intricate parts with more variation."),
  customMood: z.string().optional().describe("Desired mood for the accompaniment (e.g., 'happy', 'somber', 'energetic', 'peaceful', 'introspective', 'dramatic'). This will influence melodic contours, harmonic choices, and rhythmic feel. Defaults to a mood that complements the melody."),
});
export type AccompanimentInput = z.infer<typeof AccompanimentInputSchema>;


const AccompanimentOutputSchema = z.object({
  accompanimentNotes: z.array(NoteSchema).describe('An array of new notes forming the accompaniment. Each note in this array MUST have its "source" field set to "accompaniment". These notes should complement the original melodyNotes and reflect the specified customizations. If drum patterns are generated, they should use standard General MIDI drum map pitches (e.g., Kick on C1/pitch 36, Snare on D1/pitch 38) and be represented as Note objects.'),
});
export type AccompanimentOutput = z.infer<typeof AccompanimentOutputSchema>;

function formatNotesToString(notes: Note[]): string {
  if (!notes || notes.length === 0) return "No melody notes provided.";
  return notes
    .map(n => `(Pitch: ${n.pitch}, Start: ${n.start.toFixed(2)}s, Duration: ${n.duration.toFixed(2)}s, Velocity: ${n.velocity})`)
    .join('; ');
}

export async function generateAccompaniment(input: AccompanimentInput): Promise<AccompanimentOutput> {
  return generateAccompanimentFlow(input);
}

const accompanimentPrompt = ai.definePrompt({
  name: 'generateCustomAccompanimentPrompt',
  input: { schema: AccompanimentInputSchema.extend({ melodyNotesString: z.string() }) }, 
  output: { schema: AccompanimentOutputSchema },
  prompt: `You are an expert musical AI specializing in creating harmonically and rhythmically interesting accompaniment parts for a given melody, tailored to user specifications.

The user has provided a main melody as a sequence of musical notes:
{{{melodyNotesString}}}

The user has also provided the following preferences for the accompaniment:
{{#if customStyle}}
- Desired Style/Instrumentation: "{{{customStyle}}}" (This can include requests for specific instruments, drum patterns, chord progressions, basslines, pads, or counter-melodies. If generating drum patterns, please use standard General MIDI drum map pitches for the notes, e.g., Kick on C1/pitch 36, Snare on D1/pitch 38, Closed Hi-Hat on F#1/pitch 42. Represent all generated parts as Note objects.)
{{else}}
- Desired Style/Instrumentation: "A complementary general-purpose piano harmony."
{{/if}}
{{#if customKeySignature}}
- Target Key Signature: "{{{customKeySignature}}}" (Harmonize in or around this key if musically appropriate for the melody.)
{{/if}}
{{#if customComplexity}}
- Complexity Level: "{{{customComplexity}}}" (Adjust rhythmic and harmonic density accordingly.)
{{/if}}
{{#if customMood}}
- Desired Mood: "{{{customMood}}}" (Infuse the accompaniment with this emotional quality.)
{{/if}}

Your task is to generate a *new* set of musical notes that forms a musically coherent and pleasing accompaniment.
Key considerations:
1.  **Harmony:** Compatible with the main melody and guided by \\\`customKeySignature\\\` if provided.
2.  **Rhythm:** Complementary, reflecting the \\\`customComplexity\\\` and \\\`customMood\\\`. Also consider rhythmic elements like drum beats if requested in \\\`customStyle\\\`.
3.  **Style & Mood:** Strictly adhere to \\\`customStyle\\\` (including instrumentation like drums, specific melodic lines, chords, etc.) and \\\`customMood\\\`.
4.  **Chords:** If "chords" or "chord progression" are requested in \\\`customStyle\\\`, generate them as multiple notes sounding simultaneously. Each note within a chord should share the same 'start' time and often the same 'duration'. Chords should generally align with the rhythm and key points of the main melody. For example, a C Major chord (root, major third, perfect fifth) would be represented by three Note objects (e.g., pitches C4, E4, G4) all starting at the same time.
5.  **Non-overlapping:** Primarily generate notes that do not directly overlap in pitch and time with the main melody, unless creating intentional close harmony or doubling.
6.  **Output Format:** You MUST output *only* the new accompaniment notes. Each note object must have "pitch", "start", "duration" (which must be positive), "velocity", and "source" (which MUST be "accompaniment"). All musical elements, including drums or chords, must be represented as an array of these Note objects.

Generate the accompaniment notes now.
`,
});

const generateAccompanimentFlow = ai.defineFlow(
  {
    name: 'generateAccompanimentFlow',
    inputSchema: AccompanimentInputSchema,
    outputSchema: AccompanimentOutputSchema,
  },
  async (input: AccompanimentInput) => {
    const formattedMelodyString = formatNotesToString(input.melodyNotes);
    
    const promptInput = {
      melodyNotes: input.melodyNotes, 
      melodyNotesString: formattedMelodyString,
      customKeySignature: input.customKeySignature,
      customStyle: input.customStyle || "A complementary piano harmony suitable for a general audience.",
      customComplexity: input.customComplexity,
      customMood: input.customMood,
    };

    const { output } = await accompanimentPrompt(promptInput);
    
    if (!output || !output.accompanimentNotes) {
      console.warn("Accompaniment generation returned no notes or an invalid structure.");
      return { accompanimentNotes: [] };
    }
    
    const validNotes = output.accompanimentNotes
      .filter(note => note.duration > 0 && note.pitch >= 0 && note.pitch <= 127 && note.velocity > 0 && note.velocity <= 127)
      .map(note => ({ ...note, source: 'accompaniment' as const })); 

    return { accompanimentNotes: validNotes };
  }
);

