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

mkdir -p /tmp/libwebkit2gtk-4_1-0
cp -a /home/marcos/.local-dev/usr/libexec/libwebkit2gtk-4_1-0/* /tmp/libwebkit2gtk-4_1-0/ 2>/dev/null || true

. "$HOME/.cargo/env"

cd /home/marcos/meeting-copilot/frontend
exec npm run tauri:dev:cpu

