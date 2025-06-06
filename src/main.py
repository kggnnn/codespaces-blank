"""Entry point for the desktop music studio application."""

from PySide6.QtWidgets import QApplication
from .ui import MainWindow
import sys


def main() -> None:
    """Run the application."""
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
