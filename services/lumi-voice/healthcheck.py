"""Authenticated local health probe; never print credentials or response bodies."""
from __future__ import annotations

import http.client
import json
import os
from typing import Mapping


def healthy(environment: Mapping[str, str] | None = None) -> bool:
    settings = os.environ if environment is None else environment
    token = settings.get("QWEN_TTS_API_TOKEN", "")
    if len(token) < 32 or any(char.isspace() for char in token):
        return False
    try:
        port = int(settings.get("QWEN_TTS_PORT", "8766"))
        if not 1 <= port <= 65535:
            return False
    except (TypeError, ValueError):
        return False
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=4)
    try:
        connection.request("GET", "/health", headers={"Authorization": "Bearer " + token})
        response = connection.getresponse()
        if response.status != 200:
            return False
        body = response.read(4097)
        if len(body) > 4096:
            return False
        data = json.loads(body)
        return isinstance(data, dict) and data.get("status") == "ready" and data.get("model") == "qwen3-tts" and data.get("voice") == "lumi"
    except (OSError, ValueError, http.client.HTTPException):
        return False
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(0 if healthy() else 1)
