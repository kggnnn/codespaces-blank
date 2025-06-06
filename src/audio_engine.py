"""Simple audio playback engine."""

import numpy as np
import sounddevice as sd
import soundfile as sf


class AudioEngine:
    """Manages audio playback and recording."""

    def __init__(self) -> None:
        self.data: np.ndarray | None = None
        self.samplerate: int = 44100
        self.stream: sd.OutputStream | None = None
        self.record_stream: sd.InputStream | None = None
        self.record_buffer: list[np.ndarray] = []
        self.volume: float = 1.0

    def load(self, file_path: str) -> None:
        """Load an audio file."""
        self.data, self.samplerate = sf.read(file_path, dtype='float32')

    def play(self) -> None:
        """Play the loaded audio."""
        if self.data is None:
            return
        if self.stream is not None:
            self.stop()
        # Apply volume on playback
        data = self.data * self.volume
        self.stream = sd.OutputStream(
            samplerate=self.samplerate,
            channels=data.shape[1] if data.ndim > 1 else 1,
        )
        self.stream.start()
        sd.play(data, self.samplerate)

    def stop(self) -> None:
        """Stop playback."""
        sd.stop()
        if self.stream is not None:
            self.stream.close()
            self.stream = None

    def set_volume(self, volume: float) -> None:
        """Set playback volume (0.0 - 1.0)."""
        self.volume = max(0.0, min(volume, 1.0))

    # Recording ------------------------------------------------------------
    def start_recording(self) -> None:
        """Begin recording from the default input device."""
        if self.record_stream is not None:
            self.stop_recording()
        self.record_buffer = []
        self.record_stream = sd.InputStream(
            samplerate=self.samplerate,
            channels=1,
            callback=self._record_callback,
        )
        self.record_stream.start()

    def _record_callback(self, indata: np.ndarray, frames: int, time, status) -> None:
        """Collect recorded blocks."""
        self.record_buffer.append(indata.copy())

    def stop_recording(self) -> np.ndarray | None:
        """Stop recording and return the captured data."""
        if self.record_stream is None:
            return None
        self.record_stream.stop()
        self.record_stream.close()
        self.record_stream = None
        if not self.record_buffer:
            return None
        data = np.concatenate(self.record_buffer, axis=0)
        self.record_buffer = []
        self.data = data
        return data

    def get_waveform(self) -> np.ndarray | None:
        """Return the waveform data for plotting."""
        if self.data is None:
            return None
        max_samples = 10000
        step = max(1, len(self.data) // max_samples)
        return self.data[::step]
