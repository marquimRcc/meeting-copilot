#!/usr/bin/env bash
# ==============================================================================
# Script de Compilação Local do Meeting Copilot para Linux (Regata OS / Ubuntu / Debian)
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "========================================================"
echo "  Meeting Copilot: Compilação do Executável Linux       "
echo "========================================================"

# 1. Checagem de Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js não encontrado. Instale Node.js (versão 20 ou superior)."
    exit 1
fi
echo "✅ Node.js: $(node --version)"

# 2. Checagem de Rust e Cargo
if ! command -v cargo >/dev/null 2>&1; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
fi

if ! command -v cargo >/dev/null 2>&1; then
    echo "⚠️  Cargo / Rust não detectado no PATH."
    echo "Para compilar localmente na sua máquina Linux:"
    echo "  1. Instale o Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "  2. Carregue o ambiente: source \$HOME/.cargo/env"
    echo "  3. Instale pacotes do sistema: sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libasound2-dev"
    echo ""
    echo "💡 Dica: Você também pode disparar a compilação do .deb e .AppImage diretamente"
    echo "pelo GitHub Actions na aba 'Actions' -> 'Build and Test - Linux' no repositório."
    exit 1
fi
echo "✅ Cargo / Rust: $(cargo --version)"

# 3. Compilação do frontend Next.js (Export estático)
echo "📦 Compilando assets estáticos do frontend..."
cd "$DIR/frontend"
node node_modules/next/dist/bin/next build

# 4. Compilação e empacotamento Tauri
echo "🚀 Compilando binário nativo e gerando pacotes Linux (.deb / .AppImage)..."
npx tauri build --bundles deb,appimage

echo ""
echo "========================================================"
echo "🎉 Build concluído com sucesso!"
echo "Arquivos gerados em: frontend/src-tauri/target/release/bundle/"
echo "========================================================"
