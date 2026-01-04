#!/bin/bash
set -e

# Claude Slack Hook Installer (macOS Apple Silicon only)
# Usage: curl -fsSL https://raw.githubusercontent.com/neokn/claude-slack-hook/main/install.sh | bash

REPO="neokn/claude-slack-hook"
INSTALL_DIR="$HOME/.claude/hooks/slack-approval"
BIN_DIR="$INSTALL_DIR/dist/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check platform
check_platform() {
    if [ "$(uname -s)" != "Darwin" ]; then
        error "This installer only supports macOS"
    fi

    if [ "$(uname -m)" != "arm64" ]; then
        error "This installer only supports Apple Silicon (M1/M2/M3)"
    fi
}

# Get latest release version
get_latest_version() {
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install
install() {
    check_platform
    info "Platform: macOS Apple Silicon"

    local version
    version=$(get_latest_version)
    if [ -z "$version" ]; then
        error "Failed to get latest version. Check if releases exist at https://github.com/${REPO}/releases"
    fi
    info "Latest version: ${version}"

    info "Creating install directory: ${INSTALL_DIR}"
    mkdir -p "$BIN_DIR"
    mkdir -p "${INSTALL_DIR}/hook"

    # Download binary
    info "Downloading binary..."
    download_url="https://github.com/${REPO}/releases/download/${version}/claude-slack-hook"
    if ! curl -fsSL "$download_url" -o "${BIN_DIR}/claude-slack-hook"; then
        error "Failed to download binary: ${download_url}"
    fi
    chmod +x "${BIN_DIR}/claude-slack-hook"
    info "Binary installed to: ${BIN_DIR}/claude-slack-hook"

    # Download hook script
    info "Downloading hook script..."
    hook_url="https://github.com/${REPO}/releases/download/${version}/approval-hook.sh"
    if ! curl -fsSL "$hook_url" -o "${INSTALL_DIR}/hook/approval-hook.sh"; then
        error "Failed to download hook script: ${hook_url}"
    fi
    chmod +x "${INSTALL_DIR}/hook/approval-hook.sh"
    info "Hook script installed to: ${INSTALL_DIR}/hook/approval-hook.sh"

    echo ""
    info "Installation complete!"
    echo ""
    echo "Next steps:"
    echo "1. Create a Slack App at https://api.slack.com/apps"
    echo "2. Enable Socket Mode and get App-Level Token (xapp-...)"
    echo "3. Add Bot Token Scopes: chat:write"
    echo "4. Install app to workspace and get Bot Token (xoxb-...)"
    echo "5. Get your Slack User ID"
    echo ""
    echo "6. Add to ~/.claude/settings.json:"
    echo ""
    cat << 'EOF'
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/slack-approval/hook/approval-hook.sh --bot-token xoxb-... --app-token xapp-... --user-id U..."
          }
        ]
      }
    ]
  }
}
EOF
}

install
