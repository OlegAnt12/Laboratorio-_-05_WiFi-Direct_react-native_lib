import React, {useEffect, useState} from 'react';
import {SafeAreaView, View, Text, Button, FlatList, TouchableOpacity} from 'react-native';
import * as RNWifiP2p from 'react-native-wifi-p2p';
import TcpSocket from 'react-native-tcp-socket';

export default function App() {
  const [peers, setPeers] = useState([]);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const [log, setLog] = useState('');

  useEffect(() => {
    RNWifiP2p.initialize().catch(err => appendLog('init err: ' + err));

    const subPeers = RNWifiP2p.subscribeOnPeersUpdates(({devices}) => {
      setPeers(devices || []);
      appendLog('peers updated: ' + (devices || []).length);
    });

    const subConn = RNWifiP2p.subscribeOnConnectionInfoUpdates(info => {
      setConnectionInfo(info);
      appendLog('connection info: ' + JSON.stringify(info));
    });

    return () => {
      try { subPeers.remove(); } catch (e) {}
      try { subConn.remove(); } catch (e) {}
    };
  }, []);

  function appendLog(s) {
    setLog(prev => prev + '\n' + s);
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
    try { await RNWifiP2p.connect(device.deviceAddress); appendLog('Connecting to ' + device.deviceName); } catch (e) { appendLog('connect err: ' + e); }
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
      appendLog('getConnectionInfo: ' + JSON.stringify(info));
    } catch (e) { appendLog('getInfo err: ' + e); }
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
          if (host) connectTcpClient(host, 8080); else appendLog('No GO IP available yet');
        }} />
      </View>

      <Text style={{marginTop:12, fontWeight:'bold'}}>Logs</Text>
      <Text style={{flex:1}}>{log}</Text>
    </SafeAreaView>
  );
}
