
"use client";

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import type { Note } from '@/types/audio';

interface PianoRollProps {
  notes: Note[];
  playheadPosition: number; 
  loopStart: number; 
  loopEnd: number; 
  totalDuration: number; 
  onLoopChange: (start: number, end: number) => void;
  onScrub: (time: number) => void;
  height?: number;
}

const MIN_PITCH = 21; // A0
const MAX_PITCH = 108; // C8
const NUM_PITCHES_DISPLAYED = MAX_PITCH - MIN_PITCH + 1;

function getDynamicNoteColor(baseHsl: string, velocity: number, isAccompaniment: boolean = false): string {
  const velocityFactor = Math.max(0.3, Math.min(1, velocity / 127)); 
  const [h, s, lInitial] = baseHsl.match(/\d+/g)!.map(Number);
  
  let l = lInitial;
  let alpha = 0.9; // Base alpha for dark theme notes

  // In dark theme, we want notes to be vibrant.
  // We can adjust lightness slightly based on velocity, but mostly rely on saturation and base lightness.
  if (isAccompaniment) {
    l = Math.max(40, Math.min(75, lInitial - 5 + velocityFactor * 15)); // Accompaniment notes slightly less emphasis
    alpha = 0.85 + velocityFactor * 0.1;
  } else {
    l = Math.max(45, Math.min(80, lInitial + velocityFactor * 10)); // Original notes a bit more prominent
    alpha = 0.9 + velocityFactor * 0.1;
  }
  return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}


