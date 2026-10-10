#!/usr/bin/env bash
# Instala el Android SDK mínimo para compilar (sin emulador) en $ANDROID_HOME:
# cmdline-tools + plataforma + build-tools. Lo usa el CI de GitLab (imagen con
# solo JDK) y sirve para compilar en Docker sin Android Studio (README.md).
# Idempotente: si ya está instalado no baja nada (cachear $ANDROID_HOME).
set -euo pipefail

: "${ANDROID_HOME:?Definí ANDROID_HOME (directorio donde instalar el SDK)}"

# Al subir compileSdk (gradle/libs.versions.toml) subir PLATFORM; al subir AGP, BUILD_TOOLS
# (su versión por defecto, en las notas de AGP).
CMDLINE_TOOLS_ZIP="commandlinetools-linux-16111833_latest.zip"
PLATFORM="platforms;android-37.0"
BUILD_TOOLS="build-tools;36.0.0"   # la que usa AGP 9.4 por defecto

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "$SDKMANAGER" ]]; then
  command -v unzip >/dev/null || { echo "Falta unzip"; exit 1; }
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/tools.zip" "https://dl.google.com/android/repository/$CMDLINE_TOOLS_ZIP"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

if [[ ! -d "$ANDROID_HOME/platforms/android-37.0" || ! -d "$ANDROID_HOME/build-tools/36.0.0" ]]; then
  # Aceptar las licencias del SDK (las mismas que acepta Android Studio).
  yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null || true
  "$SDKMANAGER" --sdk_root="$ANDROID_HOME" "$PLATFORM" "$BUILD_TOOLS" "platform-tools"
fi
echo "Android SDK listo en $ANDROID_HOME"
