#!/usr/bin/env bash
# Collect RN_WIFI_P2P logs for package
if [ -z "$1" ]; then
  echo "Usage: $0 <android.package.name> [output_file]"
  exit 1
fi
PKG=$1
OUT=${2:-rn_wifi_p2p_logcat.txt}
echo "Collecting logs for $PKG -> $OUT"
# clear previous logs
adb logcat -c
# run for 20 seconds
adb logcat --pid=$(adb shell pidof $PKG) | grep --line-buffered "RN_WIFI_P2P" | tee $OUT &
PID=$!
sleep 20
kill $PID 2>/dev/null || true
echo "Logs saved to $OUT"
