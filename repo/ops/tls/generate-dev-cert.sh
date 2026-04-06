#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT_DIR="$SCRIPT_DIR/dev"

mkdir -p "$OUT_DIR"

openssl req \
  -x509 \
  -newkey rsa:4096 \
  -keyout "$OUT_DIR/server.key" \
  -out "$OUT_DIR/server.crt" \
  -sha256 \
  -days 365 \
  -nodes \
  -subj "/CN=localhost"

echo "Generated TLS files:"
echo "  $OUT_DIR/server.crt"
echo "  $OUT_DIR/server.key"
