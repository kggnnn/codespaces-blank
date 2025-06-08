
'use server';
/**
 * @fileOverview Extracts musical notes and detects the key from an audio file using an AI model.
 *
 * - extractNotesAndKeyFromAudio - A function that processes an audio file.
 * - ExtractNotesInput - The input type (audio data URI and optional filename).
 * - ExtractNotesOutput - The output type (notes, duration, detected key).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Define the schema for a single musical note, consistent with other parts of the app
const NoteSchema = z.object({
  pitch: z.number().int().min(0).max(127).describe('MIDI note number (0-127)'),
  start: z.number().min(0).describe('Start time in seconds from the beginning of the audio'),
  duration: z.number().min(0).describe('Duration in seconds (should be > 0 for a valid note)'),
  velocity: z.number().int().min(1).max(127).describe('MIDI velocity (1-127, loudness)'),
  source: z.enum(['original', 'accompaniment']).optional().default('original').describe('Source of the note'),
});
export type Note = z.infer<typeof NoteSchema>;

const ExtractNotesInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "The audio file content as a data URI. Must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  fileName: z.string().optional().describe('Optional original filename of the audio.'),
});
export type ExtractNotesInput = z.infer<typeof ExtractNotesInputSchema>;

const ExtractNotesOutputSchema = z.object({
  notes: z.array(NoteSchema).describe('An array of musical notes extracted from the audio.'),
  duration: z.number().min(0).describe('The total duration of the audio in seconds.'),
  detectedKey: z.string().optional().describe('The musical key detected from the audio (e.g., "C Major", "A minor", "F# Dorian"). Returns undefined if no clear key is detected.'),
});
export type ExtractNotesOutput = z.infer<typeof ExtractNotesOutputSchema>;

export async function extractNotesAndKeyFromAudio(input: ExtractNotesInput): Promise<ExtractNotesOutput> {
  return extractNotesFlow(input);
}

const extractionPrompt = ai.definePrompt({
  name: 'extractNotesAndKeyPrompt',
  input: { schema: ExtractNotesInputSchema },
  output: { schema: ExtractNotesOutputSchema },
  prompt: `You are an expert music transcription AI. Your task is to analyze the provided audio file and perform the following:
1.  Transcribe all audible musical notes into a structured format. Each note should include:
    *   'pitch': The MIDI note number (0-127).
    *   'start': The start time of the note in seconds from the beginning of the audio.
    *   'duration': The duration of the note in seconds. This must be a positive value.
    *   'velocity': The MIDI velocity (loudness, 1-127).
    *   'source': Set this to 'original'.
2.  Determine the total 'duration' of the audio file in seconds.
3.  Analyze the harmonic content of the audio and determine its primary musical 'detectedKey' (e.g., "C Major", "A minor", "G Mixolydian"). If the key is ambiguous or not clearly defined, you may omit the 'detectedKey' field or set it to a value like "Undetermined".

The audio file is: {{media url=audioDataUri}}
{{#if fileName}}Original filename (for context, if helpful): {{{fileName}}}{{/if}}

Provide the output as a single JSON object matching the specified output schema. Ensure all timings are accurate. Focus on the most prominent melodic and harmonic content. If the audio is purely percussive with no discernible pitched notes, the 'notes' array can be empty, but still provide the 'duration'.
`,
});

const extractNotesFlow = ai.defineFlow(
  {
    name: 'extractNotesFlow',
    inputSchema: ExtractNotesInputSchema,
    outputSchema: ExtractNotesOutputSchema,
  },
  async (input: ExtractNotesInput) => {
    // Configure safety settings to be less restrictive for potentially abstract audio content,
    // though music transcription is generally safe.
    const { output } = await extractionPrompt(input, {
        config: {
            safetySettings: [
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            ],
        }
    });

    if (!output) {
      console.warn("Audio transcription returned no output. Returning empty values.");
      return { notes: [], duration: 0, detectedKey: undefined };
    }
    
    // Ensure notes have positive duration and valid velocity
    const validNotes = output.notes
        .filter(n => n.duration > 0 && n.velocity > 0 && n.velocity <= 127 && n.pitch >=0 && n.pitch <= 127)
        .map(n => ({...n, source: 'original' as const }));


    return {
      notes: validNotes,
      duration: output.duration > 0 ? output.duration : 0,
      detectedKey: output.detectedKey && output.detectedKey.trim() !== "" && output.detectedKey.toLowerCase() !== "undetermined" ? output.detectedKey : undefined,
    };
  }
);
