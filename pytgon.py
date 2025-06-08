import sys, os, tempfile, numpy as np, aubio, pretty_midi, pygame.midi
from PyQt6.QtWidgets import *
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QPainter, QColor, QPen
from music21 import stream, note as m21note, key as m21key, chord as m21chord
import sounddevice as sd

class Note:
    def __init__(self, pitch, start, end, role='melody'):
        self.pitch, self.start, self.end, self.role = pitch, start, end, role

class PianoRoll(QWidget):
    COLORS = {
        'melody': QColor(0, 200, 255, 180),
        'chord': QColor(0, 100, 255, 150),
        'bass': QColor(180, 0, 180, 160),
        'harmony': QColor(255, 80, 200, 160)
    }

    def __init__(self):
        super().__init__()
        self.notes, self.playhead_time, self.duration = [], 0, 1

    def set_notes(self, notes, duration):
        self.notes, self.duration = notes, duration
        self.update()

    def paintEvent(self, e):
        p = QPainter(self)
        p.fillRect(self.rect(), QColor(30, 30, 30))
        p.setPen(QPen(QColor(224, 224, 224), 1)) # Apply --border color for grid
        w, h = self.width(), self.height() # Redundant assignment, width and height are used below
        for n in self.notes:
            x = int(n.start / self.duration * w)
            width = int((n.end - n.start) / self.duration * w)
            y = h - int(((n.pitch - 36) / (90 - 36)) * h)
            p.setBrush(self.COLORS.get(n.role, QColor(255, 255, 255, 150)))
            p.setPen(Qt.PenStyle.NoPen)
            p.drawRect(x, y, max(2, width), 8)
        # Draw grid lines
        for i in range(36, 91, 12): # Major C scale lines
            y_line = h - int(((i - 36) / (90 - 36)) * h)
            p.drawLine(0, y_line, w, y_line)
        px = int(self.playhead_time / self.duration * w)
        # Style playhead
        p.setPen(QPen(QColor(255, 0, 0), 2))
        p.drawLine(px, 0, px, h)

