Test Plan — RN Wi‑Fi Direct Prototype

1) Discovery
   - Start discovery on device A and scan time until device B appears.
   - Repeat 5 times and record discovery times.

2) Connection
   - Attempt connect from A -> B. Record success/failure and time to connection.
   - Repeat for both directions (A->B, B->A) and for 10 trials.

3) Data Exchange
   - On group owner start TCP server on port 8080. Client connects and sends a 1KB payload.
   - Measure round‑trip time and success rate for 20 transfers.

4) Mobility (manual)
   - During transfer, move device B away (or disable Wi‑Fi) and observe behavior.
   - Record whether transfer resumes or fails and how long reconnection takes.

Notes
   - Use physical devices (Android). For reproducibility, note device models and Android versions.
