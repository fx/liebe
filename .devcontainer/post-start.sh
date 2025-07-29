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

# Configure Claude settings
mkdir -p /home/vscode/.config/claude-code
cat > /home/vscode/.config/claude-code/settings.json << 'EOF'
{
  "automaticallyOpenFileExplorer": true,
  "chatCompletionTimeoutSeconds": 600,
  "commandTimeoutSeconds": 120,
  "defaultCommandTimeout": 120000,
  "mcp": {
    "servers": {}
  }
}
EOF

# Install npm dependencies if package.json exists
if [ -f "package.json" ]; then
  echo "Installing npm dependencies..."
  npm install
fi

# Run custom setup if it exists
if [ -f ".devcontainer/custom-setup.sh" ]; then
  echo "Running custom setup..."
  bash .devcontainer/custom-setup.sh
fi

echo "Post-start script completed successfully"