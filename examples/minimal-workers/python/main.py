import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "languages" / "protocol"))
from worker import run_worker

def kernel():
    return {"benchmark": "minimal", "version": 1, "value": 42}

if __name__ == "__main__":
    run_worker(sys.argv[sys.argv.index("--input") + 1], sys.argv[sys.argv.index("--output") + 1], kernel)
