
"use client";

import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, StopCircle, Download, RotateCcw, Mic, Square } from 'lucide-react'; // Removed Wand2

interface AudioControlsProps {
  onFileLoad: (file: File) => void;
  onPlay: () => void;
  onStop: () => void;
  onExportMidi: () => void;
  onReset: () => void;
  onRecordStart: () => void;
  onRecordStop: () => void;
  // onGenerateAccompaniment is now handled by a dedicated section in page.tsx
  isPlaying: boolean;
  isAudioLoaded: boolean; 
  isProcessing: boolean;
  isRecording: boolean;
  hasNotes: boolean;
}

export function AudioControls({
  onFileLoad,
  onPlay,
  onStop,
  onExportMidi,
  onReset,
  onRecordStart,
  onRecordStop,
  isPlaying,
  isAudioLoaded,
  isProcessing,
  isRecording,
  hasNotes,
}: AudioControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileLoad(file);
    }
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-card rounded-lg shadow">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".wav,.mp3,.ogg,.aac,.flac,.m4a" // Broader audio format support
        className="hidden"
        disabled={isProcessing || isRecording || isPlaying}
      />
      <div className="flex flex-wrap gap-3">
        <Button onClick={triggerFileInput} disabled={isProcessing || isPlaying || isRecording} variant="outline">
          {isProcessing && !isRecording ? "Processing..." : "Load Audio"}
        </Button>
        {!isRecording ? (
          <Button onClick={onRecordStart} disabled={isProcessing || isPlaying } variant="outline">
            <Mic className="mr-2 h-5 w-5" />
            Record
          </Button>
        ) : (
          <Button onClick={onRecordStop} disabled={!isRecording} variant="destructive">
            <Square className="mr-2 h-5 w-5" />
            Stop Rec
          </Button>
        )}
        <Button onClick={onPlay} disabled={!hasNotes || isPlaying || isProcessing || isRecording} variant="outline">
          <Play className="mr-2 h-5 w-5" />
          Play
        </Button>
        <Button onClick={onStop} disabled={!isPlaying} variant="outline">
          <StopCircle className="mr-2 h-5 w-5" />
          Stop
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onExportMidi} disabled={!hasNotes || isProcessing || isPlaying || isRecording} variant="outline">
          <Download className="mr-2 h-5 w-5" />
          Export MIDI
        </Button>
        {/* AI Accompaniment button is moved to page.tsx for better layout with customization options */}
        <Button onClick={onReset} disabled={isProcessing || isPlaying || isRecording} variant="destructive">
          <RotateCcw className="mr-2 h-5 w-5" />
          Reset
        </Button>
      </div>
    </div>
  );
}
