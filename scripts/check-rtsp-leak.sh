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

# Report FILENAMES ONLY (-l): printing matching line contents would leak the
# very secret this gate exists to protect into CI logs.
#
# git grep exits 0 on matches, 1 on no matches, and >1 on ERROR. An error must
# fail the gate too — treating it as "no match" would let a broken scan pass.
files=$(git grep -lE 'rtsps?://[^ "]*@') && grep_status=0 || grep_status=$?
if [ "$grep_status" -eq 0 ]; then
  printf '%s\n' "$files"
  echo 'ERROR: credentialed RTSP URL found in tracked files.' >&2
  status=1
elif [ "$grep_status" -ne 1 ]; then
  echo "ERROR: git grep failed (exit $grep_status) while scanning for credentialed RTSP URLs." >&2
  status=1
fi

if [ -n "${RTSP_TEST_URL:-}" ]; then
  files=$(git grep -lF "$RTSP_TEST_URL") && grep_status=0 || grep_status=$?
  if [ "$grep_status" -eq 0 ]; then
    printf '%s\n' "$files"
    echo 'ERROR: the RTSP_TEST_URL value appears in tracked files.' >&2
    status=1
  elif [ "$grep_status" -ne 1 ]; then
    echo "ERROR: git grep failed (exit $grep_status) while scanning for the RTSP_TEST_URL value." >&2
    status=1
  fi
fi

if [ "$status" -eq 0 ]; then
  echo 'check-rtsp-leak: OK (no RTSP secrets in tracked files)'
fi

exit "$status"
