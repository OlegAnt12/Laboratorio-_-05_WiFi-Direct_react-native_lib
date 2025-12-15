#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <device-go> <device-client>"
  exit 2
fi
GO=$1
CLIENT=$2

echo "Starting integration test helper"
echo "Please ensure debug build is installed on both devices"

echo "Start TCP server on GO (open app and press Start TCP Server)"
echo "On client: start discovery and connect, then pick & send a file"

echo "Collecting logs to host files..."
adb -s "$GO" logcat -v time | grep RN_WIFI_P2P > logs_${GO}.txt &
ADB_GO_PID=$!
adb -s "$CLIENT" logcat -v time | grep RN_WIFI_P2P > logs_${CLIENT}.txt &
ADB_CLIENT_PID=$!

echo "Logs are being collected. Press Ctrl+C to stop and save files."
wait $ADB_GO_PID $ADB_CLIENT_PID || true
