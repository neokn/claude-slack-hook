#!/bin/bash
set -e

# Claude Slack Hook Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/neokn/claude-slack-hook/main/install.sh | bash

REPO="neokn/claude-slack-hook"  # TODO: Update with your GitHub username
INSTALL_DIR="$HOME/.claude/hooks/slack-approval"
BIN_DIR="$INSTALL_DIR/dist/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Detect platform
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Darwin) os="darwin" ;;
        Linux)  os="linux" ;;
        *)      error "Unsupported OS: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)   arch="x64" ;;
        arm64|aarch64)  arch="arm64" ;;
        *)              error "Unsupported architecture: $(uname -m)" ;;
    esac

    echo "${os}-${arch}"
}

# Get latest release version
get_latest_version() {
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install
install() {
    local platform version download_url binary_name

    platform=$(detect_platform)
    info "Detected platform: ${platform}"

    version=$(get_latest_version)
    if [ -z "$version" ]; then
        error "Failed to get latest version. Check if releases exist at https://github.com/${REPO}/releases"
    fi
    info "Latest version: ${version}"

    binary_name="claude-slack-hook-${platform}"
    download_url="https://github.com/${REPO}/releases/download/${version}/${binary_name}"

    info "Creating install directory: ${INSTALL_DIR}"
    mkdir -p "$BIN_DIR"

    info "Downloading ${binary_name}..."
    if ! curl -fsSL "$download_url" -o "${BIN_DIR}/claude-slack-hook"; then
        error "Failed to download binary. Check if release exists: ${download_url}"
    fi

    chmod +x "${BIN_DIR}/claude-slack-hook"
    info "Binary installed to: ${BIN_DIR}/claude-slack-hook"

    # Download hook script
    info "Downloading hook script..."
    hook_url="https://github.com/${REPO}/releases/download/${version}/approval-hook.sh"
    mkdir -p "${INSTALL_DIR}/hook"
    if ! curl -fsSL "$hook_url" -o "${INSTALL_DIR}/hook/approval-hook.sh"; then
        warn "Could not download hook script, you may need to create it manually"
    else
        chmod +x "${INSTALL_DIR}/hook/approval-hook.sh"
        info "Hook script installed to: ${INSTALL_DIR}/hook/approval-hook.sh"
    fi

    echo ""
    info "Installation complete!"
    echo ""
    echo "Next steps:"
    echo "1. Create a Slack App at https://api.slack.com/apps"
    echo "2. Enable Socket Mode and get App-Level Token (xapp-...)"
    echo "3. Add Bot Token Scopes: chat:write, users:read"
    echo "4. Install app to workspace and get Bot Token (xoxb-...)"
    echo "5. Get your Slack User ID"
    echo ""
    echo "6. Add to your Claude settings (~/.claude/settings.json):"
    echo ""
    cat << 'EOF'
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/slack-approval/hook/approval-hook.sh --bot-token 'xoxb-YOUR-TOKEN' --app-token 'xapp-YOUR-TOKEN' --user-id 'UXXXXXXXX'"
          }
        ]
      }
    ]
  }
}
EOF
}

install
