#!/bin/bash

sudo apt update && sudo apt install -y \
  dirmngr gh xdg-utils

npm install -g @anthropic-ai/claude-code

# Install project dependencies if package.json exists
if [ -f "package.json" ]; then
  npm install
fi
