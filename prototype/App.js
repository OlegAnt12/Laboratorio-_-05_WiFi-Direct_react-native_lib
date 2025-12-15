import React, {useEffect, useState, useRef} from 'react';
import {SafeAreaView, View, Text, Button, FlatList, TouchableOpacity, TextInput, ScrollView} from 'react-native';
import * as RNWifiP2p from 'react-native-wifi-p2p';
import TcpSocket from 'react-native-tcp-socket';
import RNFS from 'react-native-fs';
import * as Queue from './src/queue';
import DocumentPicker from 'react-native-document-picker';

export default function App() {
  const [peers, setPeers] = useState([]);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [log, setLog] = useState('');
  const logsJsonRef = useRef([]);
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
      // Try to process pending queue when we form a group
      if (info && info.groupFormed) {
        appendLog('Processing outgoing queue on connection', 'INFO');
        Queue.processQueue(async (itm) => {
          if (itm.type === 'message') {
            // try RNWifiP2p sendMessageTo if available
            if (RNWifiP2p.sendMessageTo) {
              await RNWifiP2p.sendMessageTo(itm.message, itm.to);
            } else {
              // fallback: TCP client
              await new Promise((res, rej) => {
                const client = TcpSocket.createConnection({port: itm.port || 8080, host: itm.to}, () => {
                  client.write(itm.message);
                });
                client.on('data', () => { client.destroy(); res(); });
                client.on('error', e => { rej(e); });
              });
            }
          } else if (itm.type === 'file') {
            if (RNWifiP2p.sendFileTo) {
              await RNWifiP2p.sendFileTo(itm.path, itm.to);
            } else {
              throw new Error('File send fallback not implemented');
            }
          }
        }).then(res => appendLog('Queue processed: ' + JSON.stringify(res), 'INFO')).catch(e => appendLog('Queue process err: ' + e, 'ERROR'));
      }
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
    logsJsonRef.current.push({ts, text: s});
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
      // write JSON logs
      const jsonPath = RNFS.DocumentDirectoryPath + '/rn_wifi_p2p_logs.json';
      try {
        await RNFS.writeFile(jsonPath, JSON.stringify(logsJsonRef.current, null, 2), 'utf8');
        appendLog('Saved structured logs to ' + jsonPath, 'INFO');
      } catch (e) { appendLog('Failed to save JSON logs: ' + e, 'ERROR'); }
    } catch (e) { appendLog('Failed to save logs: ' + e, 'ERROR'); }
  }

  // File picker + sender
  async function pickAndSendFile() {
    try {
      const res = await DocumentPicker.pickSingle({type: [DocumentPicker.types.images, DocumentPicker.types.video, DocumentPicker.types.pdf]});
      appendLog('Picked file: ' + res.name + ' uri=' + res.uri, 'INFO');
      // copy if content uri
      let path = res.uri;
      if (path.startsWith('content://')) {
        const dest = RNFS.DocumentDirectoryPath + '/' + (res.name || ('file_' + Date.now()));
        try {
          await RNFS.copyFile(path, dest);
          path = dest;
        } catch (e) {
          appendLog('Failed to copy content uri: ' + e, 'ERROR');
        }
      }
      const to = connectionInfo && (connectionInfo.groupOwnerAddress || connectionInfo.groupOwnerIP);
      if (to && RNWifiP2p.sendFileTo) {
        await RNWifiP2p.sendFileTo(path, to);
        appendLog('File send initiated to ' + to, 'INFO');
      } else {
        await Queue.enqueue({type:'file', path, to});
        appendLog('Queued file for later send', 'INFO');
      }
    } catch (e) {
      if (DocumentPicker.isCancel && DocumentPicker.isCancel(e)) appendLog('File pick cancelled', 'INFO'); else appendLog('File pick/send err: ' + e, 'ERROR');
    }
  }

  // Send a text message to peer or queue if offline
  async function sendMessageToPeer(text) {
    const to = connectionInfo && (connectionInfo.groupOwnerAddress || connectionInfo.groupOwnerIP);
    const payload = {type:'message', message:text, to, port:8080};
    try {
      if (to && RNWifiP2p.sendMessageTo) {
        await RNWifiP2p.sendMessageTo(text, to);
        appendLog('Message sent to ' + to, 'INFO');
      } else if (to) {
        await new Promise((res, rej) => {
          const client = TcpSocket.createConnection({port:8080, host:to}, () => { client.write(text); });
          client.on('data', () => { client.destroy(); res(); });
          client.on('error', e => rej(e));
        });
        appendLog('Message TCP sent to ' + to, 'INFO');
      } else {
        await Queue.enqueue(payload);
        appendLog('Queued message for later send', 'INFO');
      }
    } catch (e) { appendLog('sendMessage err: ' + e, 'ERROR'); await Queue.enqueue(payload); }
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
        <View style={{marginTop:8, marginBottom:8}}>
          <TextInput placeholder="Message to peer" style={{borderWidth:1, padding:8, marginTop:8}} onSubmitEditing={(e) => sendMessageToPeer(e.nativeEvent.text)} />
          <Button title="Pick & Send File" onPress={pickAndSendFile} />
        </View>
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
