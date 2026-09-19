#!/bin/bash
set -e

export PATH="/home/marcos/.local-bin:$PATH"
export PKG_CONFIG_PATH="/home/marcos/.local-dev/usr/lib64/pkgconfig:/home/marcos/.local-dev/usr/share/pkgconfig"
export LIBCLANG_PATH="/home/marcos/.local-dev/usr/lib64"
export OPENSSL_DIR="/home/marcos/.local-dev/usr"
export OPENSSL_INCLUDE_DIR="/home/marcos/.local-dev/usr/include"
export OPENSSL_LIB_DIR="/home/marcos/.local-dev/usr/lib64"
export LIBRARY_PATH="/home/marcos/.local-dev/usr/lib64:$LIBRARY_PATH"
export LD_LIBRARY_PATH="/home/marcos/.local-dev/usr/lib64:$LD_LIBRARY_PATH"
export RUSTFLAGS="-L native=/home/marcos/.local-dev/usr/lib64"
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export MEETILY_RECORD_SYSTEM_ONLY=1


mkdir -p /tmp/libwebkit2gtk-4_1-0
cp -a /home/marcos/.local-dev/usr/libexec/libwebkit2gtk-4_1-0/* /tmp/libwebkit2gtk-4_1-0/ 2>/dev/null || true

# Configurar dispositivo monitor PipeWire/ALSA para captura exclusiva do áudio do sistema (YouTube/Desktop)
pkill -f "meetily_system_source" 2>/dev/null || true
pw-loopback -i 'stream.capture.sink=true' -o 'media.class=Audio/Source node.name=meetily_system_source node.description="Meetily System Audio Source"' &
PW_LOOP_PID=$!

cat << 'EOF' > ~/.asoundrc
pcm.meetily_monitor {
    type pipewire
    capture_node "meetily_system_source"
    hint {
        show on
        description "System Audio Monitor"
    }
}
EOF

trap "kill \$PW_LOOP_PID 2>/dev/null || true; pkill -f meetily_system_source 2>/dev/null || true" EXIT INT TERM

. "$HOME/.cargo/env"
cd /home/marcos/meeting-copilot/frontend

# Iniciar Next.js e aguardar compilação completa antes de abrir a janela
if ! curl -s http://localhost:3118/ >/dev/null 2>&1; then
    echo "Iniciando servidor Next.js..."
    npm run dev &
    NEXT_PID=$!
    trap "kill \$NEXT_PID \$PW_LOOP_PID 2>/dev/null || true; pkill -f meetily_system_source 2>/dev/null || true" EXIT INT TERM
    
    echo "Aguardando compilação do Next.js..."
    for i in {1..30}; do
        if curl -s http://localhost:3118/ | grep -q "html"; then
            echo "Next.js compilado com sucesso!"
            break
        fi
        sleep 0.5
    done
fi

echo "Iniciando aplicação desktop..."
npx tauri dev

