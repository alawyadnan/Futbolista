"""Compatibility entry point: generate web icons from the shared SVG, not a second drawing."""
from pathlib import Path
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
node = os.environ.get("FUTBOLISTA_NODE") or shutil.which("node")
if not node:
    raise SystemExit("Node.js is required. Install native dependencies, then run native: pnpm icons.")
subprocess.run([node, str(ROOT / "native/scripts/icons.mjs"), "--web-only"], check=True)
