import React, { useState, useCallback } from 'react';
import { View, Text, Button, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWallet, fetchAcks } from '../utils/db';
import { ethers } from 'ethers';
import { useConnectivity } from '../context/ConnectivityContext';
import useBleRelay from '../hooks/useBleRelay';

function getConnectivityBadgeStyle(connectivity) {
  const base = {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 8,
  };

  if (!connectivity?.isConnected) {
    return { ...base, backgroundColor: '#ef4444' };
  }

  if (connectivity?.isInternetReachable) {
    return { ...base, backgroundColor: '#22c55e' };
  }

  return { ...base, backgroundColor: '#f97316' };
}

function getBleStatusBadgeStyle(canRelay) {
  return {
    backgroundColor: canRelay ? '#059669' : '#64748b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  };
}

export default function HomeScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState('0.0');
  const [acks, setAcks] = useState([]);
  const [loading, setLoading] = useState(true);
  const connectivity = useConnectivity();
  const bleRelay = useBleRelay({ autoStart: true });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedWallet = await fetchWallet();
      if (fetchedWallet) {
        setWallet(fetchedWallet);
        const fetchedAcks = await fetchAcks();
        setAcks(fetchedAcks);

        // Determine balance from the latest ack
        if (fetchedAcks.length > 0) {
          const latestAck = fetchedAcks[0]; // DB query is ordered by blockNumber DESC
          const newBalances = JSON.parse(latestAck.newBalances);
          const userBalance = newBalances[fetchedWallet.address];
          setBalance(userBalance || '0.0');
        } else {
          setBalance('0.0'); // No transactions yet
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const renderTxItem = ({ item }) => {
    const isSender = item.fromAddress.toLowerCase() === wallet.address.toLowerCase();
    const value = ethers.utils.formatEther(item.value);
    return (
      <View style={styles.txItem}>
        <Text style={styles.txHash} selectable>Tx: {item.txHash.substring(0, 10)}...</Text>
        <Text>{isSender ? `To: ${item.toAddress.substring(0, 10)}...` : `From: ${item.fromAddress.substring(0, 10)}...`}</Text>
        <Text style={[styles.txAmount, { color: isSender ? 'red' : 'green' }]}>
          {isSender ? '-' : '+'}{value} ETH
        </Text>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.addressLabel}>Your Address:</Text>
        <Text style={styles.address} selectable>{wallet ? wallet.address : 'Loading...'}</Text>
        <Text style={styles.balanceLabel}>Balance:</Text>
        <Text style={styles.balance}>{balance} ETH</Text>
      </View>

      <View style={styles.actions}>
        <Button title="Send" onPress={() => navigation.navigate('Send')} />
        <Button title="Scan to Receive" onPress={() => navigation.navigate('Scan')} />
        <Button title="BLE Debug" onPress={() => navigation.navigate('BleDebug')} />
      </View>

      <TouchableOpacity style={styles.connectivityCard} onPress={connectivity.triggerHeartbeatCheck}>
        <View style={getConnectivityBadgeStyle(connectivity)}>
          <Text style={styles.connectivityBadgeText}>
            {connectivity.isConnected ? (connectivity.isInternetReachable ? 'Online Relayer' : 'Limited Connection') : 'Offline Device'}
          </Text>
        </View>
        <Text style={styles.connectivitySubtext}>
          Connection: {connectivity.connectionType}
        </Text>
        <Text style={styles.connectivitySubtext}>
          Last update: {connectivity.lastChangedAt ? new Date(connectivity.lastChangedAt).toLocaleTimeString() : '—'}
        </Text>
        {connectivity.heartbeat.url ? (
          <Text style={styles.connectivitySubtext}>
            Relayer check: {connectivity.heartbeat.status} {connectivity.heartbeat.latencyMs ? `(${connectivity.heartbeat.latencyMs}ms)` : ''}
          </Text>
        ) : (
          <Text style={styles.connectivitySubtext}>
            Heartbeat not configured
          </Text>
        )}
      </TouchableOpacity>

      {bleRelay.isSupported && (
        <View style={styles.bleRelayCard}>
          <Text style={styles.bleRelayTitle}>BLE Mesh Network</Text>
          <View style={styles.bleStatusRow}>
            <Text style={styles.bleStatusLabel}>Status:</Text>
            <View style={getBleStatusBadgeStyle(bleRelay.relayerRole.canRelay)}>
              <Text style={styles.bleStatusText}>
                {bleRelay.relayerRole.canRelay ? 'Active Relayer' : 
                 bleRelay.relayerRole.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
          <Text style={styles.bleSubtext}>
            Nearby peers: {bleRelay.peers.length} | Relayers: {bleRelay.relayerPeers.length}
          </Text>
          {bleRelay.error && (
            <Text style={styles.bleErrorText}>Error: {bleRelay.error}</Text>
          )}
          <View style={styles.bleActions}>
            <Button 
              title="Start Scan" 
              onPress={bleRelay.startScanning} 
              disabled={!bleRelay.isInitialized}
            />
            <Button 
              title="Stop Scan" 
              onPress={bleRelay.stopScanning}
              disabled={!bleRelay.isInitialized}
            />
          </View>
        </View>
      )}

      <Text style={styles.historyTitle}>Transaction History</Text>
      {acks.length === 0 ? (
        <Text style={styles.noTxText}>No transactions yet.</Text>
      ) : (
        <FlatList
          data={acks}
          renderItem={renderTxItem}
          keyExtractor={item => item.id.toString()}
          style={styles.txList}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 10 },
  addressLabel: { fontSize: 16, color: '#666' },
  address: { fontSize: 14, fontFamily: 'monospace', marginBottom: 20 },
  balanceLabel: { fontSize: 20, color: '#333' },
  balance: { fontSize: 36, fontWeight: 'bold' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 },
  connectivityCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 10,
    marginBottom: 20,
  },
  connectivityBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  connectivitySubtext: {
    color: '#cbd5f5',
    fontSize: 12,
    marginTop: 2,
  },
  bleRelayCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bleRelayTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  bleStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bleStatusLabel: {
    color: '#cbd5f5',
    marginRight: 8,
  },
  bleStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  bleSubtext: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 8,
  },
  bleErrorText: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 8,
  },
  bleActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  historyTitle: { fontSize: 22, fontWeight: 'bold', marginLeft: 10, marginBottom: 10 },
  txList: { flex: 1 },
  txItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  txHash: { flex: 1, fontFamily: 'monospace' },
  txAmount: { fontWeight: 'bold' },
  noTxText: { textAlign: 'center', marginTop: 20, color: '#888' },
});