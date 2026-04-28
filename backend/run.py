"""Convenience launcher for the FastAPI app.

Usage (from the backend directory):

    python run.py

Or directly with uvicorn:

    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.environ.get("FAIRAUDIT_HOST", "127.0.0.1")
    port = int(os.environ.get("FAIRAUDIT_PORT", "8000"))
    reload = os.environ.get("FAIRAUDIT_RELOAD", "1") == "1"
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    main()
