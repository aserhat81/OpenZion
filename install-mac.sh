#!/bin/bash
# Local Agent - macOS Installer
# Terminal'de çalıştırın: bash install-mac.sh / Run: bash install-mac.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX=$(find "$SCRIPT_DIR" -maxdepth 1 -name "*.vsix" | head -1)

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; GRAY='\033[0;90m'; NC='\033[0m'

clear
echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║       LOCAL AGENT - INSTALLER        ║${NC}"
echo -e "  ${GREEN}║   AI Software Engineer for VS Code   ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Check VS Code ─────────────────────────────────────────────────
echo -e "  ${CYAN}[1/2] VS Code kontrol ediliyor / Checking VS Code...${NC}"

CODE_CMD=""
if command -v code &>/dev/null; then
    CODE_CMD="code"
elif [ -f "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" ]; then
    CODE_CMD="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
fi

if [ -z "$CODE_CMD" ]; then
    echo ""
    echo -e "  ${RED}✗ VS Code bulunamadı! / VS Code not found!${NC}"
    echo -e "  ${YELLOW}Lütfen önce VS Code kurun / Install VS Code first:${NC}"
    echo "  → https://code.visualstudio.com/download"
    echo ""
    read -p "  İndirme sayfasını aç? / Open download page? (E/y): " OPEN
    if [ "$OPEN" != "n" ] && [ "$OPEN" != "N" ]; then
        open "https://code.visualstudio.com/download" 2>/dev/null
    fi
    if command -v brew &>/dev/null; then
        echo ""
        read -p "  Homebrew ile kur? / Install via Homebrew? (E/y): " BREW
        if [ "$BREW" != "n" ] && [ "$BREW" != "N" ]; then
            brew install --cask visual-studio-code && CODE_CMD="code"
        fi
    fi
    if [ -z "$CODE_CMD" ]; then
        echo ""
        echo -e "  ${YELLOW}VS Code kurulduktan sonra tekrar çalıştırın / Run again after installing VS Code.${NC}"
        echo ""
        exit 1
    fi
fi

CODE_VERSION=$("$CODE_CMD" --version 2>/dev/null | head -1)
echo -e "  ${GREEN}✓ VS Code bulundu / found: v${CODE_VERSION}${NC}"

# ── Step 2: Install Extension ─────────────────────────────────────────────
echo ""
echo -e "  ${CYAN}[2/2] Eklenti kuruluyor / Installing extension...${NC}"

if [ -z "$VSIX" ]; then
    echo -e "  ${RED}✗ .vsix dosyası bulunamadı! / .vsix file not found!${NC}"
    echo -e "  ${YELLOW}Bu scripti .vsix dosyasıyla aynı klasörde çalıştırın.${NC}"
    echo "  Run this script in the same folder as the .vsix file."
    exit 1
fi

echo -e "  ${GRAY}Dosya / File: $(basename "$VSIX")${NC}"

if "$CODE_CMD" --install-extension "$VSIX" --force 2>/dev/null; then
    echo -e "  ${GREEN}✓ Başarıyla kuruldu / Successfully installed!${NC}"
else
    echo -e "  ${RED}✗ Kurulum başarısız / Installation failed!${NC}"
    exit 1
fi

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║         ✓ KURULUM TAMAMLANDI!        ║${NC}"
echo -e "  ${GREEN}║           INSTALLATION DONE!         ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}Sonraki adımlar / Next steps:${NC}"
echo "  1. VS Code'u yeniden başlatın → Cmd+Shift+P → Reload Window"
echo "  2. Ollama çalıştırın  → ollama serve"
echo "  3. Sol panelden Local Agent'i açın"
echo ""
