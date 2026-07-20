"""Harness protocol helper for Python implementations (contract 2.0.0)."""

from __future__ import annotations

import hashlib
import json
import sys
from collections.abc import Callable
from typing import Any

PROTOCOL_VERSION = "2.0.0"


def arg(name: str) -> str:
    argv = sys.argv
    for index, value in enumerate(argv):
        if value == name and index + 1 < len(argv):
            return argv[index + 1]
    raise ValueError(f"missing {name}")


def digest_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest_json(value: Any) -> str:
    return digest_bytes(json.dumps(value, separators=(",", ":")).encode("utf-8"))


def emit_line(value: dict[str, Any] | str) -> None:
    line = value if isinstance(value, str) else json.dumps(value, separators=(",", ":"))
    sys.stdout.write(f"{line}\n")
    sys.stdout.flush()


def run_worker(input_path: str, output_path: str, kernel: Callable[[], Any]) -> None:
    if arg("--protocol-version") != PROTOCOL_VERSION:
        raise ValueError(f"unsupported protocol version {arg('--protocol-version')}")

    with open(input_path, encoding="utf-8") as handle:
        handle.read()

    emit_line({"type": "ready", "protocolVersion": PROTOCOL_VERSION})

    last_bytes = b""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        message = json.loads(line)
        if message["type"] == "run":
            last_bytes = json.dumps(kernel(), separators=(",", ":")).encode("utf-8")
            emit_line(
                {
                    "type": "result",
                    "requestId": message["requestId"],
                    "digest": digest_bytes(last_bytes),
                }
            )
        elif message["type"] == "finish":
            with open(output_path, "wb") as handle:
                handle.write(last_bytes)
            emit_line({"type": "finish", "digest": digest_bytes(last_bytes)})
            break
        else:
            raise ValueError(f"unknown protocol message type {message['type']}")
