## Prototype: React Native Wi-Fi Direct (without Termite)

This prototype demonstrates how to use `react-native-wifi-p2p` together with `react-native-tcp-socket` to implement a simple Wi‑Fi Direct discovery and data exchange workflow on Android devices (real devices required).

Quick steps

- Install deps:

```bash
cd prototype
npm install
```

- Android: run on two real devices (emulator won't work reliably):

```bash
npx react-native run-android
```

- Grant runtime permissions (Location, Nearby Wi‑Fi devices) and allow Wi‑Fi P2P in settings.

Helpful `adb` commands (run while device is connected):

```bash
# grant location (required for discovery on Android <13)
adb shell pm grant <your.package.name> android.permission.ACCESS_FINE_LOCATION

# for Android 13+ grant nearby Wi-Fi devices
adb shell pm grant <your.package.name> android.permission.NEARBY_WIFI_DEVICES
```

Notes

- `react-native-wifi-p2p` is Android-only (use MultipeerConnectivity on iOS).
- You must include permissions in `AndroidManifest.xml` (see snippet in this README).

AndroidManifest snippet (add to `android/app/src/main/AndroidManifest.xml`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<!-- For Android 13+ -->
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation" />
```

Also add the Wi‑Fi Direct feature declaration (optional):

```xml
<uses-feature android:name="android.hardware.wifi.direct" android:required="false" />
```

Behavior to test


New features added:

- UI: input to set number of discovery trials and buttons to start measurements.
- Auto‑reconnect: if a connect fails, the app attempts reconnects with exponential backoff.
- Detailed logs: logs are timestamped and prefixed with `RN_WIFI_P2P`; use "Export Logs" to save to device documents.
- Metrics export: discovery measurements save `discovery_metrics.csv` to the app documents folder; use `prototype/scripts/parse_metrics.py` to compute basic stats.

Scripts:

- `prototype/scripts/collect_logs.sh <package.name> [out.txt]` — runs `adb logcat` and captures lines with `RN_WIFI_P2P` for 20s.
- `prototype/scripts/parse_metrics.py <csv>` — computes mean/stddev/min/max of discovery times (ignores -1 entries as timeouts).

Example steps to run a measurement (manual)

1. Install the app on two Android devices and grant permissions (see earlier section).
2. On device A: open app, press "Measure discovery" (set trials to desired number).
3. After measurement finishes, use `adb` to pull the file:

```bash
adb shell "cat /data/data/<your.package.name>/files/discovery_metrics.csv" > discovery_metrics.csv
```

Or use the helper script to collect logs while you run the test and then parse metrics.
