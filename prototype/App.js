import React, {useEffect, useState, useRef} from 'react';
import {SafeAreaView, View, Text, Button, FlatList, TouchableOpacity, TextInput, ScrollView} from 'react-native';
import * as RNWifiP2p from 'react-native-wifi-p2p';
import TcpSocket from 'react-native-tcp-socket';
import RNFS from 'react-native-fs';

export default function App() {
  const [peers, setPeers] = useState([]);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [log, setLog] = useState('');
  const [lastDevice, setLastDevice] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [discoverTrials, setDiscoverTrials] = useState('5');
  const discoveryMetricsRef = useRef([]);

  useEffect(() => {
    RNWifiP2p.initialize().catch(err => appendLog('init err: ' + err));

    const subPeers = RNWifiP2p.subscribeOnPeersUpdates(({devices}) => {
      setPeers(devices || []);
      appendLog('peers updated: ' + (devices || []).length, 'INFO');
      // If a reconnection target exists and device appears, try reconnecting
      if (lastDevice && devices && devices.find(d => d.deviceAddress === lastDevice.deviceAddress)) {
        appendLog('Target device visible, attempting reconnect', 'INFO');
        connectToDevice(lastDevice);
      }
    });

    const subConn = RNWifiP2p.subscribeOnConnectionInfoUpdates(info => {
      setConnectionInfo(info);
      appendLog('connection info: ' + JSON.stringify(info), 'INFO');
      // Reset reconnect attempts on successful connection
      if (info && info.groupFormed) setReconnectAttempts(0);
    });

    return () => {
      try { subPeers.remove(); } catch (e) {}
      try { subConn.remove(); } catch (e) {}
    };
  }, []);

  function appendLog(s) {
    const ts = new Date().toISOString();
    const line = `[RN_WIFI_P2P] ${ts} ${s}`;
    setLog(prev => prev + '\n' + line);
    // also print to console to surface in logcat
    console.log(line);
  }

  async function startDiscovery() {
    try {
      await RNWifiP2p.startDiscoveringPeers();
      appendLog('Started discovery');
    } catch (err) { appendLog('discover err: ' + err); }
  }

  async function stopDiscovery() {
    try { await RNWifiP2p.stopDiscoveringPeers(); appendLog('Stopped discovery'); } catch (e) { appendLog('stop err: ' + e);} 
  }

  async function createGroup() {
    try { await RNWifiP2p.createGroup(); appendLog('Group created'); } catch (e) { appendLog('group err: ' + e); }
  }

  async function connectToDevice(device) {
    try {
      setLastDevice(device);
      await RNWifiP2p.connect(device.deviceAddress);
      appendLog('Connecting to ' + device.deviceName, 'INFO');
    } catch (e) {
      appendLog('connect err: ' + e, 'ERROR');
      scheduleReconnect(device);
    }
  }

  function scheduleReconnect(device) {
    const attempts = reconnectAttempts + 1;
    setReconnectAttempts(attempts);
    const backoff = Math.min(30_000, 1000 * Math.pow(2, attempts));
    appendLog(`Scheduling reconnect attempt ${attempts} in ${backoff}ms`, 'WARN');
    setTimeout(async () => {
      try {
        await RNWifiP2p.connect(device.deviceAddress);
        appendLog('Reconnect successful', 'INFO');
        setReconnectAttempts(0);
      } catch (e) {
        appendLog('reconnect failed: ' + e, 'ERROR');
        scheduleReconnect(device);
      }
    }, backoff);
  }

  // Start a simple TCP server (run on group owner device)
  function startTcpServer(port = 8080) {
    const server = TcpSocket.createServer(socket => {
      appendLog('Client connected');
      socket.on('data', (data) => appendLog('Received: ' + data.toString()));
      socket.on('error', (err) => appendLog('Socket err: ' + err));
      socket.on('close', () => appendLog('Socket closed'));
      socket.write('Hello from server');
    }).listen({port: port, host: '0.0.0.0'}, () => appendLog('Server listening on ' + port));
    server.on('error', err => appendLog('Server err: ' + err));
    return server;
  }

  // Connect to TCP server on the given host (group owner IP)
  function connectTcpClient(host, port = 8080) {
    const client = TcpSocket.createConnection({port, host}, () => {
      appendLog('TCP client connected to ' + host + ':' + port);
      client.write('Hello from client');
    });
    client.on('data', data => appendLog('Client received: ' + data.toString()));
    client.on('error', err => appendLog('Client err: ' + err));
    client.on('close', () => appendLog('Client closed'));
    return client;
  }

  async function getConnectionInfo() {
    try {
      const info = await RNWifiP2p.getConnectionInfo();
      setConnectionInfo(info);
      appendLog('getConnectionInfo: ' + JSON.stringify(info), 'INFO');
    } catch (e) { appendLog('getInfo err: ' + e); }
  }

  // Metrics
  async function measureDiscovery(trials = 5, timeoutMs = 10000) {
    appendLog(`Starting discovery measurement: ${trials} trials`, 'INFO');
    discoveryMetricsRef.current = [];
    for (let i = 0; i < trials; i++) {
      appendLog(`Trial ${i+1}/${trials} starting`, 'INFO');
      const start = Date.now();
      let resolved = false;
      const sub = RNWifiP2p.subscribeOnPeersUpdates(({devices}) => {
        if (!resolved && devices && devices.length > 0) {
          const t = Date.now() - start;
          discoveryMetricsRef.current.push(t);
          appendLog(`Trial ${i+1} discovered peers in ${t} ms`, 'INFO');
          resolved = true;
        }
      });
      try {
        await RNWifiP2p.startDiscoveringPeers();
      } catch (e) { appendLog('start discovery err: ' + e, 'ERROR'); }
      // wait until resolved or timeout
      await new Promise(res => setTimeout(res, timeoutMs));
      try { await RNWifiP2p.stopDiscoveringPeers(); } catch (e) {}
      sub.remove();
      if (!resolved) {
        appendLog(`Trial ${i+1} timed out (> ${timeoutMs} ms)`, 'WARN');
        discoveryMetricsRef.current.push(-1);
      }
      // small cooldown
      await new Promise(res => setTimeout(res, 1000));
    }
    appendLog('Discovery measurement finished', 'INFO');
    // write results to CSV
    const csv = discoveryMetricsRef.current.map((v,i) => `${i+1},${v}`).join('\n');
    const path = RNFS.DocumentDirectoryPath + '/discovery_metrics.csv';
    try {
      await RNFS.writeFile(path, 'trial,ms\n' + csv, 'utf8');
      appendLog('Saved discovery metrics to ' + path, 'INFO');
    } catch (e) { appendLog('Failed to save metrics: ' + e, 'ERROR'); }
  }

  async function exportLogs() {
    const path = RNFS.DocumentDirectoryPath + '/rn_wifi_p2p_logs.txt';
    try {
      await RNFS.writeFile(path, log, 'utf8');
      appendLog('Saved logs to ' + path, 'INFO');
    } catch (e) { appendLog('Failed to save logs: ' + e, 'ERROR'); }
  }

  return (
    <SafeAreaView style={{flex:1, padding:12}}>
      <View style={{flexDirection:'row', justifyContent:'space-between'}}>
        <Button title="Start discovery" onPress={startDiscovery} />
        <Button title="Stop discovery" onPress={stopDiscovery} />
        <Button title="Create group" onPress={createGroup} />
      </View>

      <Text style={{marginTop:10, fontWeight:'bold'}}>Peers</Text>
      <FlatList data={peers} keyExtractor={item => item.deviceAddress} renderItem={({item}) => (
        <TouchableOpacity onPress={() => connectToDevice(item)} style={{padding:8}}>
          <Text>{item.deviceName || item.deviceAddress}</Text>
        </TouchableOpacity>
      )} />

      <View style={{marginTop:10}}>
        <Button title="Get connection info" onPress={getConnectionInfo} />
        <Button title="Start TCP Server" onPress={() => startTcpServer(8080)} />
        <Button title="Connect TCP to GO" onPress={() => {
          const host = connectionInfo && (connectionInfo.groupOwnerAddress || connectionInfo.groupOwnerIP || connectionInfo.groupOwnerAddress);
          if (host) connectTcpClient(host, 8080); else appendLog('No GO IP available yet', 'WARN');
        }} />
      </View>

      <View style={{marginTop:12}}>
        <Text style={{fontWeight:'bold'}}>Metrics</Text>
        <View style={{flexDirection:'row', alignItems:'center'}}>
          <TextInput value={discoverTrials} onChangeText={t => setDiscoverTrials(t)} keyboardType="numeric" style={{borderWidth:1, padding:6, width:80, marginRight:8}} />
          <Button title="Measure discovery" onPress={() => measureDiscovery(Number(discoverTrials) || 5, 10000)} />
        </View>
      </View>

      <View style={{marginTop:12, flexDirection:'row', justifyContent:'space-between'}}>
        <Button title="Export Logs" onPress={exportLogs} />
        <Button title="Save metrics file" onPress={async () => {
          if (discoveryMetricsRef.current.length === 0) appendLog('No metrics available', 'WARN');
          else {
            const path = RNFS.DocumentDirectoryPath + '/discovery_metrics.csv';
            const csv = discoveryMetricsRef.current.map((v,i) => `${i+1},${v}`).join('\n');
            try { await RNFS.writeFile(path, 'trial,ms\n' + csv, 'utf8'); appendLog('Saved metrics to ' + path, 'INFO'); } catch (e) { appendLog('save metrics err: ' + e, 'ERROR'); }
          }
        }} />
      </View>

      <Text style={{marginTop:12, fontWeight:'bold'}}>Logs</Text>
      <ScrollView style={{flex:1, backgroundColor:'#f7f7f7', padding:8}}>
        <Text>{log}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
