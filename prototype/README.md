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

- Discovery: start/stop discovery and show discovered peers.
- Connect: select peer to connect and observe `getConnectionInfo` data.
- Data exchange: on group owner start a TCP server and on the other device connect as client and exchange sample messages.
