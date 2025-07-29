#!/bin/bash
set -e

# Trust the workspace folder
mise trust

# Install tools via mise
echo "Installing tools via mise..."
mise install -y

# Install Claude Code globally
echo "Installing Claude Code..."
npm install -g @anthropic-ai/claude-code

# Install npm dependencies if package.json exists
if [ -f "package.json" ]; then
  echo "Installing npm dependencies..."
  npm install
fi

echo "Post-start script completed successfully"