export function PianoRoll({
  notes,
  playheadPosition,
  loopStart,
  loopEnd,
  totalDuration,
  onLoopChange,
  onScrub,
  height = 350,
}: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDraggingLoop, setIsDraggingLoop] = useState(false);
  const [dragStartTime, setDragStartTime] = useState(0);
  
  const [currentThemeColors, setCurrentThemeColors] = useState({
    background: '222 40% 12%', // Default dark
    originalNoteBase: '255 75% 65%', // Default primary for dark theme (purple/blue)
    accompanimentNoteBase: '30 80% 60%', // Default chart-3 for dark theme (orange)
    playheadColor: 'hsl(0, 70% 50%)', // Destructive red
    loopRegionColor: 'hsla(255, 75%, 65%, 0.15)', // Primary dark, semi-transparent
    gridColor: 'hsl(222, 30%, 30%)', // Border color for dark
    gridHighlightColor: 'hsl(222, 30%, 40%)', // Muted for C notes, slightly lighter for dark
    noteBorderColor: 'hsla(0, 0%, 10%, 0.5)', // Darker subtle border for notes on dark bg
    pianoKeyBlack: 'hsl(222, 30%, 18%)', // Darker gray for black keys
    pianoKeyWhite: 'hsl(222, 40%, 12%)', // Main background for white keys
  });

  useEffect(() => {
    const updateColorsFromCSS = () => {
      if (typeof window !== 'undefined') {
        const rootStyle = getComputedStyle(document.documentElement);
        const isDark = document.documentElement.classList.contains('dark');
        
        setCurrentThemeColors({
          background: rootStyle.getPropertyValue('--background').trim(),
          originalNoteBase: rootStyle.getPropertyValue('--primary').trim(),
          accompanimentNoteBase: rootStyle.getPropertyValue('--chart-3').trim(),
          playheadColor: `hsl(${rootStyle.getPropertyValue('--destructive').trim()})`,
          loopRegionColor: `hsla(${rootStyle.getPropertyValue('--primary').trim()}, ${isDark ? '0.2' : '0.15'})`,
          gridColor: `hsl(${rootStyle.getPropertyValue('--border').trim()})`,
          gridHighlightColor: `hsl(${rootStyle.getPropertyValue('--muted').trim()})`,
          noteBorderColor: isDark ? 'hsla(0, 0%, 85%, 0.15)' : 'hsla(0, 0%, 20%, 0.3)',
          pianoKeyBlack: isDark ? `hsl(${rootStyle.getPropertyValue('--background').trim().split(' ')[0]}, ${rootStyle.getPropertyValue('--background').trim().split(' ')[1]}, ${parseFloat(rootStyle.getPropertyValue('--background').trim().split(' ')[2]) + 6}%)` : `hsl(${rootStyle.getPropertyValue('--background').trim().split(' ')[0]}, ${rootStyle.getPropertyValue('--background').trim().split(' ')[1]}, ${parseFloat(rootStyle.getPropertyValue('--background').trim().split(' ')[2]) - 6}%)`,
          pianoKeyWhite: rootStyle.getPropertyValue('--background').trim(),
        });
      }
    };
    updateColorsFromCSS();
    
    const observer = new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                updateColorsFromCSS();
            }
        }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();

  }, []);

  const pitchToY = useCallback((pitch: number): number => {
    const clampedPitch = Math.max(MIN_PITCH, Math.min(pitch, MAX_PITCH));
    return height - ((clampedPitch - MIN_PITCH) / NUM_PITCHES_DISPLAYED) * height;
  }, [height]);

  const timeToX = useCallback((time: number, canvasWidth: number): number => {
    if (totalDuration === 0) return 0;
    return (time / totalDuration) * canvasWidth;
  }, [totalDuration]);

  const xToTime = useCallback((x: number, canvasWidth: number): number => {
    if (canvasWidth === 0) return 0;
    return (x / canvasWidth) * totalDuration;
  }, [totalDuration]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr; 
    ctx.scale(dpr, dpr);
    const canvasWidth = rect.width;
    const noteRowHeight = height / NUM_PITCHES_DISPLAYED;

    ctx.fillStyle = `hsl(${currentThemeColors.background})`;
    ctx.fillRect(0, 0, canvasWidth, height);

    const PITCH_CLASS_IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false]; 
    
    ctx.lineWidth = 1;
    for (let pitch = MIN_PITCH; pitch <= MAX_PITCH; pitch++) {
        const yPos = pitchToY(pitch) - noteRowHeight; 
        const isBlackKey = PITCH_CLASS_IS_BLACK[(pitch % 12)];
        
        ctx.fillStyle = isBlackKey ? currentThemeColors.pianoKeyBlack : currentThemeColors.pianoKeyWhite;
        ctx.fillRect(0, yPos, canvasWidth, noteRowHeight);

        ctx.strokeStyle = (pitch % 12 === 0) ? currentThemeColors.gridHighlightColor : currentThemeColors.gridColor; 
        ctx.beginPath();
        ctx.moveTo(0, yPos + noteRowHeight); 
        ctx.lineTo(canvasWidth, yPos + noteRowHeight);
        ctx.stroke();
    }
    const timeStep = 1; 
    ctx.strokeStyle = currentThemeColors.gridColor;
    ctx.lineWidth = 0.5;
    for (let t = 0; t <= totalDuration; t += timeStep) {
        const xPos = timeToX(t, canvasWidth);
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, height);
        ctx.stroke();
    }

    const noteVisualHeight = noteRowHeight * 0.85; 
    for (const note of notes) {
      if (note.pitch < MIN_PITCH || note.pitch > MAX_PITCH) continue; 

      const xPos = timeToX(note.start, canvasWidth);
      const w = Math.max(2, timeToX(note.duration, canvasWidth)); // Using timeToX for duration too
      const yPos = pitchToY(note.pitch) - noteVisualHeight - (noteRowHeight * 0.075) ; 

      const isAccompaniment = note.source === 'accompaniment';
      const baseHslColor = isAccompaniment ? currentThemeColors.accompanimentNoteBase : currentThemeColors.originalNoteBase;
      ctx.fillStyle = getDynamicNoteColor(baseHslColor, note.velocity, isAccompaniment);
      
      ctx.beginPath();
      const radius = 3;
      ctx.moveTo(xPos + radius, yPos);
      ctx.lineTo(xPos + w - radius, yPos);
      ctx.quadraticCurveTo(xPos + w, yPos, xPos + w, yPos + radius);
      ctx.lineTo(xPos + w, yPos + noteVisualHeight - radius);
      ctx.quadraticCurveTo(xPos + w, yPos + noteVisualHeight, xPos + w - radius, yPos + noteVisualHeight);
      ctx.lineTo(xPos + radius, yPos + noteVisualHeight);
      ctx.quadraticCurveTo(xPos, yPos + noteVisualHeight, xPos, yPos + noteVisualHeight - radius);
      ctx.lineTo(xPos, yPos + radius);
      ctx.quadraticCurveTo(xPos, yPos, xPos + radius, yPos);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = currentThemeColors.noteBorderColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (loopEnd > loopStart) {
      const loopX1 = timeToX(loopStart, canvasWidth);
      const loopX2 = timeToX(loopEnd, canvasWidth);
      ctx.fillStyle = currentThemeColors.loopRegionColor;
      ctx.fillRect(loopX1, 0, loopX2 - loopX1, height);
      
      const loopHandleH = currentThemeColors.playheadColor.match(/hsl\((\d+)/)?.[1] || '0';
      const loopHandleS = currentThemeColors.playheadColor.match(/,\s*([\d.]+)%/)?.[1] || '70';
      const loopHandleL = currentThemeColors.playheadColor.match(/,\s*([\d.]+)%\)/)?.[1] || '50';

      ctx.fillStyle = `hsla(${loopHandleH}, ${loopHandleS}%, ${parseFloat(loopHandleL) + 10}%, 0.7)`;
      ctx.fillRect(loopX1 - 2, 0, 4, height);
      ctx.fillRect(loopX2 - 2, 0, 4, height);
    }

    const playheadX = timeToX(playheadPosition, canvasWidth);
    ctx.strokeStyle = currentThemeColors.playheadColor;
    ctx.lineWidth = 2.5; 
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, height);
    ctx.stroke();

  }, [notes, playheadPosition, loopStart, loopEnd, totalDuration, height, currentThemeColors, pitchToY, timeToX]);


  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = xToTime(x, rect.width);
    
    if (event.shiftKey) { 
        onScrub(time);
    } else { 
        setIsDraggingLoop(true);
        setDragStartTime(time);
        onLoopChange(time, time); 
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingLoop) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const currentTime = xToTime(x, rect.width);

    onLoopChange(Math.min(dragStartTime, currentTime), Math.max(dragStartTime, currentTime));
  };

  const handleMouseUp = () => {
    setIsDraggingLoop(false);
  };
  
  const handleMouseLeave = () => {
    setIsDraggingLoop(false); 
  };


  return (
    <div className="w-full bg-card p-1 sm:p-2 rounded-lg shadow-md overflow-hidden" style={{ touchAction: 'pan-y' }}>
      <canvas
        ref={canvasRef}
        className="w-full cursor-grab active:cursor-grabbing rounded"
        style={{ height: `${height}px`, minWidth: '100%' }} 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        data-ai-hint="music notes visualization dark"
      />
    </div>
  );
}
