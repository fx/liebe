#!/bin/bash
set -e

# Log script execution for debugging
echo "Running post-start script: $(date)" >> /tmp/post-start.log
exec > >(tee -a /tmp/post-start.log)
exec 2>&1

bash .devcontainer/post-start.sh