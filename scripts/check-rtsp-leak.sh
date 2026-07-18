#!/usr/bin/env bash
# check-rtsp-leak.sh — CI gate against leaking RTSP secrets into the repo.
#
# Usage:
#   scripts/check-rtsp-leak.sh
#
# Optionally export RTSP_TEST_URL (e.g. loaded from .env.local or a CI
# secret) to additionally scan for the literal personal stream URL.
#
# Fails (exit 1) if any tracked file contains:
#   1. a credentialed RTSP URL (an rtsp/rtsps URL with an embedded
#      user:password "@" credential block), or
#   2. the literal value of $RTSP_TEST_URL, when that variable is non-empty.
#
# Committed files may only ever reference the stream via the env-var
# placeholder `${RTSP_TEST_URL:}` (go2rtc substitution syntax).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

status=0

if matches=$(git grep -nE 'rtsps?://[^ "]*@'); then
  printf '%s\n' "$matches"
  echo 'ERROR: credentialed RTSP URL found in tracked files.' >&2
  status=1
fi

if [ -n "${RTSP_TEST_URL:-}" ]; then
  if matches=$(git grep -nF "$RTSP_TEST_URL"); then
    printf '%s\n' "$matches"
    echo 'ERROR: the RTSP_TEST_URL value appears in tracked files.' >&2
    status=1
  fi
fi

if [ "$status" -eq 0 ]; then
  echo 'check-rtsp-leak: OK (no RTSP secrets in tracked files)'
fi

exit "$status"
