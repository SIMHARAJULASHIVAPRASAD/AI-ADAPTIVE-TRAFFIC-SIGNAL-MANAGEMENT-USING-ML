#!/usr/bin/env python3
"""Zero-dependency local server for the Adaptive Traffic Control demo."""
from __future__ import annotations

import json
import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from ml.signal_optimizer import recommend_signals

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("ATC_HOST", "127.0.0.1")
PORT = int(os.environ.get("ATC_PORT", "8080"))


def _param(params, key: str, default):
    values = params.get(key)
    if not values:
        return default
    return values[0]


def _as_bool(raw_value: str, default: bool = False) -> bool:
    if raw_value is None:
        return default
    return str(raw_value).strip().lower() in {"1", "true", "yes", "on"}


class Handler(BaseHTTPRequestHandler):
    server_version = "AdaptiveTrafficControl/1.0"

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            body = json.dumps({"status": "ok", "service": "adaptive-traffic-control"}).encode()
            self._send(200, body, "application/json")
            return

        if path == "/api/recommend":
            params = parse_qs(urlparse(self.path).query)
            try:
                north = int(_param(params, "north", "12"))
                south = int(_param(params, "south", "8"))
                east = int(_param(params, "east", "18"))
                west = int(_param(params, "west", "5"))
            except ValueError:
                north, south, east, west = 12, 8, 18, 5

            sample = {
                "time_of_day": _param(params, "time_of_day", "mid"),
                "weather": _param(params, "weather", "rainy"),
                "directions": {
                    "North": {"vehicles": north, "emergency": _as_bool(_param(params, "north_emergency", "false"), False)},
                    "South": {"vehicles": south, "emergency": _as_bool(_param(params, "south_emergency", "false"), False)},
                    "East": {"vehicles": east, "emergency": _as_bool(_param(params, "east_emergency", "false"), False)},
                    "West": {"vehicles": west, "emergency": _as_bool(_param(params, "west_emergency", "false"), False)},
                },
            }
            result = recommend_signals(sample)
            body = json.dumps(result).encode()
            self._send(200, body, "application/json")
            return

        file_path = ROOT / ("index.html" if path in ("", "/") else path.lstrip("/"))
        if file_path.is_file() and ROOT in file_path.parents:
            mime, _ = mimetypes.guess_type(file_path.name)
            body = file_path.read_bytes()
            self._send(200, body, mime or "application/octet-stream")
            return

        self._send(404, b"Not found", "text/plain; charset=utf-8")

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    print(f"Adaptive Traffic Control running at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
