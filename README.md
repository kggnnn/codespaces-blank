# Desktop Music Studio Application Skeleton

This repository contains a minimal skeleton of a desktop music studio application.
The implementation uses Python with [PySide6](https://doc.qt.io/qtforpython/) for the graphical user interface and `sounddevice` for audio playback and recording. It also uses `pyqtgraph` to display waveforms.

## Installation

1. Ensure Python 3.8+ is installed.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

## Development

Run the application in development mode with:

```bash
python -m src.main
```

## Building for Distribution

Use tools such as `PyInstaller` or `cx_Freeze` to package the application. Example:

```bash
pip install pyinstaller
pyinstaller --name MusicStudio --onefile src/main.py
```

This creates a standalone executable in the `dist/` directory.

## Architecture Overview

The application is structured into several modules:

- `ui.py` – defines the main window and user interface elements.
- `audio_engine.py` – contains the audio playback and recording logic.
- `main.py` – entry point that wires everything together.

UI components communicate with the audio engine through method calls. The audio engine manages playback timing, recording, and buffer handling using `sounddevice`, ensuring stable low-latency audio. The main window includes controls for loading files, playing back audio, recording from the microphone, and adjusting volume.

### Features

- Load audio files and display their waveforms.
- Record new audio from the system microphone.
- Adjust playback volume using the slider in the main window.

