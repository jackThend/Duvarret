#!/usr/bin/env bash
# Prepara el certificado de firma en el CI a partir de los secretos (ver docs/07_PUBLICACION.md).
set -euo pipefail
if [ "$RUNNER_OS" = "Windows" ] && [ -n "$WINDOWS_CERTIFICATE" ]; then
  pfx="$(cygpath -u "$RUNNER_TEMP")/firma.pfx"
  echo "$WINDOWS_CERTIFICATE" | base64 --decode > "$pfx"
  echo "DUVARRET_WIN_CERT=$(cygpath -w "$pfx")" >> "$GITHUB_ENV"
  echo "Certificado de Windows listo."
elif [ "$RUNNER_OS" = "macOS" ] && [ -n "$APPLE_CERTIFICATE" ]; then
  keychain="$RUNNER_TEMP/firma.keychain-db"
  pass="$(openssl rand -hex 16)"
  echo "$APPLE_CERTIFICATE" | base64 --decode > "$RUNNER_TEMP/firma.p12"
  security create-keychain -p "$pass" "$keychain"
  security set-keychain-settings -lut 3600 "$keychain"
  security unlock-keychain -p "$pass" "$keychain"
  security import "$RUNNER_TEMP/firma.p12" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$pass" "$keychain" > /dev/null
  security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
  rm "$RUNNER_TEMP/firma.p12"
  echo "DUVARRET_MAC_IDENTITY=$APPLE_SIGNING_IDENTITY" >> "$GITHUB_ENV"
  echo "Certificado de Apple listo."
else
  echo "Sin certificado: el ejecutable se publicará sin firmar."
fi
