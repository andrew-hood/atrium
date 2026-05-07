#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

HOOK_URL = "http://127.0.0.1:21517/hook"
TIMEOUT_SECONDS = 2
CODEX_TITLE_PROMPT_PREFIX = (
    "You are a helpful assistant. You will be presented with a user prompt, "
    "and your job is to provide a short title for a task"
)


def read_payload():
    try:
        raw = sys.stdin.read()
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


def resolve_tty():
    ssh_tty = os.environ.get("SSH_TTY")
    if ssh_tty:
        return ssh_tty
    for fd in (2, 1, 0):
        try:
            if os.isatty(fd):
                return os.ttyname(fd)
        except OSError:
            continue
    try:
        ppid = os.getppid()
        result = subprocess.run(
            ["ps", "-p", str(ppid), "-o", "tty="],
            capture_output=True, text=True, timeout=2,
        )
        tty_name = result.stdout.strip()
        if tty_name and tty_name != "??":
            return "/dev/" + tty_name
    except Exception:
        pass
    return None


def is_generated_title_prompt(value):
    if not isinstance(value, str):
        return False
    return " ".join(value.split()).startswith(CODEX_TITLE_PROMPT_PREFIX)


def main():
    data = read_payload()
    event = os.environ.get("ATRIUM_EVENT") or data.get("event") or data.get("hook_event_name") or "Unknown"
    payload = {
        "event": event,
        "provider": os.environ.get("ATRIUM_PROVIDER") or data.get("provider"),
        "sessionId": data.get("session_id") or data.get("sessionId") or os.environ.get("CLAUDE_SESSION_ID", ""),
        "sessionName": data.get("session_name") or data.get("sessionName") or data.get("aiTitle") or data.get("title"),
        "transcriptPath": data.get("transcript_path") or data.get("transcriptPath"),
        "model": data.get("model"),
        "pid": os.getppid(),
        "tty": resolve_tty(),
        "cwd": data.get("cwd") or os.getcwd(),
        "tool": data.get("tool_name") or data.get("tool"),
        "toolInput": data.get("tool_input") or data.get("toolInput"),
        "toolUseId": data.get("tool_use_id") or data.get("toolUseId"),
        "prompt": data.get("prompt") or data.get("user_prompt"),
        "response": data.get("response") or data.get("assistant_response") or data.get("assistantResponse"),
        "status": data.get("status"),
        "raw": data,
    }

    if not payload["sessionId"]:
        return

    if payload["provider"] == "codex" and (
        event == "SessionStart" or is_generated_title_prompt(payload.get("prompt"))
    ):
        return

    try:
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            HOOK_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS).close()
    except (urllib.error.URLError, TimeoutError, OSError, Exception):
        pass


if __name__ == "__main__":
    main()
