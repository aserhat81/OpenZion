#!/bin/bash
# Local Agent - Linux Installer
# Terminal'de çalıştırın: bash install-linux.sh / Run: bash install-linux.sh

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
elif command -v code-insiders &>/dev/null; then
    CODE_CMD="code-insiders"
fi

if [ -z "$CODE_CMD" ]; then
    echo ""
    echo -e "  ${RED}✗ VS Code bulunamadı! / VS Code not found!${NC}"
    echo -e "  ${YELLOW}Kurulum yöntemi seçin / Choose install method:${NC}"
    echo ""
    echo "  1) .deb ile kur (Ubuntu/Debian)"
    echo "  2) .rpm ile kur (Fedora/RHEL)"
    echo "  3) Snap ile kur (sudo snap install code)"
    echo "  4) İndirme sayfasını aç / Open download page"
    echo "  5) Çıkış / Exit"
    echo ""
    read -p "  Seçim / Choice [1-5]: " CHOICE

    case $CHOICE in
        1)
            TMP="/tmp/vscode.deb"
            echo "  .deb indiriliyor / Downloading .deb..."
            curl -fL "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" -o "$TMP"
            sudo apt install -y "$TMP" && rm -f "$TMP" && CODE_CMD="code"
            ;;
        2)
            TMP="/tmp/vscode.rpm"
            echo "  .rpm indiriliyor / Downloading .rpm..."
            curl -fL "https://code.visualstudio.com/sha/download?build=stable&os=linux-rpm-x64" -o "$TMP"
            sudo rpm -i "$TMP" && rm -f "$TMP" && CODE_CMD="code"
            ;;
        3)
            sudo snap install code --classic && CODE_CMD="code"
            ;;
        4)
            xdg-open "https://code.visualstudio.com/download" 2>/dev/null || \
              echo "  → https://code.visualstudio.com/download"
            echo ""
            echo -e "  ${YELLOW}VS Code kurulduktan sonra tekrar çalıştırın / Run again after installing.${NC}"
            exit 0
            ;;
        *) echo "  Çıkış / Exiting."; exit 1 ;;
    esac
fi

if [ -z "$CODE_CMD" ]; then
    echo -e "  ${RED}VS Code kurulamadı. Lütfen manuel kurun. / Could not install VS Code. Please install manually.${NC}"
    exit 1
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
echo "  1. VS Code'u yeniden başlatın → Ctrl+Shift+P → Reload Window"
echo "  2. Ollama çalıştırın  → ollama serve"
echo "  3. Sol panelden Local Agent'i açın"
echo ""
