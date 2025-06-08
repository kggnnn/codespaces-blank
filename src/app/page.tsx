
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AudioControls } from '@/components/AudioControls';
import { PianoRoll } from '@/components/PianoRoll';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from "@/hooks/use-toast";
import type { Note } from '@/types/audio';
import { extractNotesAndKeyFromAudio, type ExtractNotesInput, type ExtractNotesOutput } from '@/ai/flows/extractNotesFromAudio';
import { generateAccompaniment, type AccompanimentInput, type AccompanimentOutput } from '@/ai/flows/generateAccompanimentFlow';
import { generateMidiData, downloadMidiFile } from '@/lib/midiUtils';
import { Textarea } from '@/components/ui/textarea';


function pitchToFrequency(pitch: number): number {
  return 440 * (2 ** ((pitch - 69) / 12));
}

interface ActiveNoteSource {
  osc: OscillatorNode;
  gain: GainNode;
}

const KEY_SIGNATURES = [
  "C Major / A minor", "G Major / E minor", "D Major / B minor", "A Major / F# minor",
  "E Major / C# minor", "B Major / G# minor", "F# Major / D# minor", "C# Major / A# minor",
  "F Major / D minor", "Bb Major / G minor", "Eb Major / C minor", "Ab Major / F minor",
  "Db Major / Bb minor", "Gb Major / Eb minor", "Cb Major / Ab minor"
];

const COMPLEXITY_LEVELS = [
    { value: 'simple', label: 'Simple' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'complex', label: 'Complex' },
];


