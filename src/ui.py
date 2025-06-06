"""User interface for the music studio."""

from PySide6.QtWidgets import (
    QWidget, QMainWindow, QVBoxLayout, QHBoxLayout,
    QPushButton, QFileDialog, QListWidget, QListWidgetItem, QSlider
)
from PySide6.QtCore import Qt
from pyqtgraph import PlotWidget
import numpy as np
from .audio_engine import AudioEngine


class MainWindow(QMainWindow):
    """Main window with track list and waveform view."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Music Studio")
        self.engine = AudioEngine()

        # Widgets
        self.track_list = QListWidget()
        self.waveform_plot = PlotWidget()
        self.play_button = QPushButton("Play")
        self.stop_button = QPushButton("Stop")
        self.load_button = QPushButton("Load Audio")
        self.record_button = QPushButton("Record")
        self.stop_record_button = QPushButton("Stop Rec")
        self.volume_slider = QSlider(Qt.Horizontal)
        self.volume_slider.setRange(0, 100)
        self.volume_slider.setValue(100)

        # Layouts
        button_layout = QHBoxLayout()
        button_layout.addWidget(self.load_button)
        button_layout.addWidget(self.record_button)
        button_layout.addWidget(self.stop_record_button)
        button_layout.addWidget(self.play_button)
        button_layout.addWidget(self.stop_button)
        button_layout.addWidget(self.volume_slider)

        left_layout = QVBoxLayout()
        left_layout.addWidget(self.track_list)
        left_layout.addLayout(button_layout)

        main_layout = QHBoxLayout()
        left_widget = QWidget()
        left_widget.setLayout(left_layout)
        main_layout.addWidget(left_widget)
        main_layout.addWidget(self.waveform_plot, 1)

        central_widget = QWidget()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)

        # Signals
        self.load_button.clicked.connect(self.load_audio)
        self.play_button.clicked.connect(self.engine.play)
        self.stop_button.clicked.connect(self.engine.stop)
        self.record_button.clicked.connect(self.start_recording)
        self.stop_record_button.clicked.connect(self.stop_recording)
        self.volume_slider.valueChanged.connect(self.change_volume)

    def load_audio(self) -> None:
        """Load an audio file and display its waveform."""
        file_path, _ = QFileDialog.getOpenFileName(self, "Open Audio", "",
                                                   "Audio Files (*.wav *.flac *.mp3)")
        if not file_path:
            return

        self.engine.load(file_path)
        self.track_list.addItem(QListWidgetItem(file_path))
        data = self.engine.get_waveform()
        if data is not None:
            self.update_waveform(data)

    def start_recording(self) -> None:
        """Start audio recording."""
        self.engine.start_recording()

    def stop_recording(self) -> None:
        """Stop recording and add the result as a new track."""
        data = self.engine.stop_recording()
        if data is not None:
            self.track_list.addItem(QListWidgetItem("Recorded"))
            wf = self.engine.get_waveform()
            if wf is not None:
                self.update_waveform(wf)

    def change_volume(self, value: int) -> None:
        """Update playback volume from slider."""
        self.engine.set_volume(value / 100.0)

    def update_waveform(self, data: np.ndarray) -> None:
        """Display waveform data in the plot widget."""
        self.waveform_plot.clear()
        self.waveform_plot.plot(data)
