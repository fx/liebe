#!/bin/bash
set -e

# Liebe-specific customizations
# Install additional system packages needed for the project
sudo apt update && sudo apt install -y \
  dirmngr \
  gh \
  xdg-utils

echo "Liebe custom setup completed"