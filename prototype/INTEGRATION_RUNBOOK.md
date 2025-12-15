# Integration Runbook (Android devices)

Prerequisites:
- Two Android devices with developer mode + adb access
- USB or same network connectivity
- A build of the app installed on both devices (debug build)

Steps:
1. Install app on both devices. Example:
   adb -s <device1> install -r android/app/build/outputs/apk/debug/app-debug.apk
   adb -s <device2> install -r android/app/build/outputs/apk/debug/app-debug.apk
2. On device 1: open app, create group (GO). Start TCP server: press "Start TCP Server".
3. On device 2: start discovery and connect to device 1.
4. On device 2: pick a file and send. Monitor progress on both devices in the Transfers list.
5. Collect logs on host:
   adb -s <device1> logcat -v time | grep RN_WIFI_P2P > device1_logs.txt
   adb -s <device2> logcat -v time | grep RN_WIFI_P2P > device2_logs.txt

Automated helper (host): scripts/run_integration_test.sh

Notes:
- The app uses TCP chunked fallback on port 8080. Ensure firewall/NAT allows TCP connections between devices.
- For precise metrics, enable screen recording or use the saved logs/metrics produced by the app.
