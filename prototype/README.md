# rn-wifi-p2p-prototype — Expo notes

Este projeto usa módulos nativos (por exemplo `react-native-wifi-p2p`, `react-native-tcp-socket`, `react-native-zeroconf`, `react-native-fs`) que não fazem parte do Expo Go padrão. Para rodar em dispositivos físicos via Expo, siga as instruções abaixo para criar um Dev Client personalizado (recomendado) ou usar EAS.

Requisitos:
- Node.js e npm/yarn
- `expo-cli` e `eas-cli` (instale globalmente ou use `npx`)

Passos essenciais (Android):

1. Instale dependências

```bash
cd prototype
npm install
```

2. Instale o Expo dev client localmente

```bash
npx expo install expo-dev-client
```

3. Configure EAS (uma vez)

```bash
npx eas login   # se necessário
npx eas build:configure
```

4. Faça um build de desenvolvimento (dev client) e instale no dispositivo Android

```bash
npx eas build --profile development --platform android
# Depois de pronto, baixe o APK e instale no dispositivo (ou use o link fornecido pelo EAS)
```

5. Inicie o servidor Metro com o modo dev-client e abra o app no Dev Client instalado

```bash
npm run start
# ou para dev-client explicitamente:
npx expo start --dev-client
```

6. No dispositivo (Expo Dev Client), escolha a opção para conectar ao servidor (QR code ou tunnel/LAN) e abra o app.

Observações importantes:
- Expo Go NÃO suporta módulos nativos arbitrários; por isso usamos um Dev Client personalizado ou EAS build.
- Para iOS você precisa de um Mac para criar e instalar o Dev Client ou usar TestFlight / EAS Submit.
- Alguns módulos podem precisar de permissões ou configuração nativa extra; veja a documentação de cada dependência.
- Se preferir não usar Expo, a pasta `prototype` já tem scripts para `react-native` (antes da alteração). Use o fluxo Bare RN (`npx react-native run-android`) se quiser evitar criar um Dev Client.

Com isso você conseguirá rodar o app em dispositivos físicos usando Expo Dev Client / EAS. Se quiser, eu posso também gerar um `eas.json` de exemplo e ajustar `app.json` com permissões necessárias (ex.: `ACCESS_FINE_LOCATION`, `INTERNET`) — quer que eu faça isso agora?
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

Expo prebuild & checks (recommended when using Expo Dev Client)

```bash
# from the prototype folder
npm install
# generate Android native project (prebuild)
npx expo prebuild --platform android
# inspect the generated manifest
sed -n '1,240p' android/app/src/main/AndroidManifest.xml
```

If you need to make persistent changes to permissions or Info.plist entries, prefer editing `app.json` (see the `ios.infoPlist` and `android.permissions` fields). After changing `app.json` run `npx expo prebuild` again to sync.

- Grant runtime permissions (Location, Nearby Wi‑Fi devices) and allow Wi‑Fi P2P in settings.

Helpful `adb` commands (run while device is connected):

```bash
# grant location (required for discovery on Android <13)
adb shell pm grant <your.package.name> android.permission.ACCESS_FINE_LOCATION

# for Android 13+ grant nearby Wi-Fi devices
adb shell pm grant <your.package.name> android.permission.NEARBY_WIFI_DEVICES
```

Nota: No Android 13+ também é recomendado adicionar o atributo `android:usesPermissionFlags="neverForLocation"` ao elemento `<uses-permission>` em `android/app/src/main/AndroidManifest.xml`. O Expo normalmente sincroniza permissões simples do `app.json`, mas flags específicas podem precisar de edição manual após `npx expo prebuild`.

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

Chunked TCP fallback

- The app includes a TCP chunked transfer fallback (port 8080) when `sendFileTo` is not available on the native Wi‑Fi P2P bridge. The implementation is in `src/tcp_chunked.js` and has unit tests in `__tests__/tcp_chunked.test.js`.

Integration testing

- See `INTEGRATION_RUNBOOK.md` and `scripts/run_integration_test.sh` for device-based test steps and log collection commands.
