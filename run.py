#!/usr/bin/env python3
import sys
from pathlib import Path

# Ensure src/ and phases/ are in the Python path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root / "src"))

from virasya_ai.cli import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