class HummingStudioPro(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Humming Studio Pro MAX")
        self.resize(1000, 600)
        self.notes, self.duration, self.sr = [], 1, 44100
        self.audio, self.playing, self.current_time = None, False, 0
        self.key_signature = None
        self.include_chords = True
        self.include_bass = True
        self.include_harmony = True
        self.init_ui()
        pygame.midi.init()
        self.player = pygame.midi.Output(0)
        self.timer = QTimer()
        self.timer.timeout.connect(self.advance_playhead)

    def init_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        layout = QVBoxLayout(central)

        # Apply background color to the main window
        self.setStyleSheet("QMainWindow { background-color: #F0F8FF; }")
        
        # Piano Roll Styling
        self.piano = PianoRoll()
        self.piano.setStyleSheet("background-color: #87CEEB;") # Apply primary color to PianoRoll
        layout.addWidget(self.piano)
        self.status_label = QLabel("Ready.")
        # Apply --foreground color to status label
        self.status_label.setStyleSheet("color: #383244;")
        layout.addWidget(self.status_label)
        layout.setSpacing(15) # Adjust spacing between main elements

        # accompaniment options
        options = QHBoxLayout()
        self.chord_cb = QCheckBox("Chords")
        self.chord_cb.setChecked(True)
        self.chord_cb.stateChanged.connect(lambda x: setattr(self, 'include_chords', x == Qt.CheckState.Checked))
        self.bass_cb = QCheckBox("Bass")
        self.bass_cb.setChecked(True)
        self.bass_cb.stateChanged.connect(lambda x: setattr(self, 'include_bass', x == Qt.CheckState.Checked))
        self.harmony_cb = QCheckBox("Harmony")
        self.harmony_cb.setChecked(True)
        self.harmony_cb.stateChanged.connect(lambda x: setattr(self, 'include_harmony', x == Qt.CheckState.Checked))
        for cb in (self.chord_cb, self.bass_cb, self.harmony_cb):
            # Apply --muted-foreground color to checkbox text
            cb.setStyleSheet("QCheckBox { color: #6e667a; }")
            options.addWidget(cb)
        layout.addLayout(options)
        options.setSpacing(10) # Adjust spacing between checkboxes

        btns = QHBoxLayout()
        btns.setSpacing(10) # Adjust spacing between buttons
        for name, func in [
            ("Load Audio", self.load_audio),
            ("Record", self.record_audio),
            ("Play MIDI", self.play_midi),
            ("Export MIDI", self.export_midi)]:
            b = QPushButton(name)
            b.clicked.connect(func)
            b.setStyleSheet("background-color: #FFB347; color: white; padding: 8px 16px; border-radius: 4px; QPushButton:hover { background-color: #FFC76F; }")
            btns.addWidget(b)
        layout.addLayout(btns)

    def load_audio(self):
        f, _ = QFileDialog.getOpenFileName(self, "Load", "", "*.wav *.mp3")
        if f:
            import soundfile as sf
            self.audio, self.sr = sf.read(f)
            if self.audio.ndim > 1:
                self.audio = self.audio.mean(axis=1)
            self.audio = self.audio.astype(np.float32)
            self.status_label.setText(f"Loaded {os.path.basename(f)}")
            self.process_audio()

    def record_audio(self):
        self.status_label.setText("Recording 5s...")
        self.audio = sd.rec(int(5 * self.sr), samplerate=self.sr, channels=1, dtype='float32')
        sd.wait()
        self.audio = self.audio.flatten()
        self.status_label.setText("Recorded.")
        self.process_audio()

    def process_audio(self):
        pitch_o = aubio.pitch("yin", 2048, 512, self.sr)
        pitch_o.set_unit("midi")
        pitch_o.set_silence(-40)
        hop_size = 512
        notes, durations = [], []
        last_pitch, start_time = None, 0
        for i in range(0, len(self.audio), hop_size):
            frame = self.audio[i:i+hop_size] # {{ change slice size to hop_size (512)}}
            if len(frame) < hop_size:
                break
            frame = np.array(frame, dtype=np.float32)
            pitch = pitch_o(frame)[0]
            confidence = pitch_o.get_confidence()
            t = i / self.sr
            if confidence > 0.8 and 36 <= pitch <= 90:
                if int(pitch) != last_pitch:
                    if last_pitch is not None:
                        notes.append(Note(last_pitch, start_time, t))
                    start_time = t
                    last_pitch = int(pitch)
            else:
                if last_pitch is not None:
                    notes.append(Note(last_pitch, start_time, t))
                    last_pitch = None
        self.notes = self.quantize(notes)
        self.duration = self.notes[-1].end if self.notes else 1
        self.key_signature = self.detect_key(self.notes)
        self.status_label.setText(f"Detected {len(self.notes)} notes. Key: {self.key_signature}")
        self.piano.set_notes(self.notes, self.duration)

    def quantize(self, notes):
        step = 0.125
        return [Note(n.pitch, round(n.start / step) * step, round(n.end / step) * step, n.role) for n in notes]

    def detect_key(self, notes):
        s = stream.Stream()
        for n in notes:
            s.append(m21note.Note(n.pitch))
        return s.analyze("key")

    def generate_accompaniment(self):
        chords, bass, harmony = [], [], []
        for n in self.notes:
            root = m21note.Note(n.pitch).name
            if self.include_chords:
                triad = m21chord.Chord([root, root + "3", root + "5"])
                triad.closedPosition(forceOctave=4, inPlace=True)
                for p in triad.pitches:
                    chords.append(Note(p.midi, n.start, n.end, 'chord'))
            if self.include_bass:
                bass.append(Note(n.pitch - 24, n.start, n.start + 0.3, 'bass'))
            if self.include_harmony:
                harmony.append(Note(n.pitch + 12, n.start, n.end, 'harmony'))
        return chords + bass + harmony

    def play_midi(self):
        if not self.notes: return
        all_notes = self.notes + self.generate_accompaniment()
        self.piano.set_notes(all_notes, self.duration)
        self.play_sequence(all_notes)

    def play_sequence(self, notes):
        self.current_time, self.playing = 0, True
        self.timer.start(30)
        for n in notes:
            self.player.note_on(n.pitch, 100)
            pygame.time.wait(int((n.end - n.start) * 1000))
            self.player.note_off(n.pitch, 100)
        self.timer.stop()
        self.playing = False

    def advance_playhead(self):
        self.current_time += 0.03
        self.piano.playhead_time = self.current_time
        self.piano.update()

    def export_midi(self):
        if not self.notes: return
        midi = pretty_midi.PrettyMIDI()
        instruments = {
            'melody': pretty_midi.Instrument(program=0),
            'chord': pretty_midi.Instrument(program=0),
            'bass': pretty_midi.Instrument(program=32),
            'harmony': pretty_midi.Instrument(program=48)
        }
        all_notes = self.notes + self.generate_accompaniment()
        for n in all_notes:
            instruments[n.role].notes.append(pretty_midi.Note(100, n.pitch, n.start, n.end))
        for inst in instruments.values():
            midi.instruments.append(inst)
        path, _ = QFileDialog.getSaveFileName(self, "Save", "", "*.mid")
        if path:
            midi.write(path)
            self.status_label.setText(f"Saved MIDI to {os.path.basename(path)}")

app = QApplication(sys.argv)
win = HummingStudioPro()
win.show()
app.exec()