export default function AudioNotesPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [totalDuration, setTotalDuration] = useState<number>(10); 
  
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playheadPosition, setPlayheadPosition] = useState<number>(0);
  const [loopStart, setLoopStart] = useState<number>(0);
  const [loopEnd, setLoopEnd] = useState<number>(0);
  
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingMessage, setProcessingMessage] = useState<string>("Processing...");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number>(0); 
  const playbackOffsetRef = useRef<number>(0); 
  const activeNoteSourcesRef = useRef<Map<string, ActiveNoteSource>>(new Map());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const { toast } = useToast();

  // Accompaniment customization state
  const [detectedKey, setDetectedKey] = useState<string | null>(null);
  const [accompKeySignature, setAccompKeySignature] = useState<string>(KEY_SIGNATURES[0]);
  const [accompStyle, setAccompStyle] = useState<string>("Complementary piano harmony, focusing on arpeggios and sustained chords.");
  const [accompComplexity, setAccompComplexity] = useState<'simple' | 'moderate' | 'complex'>('moderate');
  const [accompMood, setAccompMood] = useState<string>("Neutral");


  useEffect(() => {
    if (typeof window !== 'undefined' && !audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
        handleStop(); 
        audioContextRef.current?.close();
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const resetState = () => {
    if (isPlaying) handleStop();
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop(); 
    }

    setAudioFile(null);
    setNotes([]);
    setTotalDuration(10);
    setPlayheadPosition(0);
    setLoopStart(0);
    setLoopEnd(0);
    setIsProcessing(false);
    setProcessingMessage("Processing...");
    setLoadingProgress(0);
    setIsRecording(false);
    setDetectedKey(null);
    // Reset accompaniment settings to default
    setAccompKeySignature(KEY_SIGNATURES[0]);
    setAccompStyle("Complementary piano harmony, focusing on arpeggios and sustained chords.");
    setAccompComplexity('moderate');
    setAccompMood("Neutral");


    activeNoteSourcesRef.current.forEach(({ osc, gain }) => {
        try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch (e) {}
    });
    activeNoteSourcesRef.current.clear();

    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];

    toast({ title: "Reset", description: "Application state has been reset." });
  };

  const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileLoad = async (file: File, source: 'original' | 'accompaniment' = 'original') => {
    if (!audioContextRef.current) return;
    if (isPlaying) handleStop();

    setAudioFile(file);
    setIsProcessing(true);
    if (source === 'original') { 
        setNotes([]); 
        setDetectedKey(null); 
    }
    setPlayheadPosition(0); 
    setProcessingMessage("Preparing audio...");
    setLoadingProgress(10);

    try {
      const audioDataUri = await fileToDataUri(file);
      setProcessingMessage("Transcribing audio to notes...");
      setLoadingProgress(30);

      toast({ title: "Processing Audio", description: "Extracting notes and detecting key, please wait... This may take a moment." });
      const extractionInput: ExtractNotesInput = { audioDataUri, fileName: file.name };
      const { notes: extractedNotesData, duration: audioDuration, detectedKey: newDetectedKey } = await extractNotesAndKeyFromAudio(extractionInput);
      
      setLoadingProgress(80);
      const newNotes: Note[] = extractedNotesData.map(n => ({ ...n, source: 'original' as const }));
      
      setNotes(prevNotes => source === 'original' ? newNotes : [...prevNotes.filter(n => n.source !== 'accompaniment'), ...newNotes].sort((a, b) => a.start - b.start) );

      const allNotes = source === 'original' ? newNotes : [...notes.filter(n => n.source !== 'accompaniment'), ...newNotes];
      const newTotalDuration = Math.max(audioDuration, allNotes.length > 0 ? Math.max(...allNotes.map(n => n.start + n.duration)) : 0, 10);
      setTotalDuration(newTotalDuration);
      
      if (source === 'original') { 
        setLoopStart(0);
        setLoopEnd(newTotalDuration);
      } else if (loopEnd < newTotalDuration) { 
        setLoopEnd(newTotalDuration);
      }

      if (newDetectedKey) {
        setDetectedKey(newDetectedKey);
        const matchingKey = KEY_SIGNATURES.find(k => k.toLowerCase().includes(newDetectedKey.toLowerCase().split(' ')[0]));
        if (matchingKey) {
            setAccompKeySignature(matchingKey);
        }
        toast({ title: "Audio Processed", description: `${file.name} notes extracted. Detected key: ${newDetectedKey}.` });
      } else {
        setDetectedKey(null);
        toast({ title: "Audio Processed", description: `${file.name} notes extracted. Key not detected.` });
      }
      
      setPlayheadPosition(0);
      setLoadingProgress(100);
    } catch (error) {
      console.error("Error loading/processing audio file:", error);
      toast({ title: "Error", description: `Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}. Ensure the audio contains clear pitched sounds.`, variant: "destructive" });
      if (source === 'original') resetState(); 
    } finally {
      setIsProcessing(false);
      setLoadingProgress(0);
      setProcessingMessage("Processing...");
    }
  };

  const handleStartRecording = async () => {
    if (isRecording || !audioContextRef.current) return;
    
    resetState(); 
    setIsProcessing(true); 
    setProcessingMessage("Initializing microphone...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const options = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        delete (options as any).mimeType; 
      }
      mediaRecorderRef.current = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
  
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
  
      mediaRecorderRef.current.onstop = async () => {
        setIsRecording(false); 
        setProcessingMessage("Processing recorded audio...");
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
        const recordedFile = new File([audioBlob], `recorded_audio_${Date.now()}.${audioBlob.type.split('/')[1] || 'webm'}`, { type: audioBlob.type });
        
        if (mediaStreamRef.current) { 
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
        }
        await handleFileLoad(recordedFile, 'original'); 
      };
  
      mediaRecorderRef.current.start();
      setIsRecording(true); 
      setIsProcessing(false); 
      setProcessingMessage("Recording...");
      toast({ title: "Recording Started", description: "Recording audio from your microphone." });
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({ title: "Recording Error", description: "Could not start recording. Check microphone permissions.", variant: "destructive" });
      setIsProcessing(false); 
      setIsRecording(false); 
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
      }
    }
  };
  
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      setIsRecording(false); 
      mediaRecorderRef.current.stop(); 
    }
  };

  const handleStop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    const audioCtx = audioContextRef.current;
    if (audioCtx) {
        const now = audioCtx.currentTime;
        activeNoteSourcesRef.current.forEach(({ osc, gain }) => {
            try {
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(gain.gain.value, now); 
                gain.gain.linearRampToValueAtTime(0.0001, now + 0.05); 
                osc.stop(now + 0.06); 
            } catch (e) {
                try { osc.stop(now); osc.disconnect(); gain.disconnect(); } catch (e2) {}
            }
        });
    } else { 
        activeNoteSourcesRef.current.forEach(({ osc, gain }) => {
            try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch (e) {}
        });
    }
    activeNoteSourcesRef.current.clear();
    setIsPlaying(false);
  }, []); 

  const updatePlayhead = useCallback(() => {
    if (!isPlaying || !audioContextRef.current) {
      animationFrameRef.current = null;
      return;
    }
    const audioCtx = audioContextRef.current;
    const contextTime = audioCtx.currentTime;
    let currentPlaybackTime = (contextTime - playbackStartTimeRef.current) + playbackOffsetRef.current;
    
    if (loopEnd > loopStart && totalDuration > 0) {
        const loopDuration = loopEnd - loopStart;
        if (loopDuration > 0 && currentPlaybackTime >= loopEnd) {
           const timeIntoNextLoop = (currentPlaybackTime - loopStart) % loopDuration;
           playbackOffsetRef.current = loopStart; 
           playbackStartTimeRef.current = contextTime - timeIntoNextLoop; 
           currentPlaybackTime = loopStart + timeIntoNextLoop;
        }
        currentPlaybackTime = Math.max(loopStart, Math.min(currentPlaybackTime, loopEnd));
    } else if (totalDuration > 0 && currentPlaybackTime >= totalDuration) {
        handleStop();
        setPlayheadPosition(totalDuration);
        return; 
    } else if (totalDuration === 0) {
        currentPlaybackTime = 0;
    }
    
    setPlayheadPosition(currentPlaybackTime);
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      animationFrameRef.current = null;
    }
  }, [isPlaying, loopStart, loopEnd, totalDuration, handleStop]);


  const handlePlay = () => {
    if (!audioContextRef.current || notes.length === 0 || isPlaying || isRecording) return;
    const audioCtx = audioContextRef.current;
    setIsPlaying(true);

    activeNoteSourcesRef.current.forEach(({ osc, gain }) => { // Clear any previous notes
        try { osc.stop(); osc.disconnect(); gain.disconnect(); } catch (e) {}
    });
    activeNoteSourcesRef.current.clear();
    
    const systemStartContextTime = audioCtx.currentTime;
    let playFromSongTime = playheadPosition;

    if (loopEnd > loopStart && (playheadPosition < loopStart || playheadPosition >= loopEnd)) {
        playFromSongTime = loopStart;
    }
    setPlayheadPosition(playFromSongTime); 

    playbackOffsetRef.current = playFromSongTime;
    playbackStartTimeRef.current = systemStartContextTime; 

    notes.forEach((note, index) => {
        const noteStartInSongTime = note.start;
        const noteEndInSongTime = note.start + note.duration;
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = 'triangle'; 
        osc.frequency.setValueAtTime(pitchToFrequency(note.pitch), audioCtx.currentTime);

        const attackTime = 0.05; 
        const decayTime = 0.15;   
        const sustainLevelRatio = 0.7; 
        const releaseTime = 0.3;  

        const peakGain = Math.max(0.0001, Math.min(1, note.velocity / 127));
        const sustainGain = peakGain * sustainLevelRatio;
        
        const now = audioCtx.currentTime; // This 'now' is effectively systemStartContextTime for scheduling
        const scheduledNoteStart = systemStartContextTime + Math.max(0, noteStartInSongTime - playFromSongTime);
        const scheduledNoteEndForRelease = systemStartContextTime + Math.max(0, noteEndInSongTime - playFromSongTime);

        if (scheduledNoteEndForRelease + releaseTime <= now) return; // Skip notes entirely in the past

        gainNode.gain.setValueAtTime(0, Math.max(now, scheduledNoteStart - 0.001));
        gainNode.gain.linearRampToValueAtTime(peakGain, Math.max(now, scheduledNoteStart) + attackTime);
        gainNode.gain.linearRampToValueAtTime(sustainGain, Math.max(now, scheduledNoteStart) + attackTime + decayTime);
        gainNode.gain.setValueAtTime(sustainGain, Math.max(now, scheduledNoteEndForRelease));
        gainNode.gain.linearRampToValueAtTime(0.0001, Math.max(now, scheduledNoteEndForRelease) + releaseTime);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        const uniqueKey = `note-${index}-${note.start}-${note.pitch}`;
        
        osc.start(Math.max(now, scheduledNoteStart));
        osc.stop(Math.max(now, scheduledNoteEndForRelease) + releaseTime + 0.01); // Stop after release
        
        activeNoteSourcesRef.current.set(uniqueKey, { osc, gain: gainNode });
        osc.onended = () => {
            activeNoteSourcesRef.current.delete(uniqueKey);
            try { osc.disconnect(); gainNode.disconnect(); } catch (e) {}
        };
    });

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    toast({ title: "MIDI Playback Started" });
  };

  const handleLoopChange = (start: number, end: number) => {
    const newLoopStart = Math.max(0, Math.min(start, totalDuration));
    const newLoopEnd = Math.max(newLoopStart, Math.min(end, totalDuration)); 
    setLoopStart(newLoopStart);
    setLoopEnd(newLoopEnd);

    if (isPlaying) { 
        const currentPlayhead = playheadPosition; 
        handleStop(); 
        setTimeout(() => {
            const adjustedPlayhead = Math.max(newLoopStart, Math.min(currentPlayhead, newLoopEnd));
            setPlayheadPosition(adjustedPlayhead); 
            handlePlay(); 
        }, 50);
    }
  };
  
  const handleScrub = (time: number) => {
    const newPosition = Math.max(0, Math.min(time, totalDuration));
    setPlayheadPosition(newPosition); 
    if (isPlaying) { 
        handleStop(); 
        setTimeout(() => handlePlay(), 50); 
    }
  };

  const handleExportMidi = () => {
    if (notes.length === 0) {
      toast({ title: "Export MIDI", description: "No notes to export.", variant: "destructive" });
      return;
    }
    try {
      const midiData = generateMidiData(notes);
      downloadMidiFile(midiData, audioFile ? `${audioFile.name.split('.')[0]}.mid` : 'audionotes_export.mid');
      toast({ title: "Export MIDI", description: "MIDI file download started." });
    } catch (error) {
      console.error("Error exporting MIDI:", error);
      toast({ title: "Export Error", description: "Could not generate MIDI file.", variant: "destructive" });
    }
  };

  const handleGenerateAccompaniment = async () => {
    const originalNotes = notes.filter(n => n.source === 'original');
    if (originalNotes.length === 0 || isProcessing || isPlaying || isRecording) {
      toast({ title: "Cannot Generate Accompaniment", description: "Load/record audio with original notes, and ensure no other operations are active.", variant: "destructive" });
      return;
    }
  
    setIsProcessing(true);
    setProcessingMessage("Generating AI accompaniment...");
    setLoadingProgress(30);
    toast({ title: "Generating Accompaniment", description: "AI is crafting accompanying notes based on your settings..." });
  
    try {
      const accompanimentInput: AccompanimentInput = { 
        melodyNotes: originalNotes, 
        customKeySignature: accompKeySignature,
        customStyle: accompStyle,
        customComplexity: accompComplexity,
        customMood: accompMood,
      };
      setLoadingProgress(60);
      const result: AccompanimentOutput = await generateAccompaniment(accompanimentInput);
      setLoadingProgress(90);
      
      if (result && result.accompanimentNotes && result.accompanimentNotes.length > 0) {
        const newAccompanimentNotes: Note[] = result.accompanimentNotes.map(n => ({ ...n, source: 'accompaniment' as const }));
        
        const combinedNotes = [...originalNotes, ...newAccompanimentNotes].sort((a,b) => a.start - b.start);
        setNotes(combinedNotes);
  
        const newTotalDuration = Math.max(
          totalDuration, 
          result.accompanimentNotes.length > 0 ? Math.max(...result.accompanimentNotes.map(n => n.start + n.duration)) : 0,
          originalNotes.length > 0 ? Math.max(...originalNotes.map(n => n.start + n.duration)) : 0
        );
        setTotalDuration(newTotalDuration);
        if (loopEnd < newTotalDuration && loopEnd !== 0) { 
          setLoopEnd(newTotalDuration);
        } else if (loopEnd === 0 && newTotalDuration > 0) { 
           setLoopEnd(newTotalDuration);
        }
  
        toast({ title: "Accompaniment Generated!", description: `${result.accompanimentNotes.length} new accompaniment notes added.` });
      } else {
        toast({ title: "No Accompaniment Generated", description: "The AI didn't return any accompaniment notes this time. Try different settings or a clearer melody." });
      }
    } catch (error) {
      console.error("Error generating accompaniment:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: "Accompaniment Error", description: `Failed to generate accompaniment: ${errorMessage}`, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setProcessingMessage("Processing...");
      setLoadingProgress(0);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 md:p-8 selection:bg-accent selection:text-accent-foreground">
      <main className="container mx-auto w-full max-w-5xl space-y-6">
        <header className="text-center">
          <h1 className="font-headline text-4xl sm:text-5xl font-bold tracking-tight text-primary">
            AudioNotes
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Convert or record audio into editable MIDI. Generate AI-powered accompaniments.
          </p>
        </header>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="font-headline text-2xl">Controls</CardTitle>
            <CardDescription>Load audio, record, control playback, and export.</CardDescription>
          </CardHeader>
          <CardContent>
            <AudioControls
              onFileLoad={(file) => handleFileLoad(file, 'original')}
              onPlay={handlePlay}
              onStop={handleStop}
              onExportMidi={handleExportMidi}
              onReset={resetState}
              onRecordStart={handleStartRecording}
              onRecordStop={handleStopRecording}
              isPlaying={isPlaying}
              isAudioLoaded={!!audioFile} 
              isProcessing={isProcessing}
              isRecording={isRecording}
              hasNotes={notes.length > 0}
            />
            {(isProcessing || isRecording) && (
              <div className="mt-4">
                <Label htmlFor="loading-progress" className="text-sm text-muted-foreground">
                  {processingMessage}
                </Label>
                {(isProcessing && !isRecording) && <Progress id="loading-progress" value={loadingProgress} className="w-full mt-1" />}
                {isRecording && <Progress id="recording-progress" value={undefined} className="w-full mt-1 animate-pulse" />}
              </div>
            )}
          </CardContent>
        </Card>

        {notes.filter(n => n.source === 'original').length > 0 && (
          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">AI Accompaniment Settings</CardTitle>
              <CardDescription>Customize the AI-generated accompaniment for your melody.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="accomp-key">Key Signature</Label>
                   {detectedKey && <p className="text-xs text-muted-foreground mb-1">Detected key: {detectedKey}</p>}
                  <Select value={accompKeySignature} onValueChange={setAccompKeySignature} disabled={isProcessing || isPlaying || isRecording}>
                    <SelectTrigger id="accomp-key">
                      <SelectValue placeholder="Select key signature" />
                    </SelectTrigger>
                    <SelectContent>
                      {KEY_SIGNATURES.map(key => (
                        <SelectItem key={key} value={key}>{key}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="accomp-complexity">Complexity</Label>
                  <Select value={accompComplexity} onValueChange={(v) => setAccompComplexity(v as 'simple'|'moderate'|'complex')} disabled={isProcessing || isPlaying || isRecording}>
                    <SelectTrigger id="accomp-complexity">
                      <SelectValue placeholder="Select complexity" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPLEXITY_LEVELS.map(level => (
                        <SelectItem key={level.value} value={level.value}>{level.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="accomp-style">Style & Instrumentation (Describe your desired accompaniment)</Label>
                <p className="text-xs text-muted-foreground mb-1">
                  e.g., "Smooth jazz piano chords and a walking bassline", "Energetic synth arpeggios, pads, and a simple rock drum beat", "Generate a simple piano chord progression under the melody", "A cello counter-melody".
                </p>
                <Textarea
                  id="accomp-style"
                  value={accompStyle}
                  onChange={(e) => setAccompStyle(e.target.value)}
                  placeholder="Describe the style, instrumentation, and elements like drums, chord progressions, or submelodies."
                  rows={3}
                  disabled={isProcessing || isPlaying || isRecording}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="accomp-mood">Mood</Label>
                <Input
                  id="accomp-mood"
                  value={accompMood}
                  onChange={(e) => setAccompMood(e.target.value)}
                  placeholder="e.g., 'Upbeat', 'Melancholic', 'Peaceful', 'Dramatic'"
                  disabled={isProcessing || isPlaying || isRecording}
                  className="mt-1"
                />
              </div>
              <Button 
                onClick={handleGenerateAccompaniment} 
                disabled={notes.filter(n => n.source === 'original').length === 0 || isProcessing || isPlaying || isRecording}
                className="w-full md:w-auto mt-2"
              >
                Generate Accompaniment
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-xl">
            <CardHeader>
                <CardTitle className="font-headline text-2xl">Piano Roll Editor</CardTitle>
                <CardDescription>
                    Visualize notes. Click & drag for loop selection. Shift+Click to scrub playhead.
                    {detectedKey && <span className="block mt-1">Detected Musical Key: <span className="font-semibold text-primary">{detectedKey}</span></span>}
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <PianoRoll
                    notes={notes}
                    playheadPosition={playheadPosition}
                    loopStart={loopStart}
                    loopEnd={loopEnd}
                    totalDuration={totalDuration}
                    onLoopChange={handleLoopChange}
                    onScrub={handleScrub}
                    height={350}
                />
                <div className="mt-2 text-sm text-muted-foreground">
                    <span>Loop: {loopStart.toFixed(2)}s - {loopEnd.toFixed(2)}s</span>
                    <span className="mx-2">|</span>
                    <span>Playhead: {playheadPosition.toFixed(2)}s</span>
                    <span className="mx-2">|</span>
                    <span>Total Duration: {totalDuration.toFixed(2)}s</span>
                </div>
            </CardContent>
        </Card>
        
        <footer className="text-center mt-12 py-6 border-t">
            <p className="text-sm text-muted-foreground">
                AudioNotes App &copy; {new Date().getFullYear()}.
            </p>
        </footer>
      </main>
    </div>
  );
}

