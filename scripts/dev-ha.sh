#!/bin/bash

# Development helper script for Home Assistant integration
# This script helps set up and manage development with Home Assistant

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
HA_CONFIG_DIR="/config"
DEV_PORT="3000"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --ha-config)
      HA_CONFIG_DIR="$2"
      shift 2
      ;;
    --port)
      DEV_PORT="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --ha-config PATH    Path to Home Assistant config directory (default: /config)"
      echo "  --port PORT         Development server port (default: 3000)"
      echo "  --help              Show this help message"
      echo ""
      echo "Commands:"
      echo "  setup               Set up development environment"
      echo "  iframe-config       Show iframe configuration for development"
      echo "  custom-panel-config Show custom panel configuration"
      echo "  watch               Watch and build custom panel for development"
      exit 0
      ;;
    *)
      COMMAND="$1"
      shift
      ;;
  esac
done

# Functions
setup_dev() {
  echo -e "${GREEN}Setting up development environment...${NC}"
  
  # Check if npm dependencies are installed
  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
  fi
  
  echo -e "${GREEN}Setup complete!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Run 'npm run dev' to start the development server"
  echo "2. Run '$0 iframe-config' to get the Home Assistant configuration"
}

show_iframe_config() {
  echo -e "${YELLOW}Add this to your Home Assistant configuration.yaml:${NC}"
  cat << EOF

# Development panel using iframe
panel_iframe:
  liebe_dev:
    title: "Liebe Dashboard (Dev)"
    url: "http://localhost:${DEV_PORT}"
    icon: mdi:react
    require_admin: false

EOF
  echo -e "${YELLOW}Note:${NC} The hass object won't be available in iframe mode"
}

show_custom_panel_config() {
  echo -e "${YELLOW}For full integration, add this to configuration.yaml:${NC}"
  cat << EOF

# Development custom panel with full hass access
panel_custom:
  - name: liebe-dashboard-dev
    sidebar_title: Liebe Dev
    sidebar_icon: mdi:react
    url_path: liebe-dev
    module_url: /local/liebe-dashboard-dev/custom-panel.js

EOF
}

watch_build() {
  echo -e "${GREEN}Starting watch build for custom panel...${NC}"
  echo "This will rebuild the custom panel on file changes"
  echo ""
  
  # Check if HA config directory exists
  if [ -d "$HA_CONFIG_DIR/www" ]; then
    echo -e "${YELLOW}Tip:${NC} Create a symlink to auto-deploy builds:"
    echo "  ln -s $(pwd)/dist/liebe-dashboard $HA_CONFIG_DIR/www/liebe-dashboard-dev"
    echo ""
  fi
  
  # Start the watch build
  npx vite build --config vite.config.ha.ts --watch
}

# Main command handling
case "$COMMAND" in
  setup)
    setup_dev
    ;;
  iframe-config)
    show_iframe_config
    ;;
  custom-panel-config)
    show_custom_panel_config
    ;;
  watch)
    watch_build
    ;;
  "")
    # No command specified, show help
    echo "Liebe Dashboard - Home Assistant Development Helper"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  setup               Set up development environment"
    echo "  iframe-config       Show iframe configuration for development"
    echo "  custom-panel-config Show custom panel configuration"
    echo "  watch               Watch and build custom panel for development"
    echo ""
    echo "Options:"
    echo "  --ha-config PATH    Path to Home Assistant config directory (default: /config)"
    echo "  --port PORT         Development server port (default: 3000)"
    echo "  --help              Show detailed help"
    echo ""
    echo "Examples:"
    echo "  $0 setup"
    echo "  $0 iframe-config"
    echo "  $0 watch --ha-config /home/homeassistant/.homeassistant"
    ;;
  *)
    echo -e "${RED}Error:${NC} Unknown command '$COMMAND'"
    echo "Run '$0 --help' for usage information"
    exit 1
    ;;
esac