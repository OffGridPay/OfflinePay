import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Button, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWallet, fetchAcks, fetchLatestBalanceSnapshot, upsertBalanceSnapshot, purgeOldBalanceSnapshots } from '../utils/db';
import { ethers } from 'ethers';
import { useConnectivity } from '../context/ConnectivityContext';
import useBleRelay from '../hooks/useBleRelay';
import { RELAYER_BASE_URL } from '../config/env';

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

function formatBalanceSource(source) {
  switch (source) {
    case 'relayer':
      return 'Online relayer API';
    case 'relayer-native':
      return 'Relayer native balance';
    case 'acknowledgement':
      return 'Latest transaction acknowledgement';
    case 'protocol-balance':
      return 'Protocol account balance';
    case 'protocol-deposit':
      return 'Protocol deposit balance';
    case 'relayer-cache':
      return 'Cached relayer snapshot';
    case 'unknown':
      return 'Unknown';
    default:
      return source;
  }
}

function extractBalanceFromSnapshot(snapshot) {
  if (!snapshot) {
    return {
      amount: '0.0',
      symbol: 'FLOW',
      source: 'unknown',
      timestamp: null,
      flowDeposit: null,
      nativeBalance: null,
    };
  }

  const timestampMs = snapshot.timestamp ? snapshot.timestamp * 1000 : Date.now();
  const nativeBalanceEther = snapshot.nativeBalance?.ether
    ?? snapshot.nativeBalanceEther
    ?? (snapshot.nativeBalanceWei ? ethers.utils.formatEther(snapshot.nativeBalanceWei) : null);

  let protocolAccount = snapshot.protocolAccount || null;
  if (protocolAccount && typeof protocolAccount === 'string') {
    try {
      protocolAccount = JSON.parse(protocolAccount);
    } catch {
      protocolAccount = null;
    }
  }

  const protocolBalanceEther = protocolAccount?.balanceEther
    ?? (protocolAccount?.balanceWei ? ethers.utils.formatEther(protocolAccount.balanceWei) : null);
  const protocolDepositEther = protocolAccount?.flowDepositEther
    ?? (protocolAccount?.flowDepositWei ? ethers.utils.formatEther(protocolAccount.flowDepositWei) : null);

  if (protocolBalanceEther && protocolBalanceEther !== '0' && protocolBalanceEther !== '0.0') {
    return {
      amount: protocolBalanceEther,
      symbol: 'FLOW',
      source: 'protocol-balance',
      timestamp: timestampMs,
      flowDeposit: protocolDepositEther,
      nativeBalance: nativeBalanceEther,
    };
  }

  if (protocolDepositEther && protocolDepositEther !== '0' && protocolDepositEther !== '0.0') {
    return {
      amount: protocolDepositEther,
      symbol: 'FLOW',
      source: 'protocol-deposit',
      timestamp: timestampMs,
      flowDeposit: protocolDepositEther,
      nativeBalance: nativeBalanceEther,
    };
  }

  if (nativeBalanceEther) {
    return {
      amount: nativeBalanceEther,
      symbol: 'FLOW',
      source: 'relayer-native',
      timestamp: timestampMs,
      flowDeposit: protocolDepositEther,
      nativeBalance: nativeBalanceEther,
    };
  }

  return {
    amount: '0.0',
    symbol: 'FLOW',
    source: 'relayer-cache',
    timestamp: timestampMs,
    flowDeposit: protocolDepositEther,
    nativeBalance: nativeBalanceEther,
  };
}

export default function HomeScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState('0.000');
  const [balanceSource, setBalanceSource] = useState('unknown');
  const [lastBalanceUpdatedAt, setLastBalanceUpdatedAt] = useState(null);
  const [tokenSymbol, setTokenSymbol] = useState('FLOW');
  const [flowDeposit, setFlowDeposit] = useState(null);
  const [acks, setAcks] = useState([]);
  const [loading, setLoading] = useState(true);
  const connectivity = useConnectivity();
  const bleRelay = useBleRelay({ autoStart: true });

  const applySnapshotToState = useCallback((snapshot, sourceOverride) => {
    const parsed = extractBalanceFromSnapshot(snapshot);
    setBalance(parsed.amount);
    setTokenSymbol(parsed.symbol);
    setBalanceSource(sourceOverride || parsed.source);
    setLastBalanceUpdatedAt(parsed.timestamp || Date.now());
    setFlowDeposit(parsed.flowDeposit);
  }, []);

  const tryLoadCachedSnapshot = useCallback(async (address) => {
    try {
      const snapshot = await fetchLatestBalanceSnapshot(address);
      if (snapshot) {
        applySnapshotToState(snapshot, snapshot.dataSource || 'relayer-cache');
      }
    } catch (error) {
      console.warn('Failed to load cached balance snapshot:', error);
    }
  }, [applySnapshotToState]);

  const fetchBalanceFromBackend = useCallback(async (address) => {
    try {
      const url = `${RELAYER_BASE_URL}/balance?walletAddress=${address}`;
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const snapshot = await response.json();
      applySnapshotToState(snapshot, 'relayer');

      try {
        await upsertBalanceSnapshot(snapshot);
        await purgeOldBalanceSnapshots(Math.floor(Date.now() / 1000) - 600); // keep last 10 minutes
      } catch (cacheError) {
        console.warn('Failed to cache balance snapshot:', cacheError);
      }
    } catch (error) {
      console.error('Failed to fetch balance from relayer:', error);
      await tryLoadCachedSnapshot(address);
    }
  }, [tryLoadCachedSnapshot]);

  const refreshBalance = useCallback(async (address, acknowledgements = []) => {
    if (!address) return;

    const isOnline = connectivity.isConnected && connectivity.isInternetReachable;

    if (isOnline) {
      await fetchBalanceFromBackend(address);
      return;
    }

    if (acknowledgements.length > 0) {
      const latestAck = acknowledgements[0]; // Already sorted desc
      const newBalances = JSON.parse(latestAck.newBalances);
      const userBalance = newBalances[address];
      if (userBalance) {
        setBalance(userBalance);
        setBalanceSource('acknowledgement');
        setTokenSymbol('FLOW');
        setFlowDeposit(null);
        setLastBalanceUpdatedAt(Date.now());
      }
    }

    await tryLoadCachedSnapshot(address);
  }, [connectivity.isConnected, connectivity.isInternetReachable, fetchBalanceFromBackend, tryLoadCachedSnapshot]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedWallet = await fetchWallet();
      if (fetchedWallet) {
        setWallet(fetchedWallet);
        const fetchedAcks = await fetchAcks();
        setAcks(fetchedAcks);

        await refreshBalance(fetchedWallet.address, fetchedAcks);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [refreshBalance]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (!wallet?.address) return;
    refreshBalance(wallet.address, acks);
  }, [acks, wallet?.address, refreshBalance]);

  useEffect(() => {
    if (!wallet?.address) return;
    refreshBalance(wallet.address, acks);
  }, [connectivity.isConnected, connectivity.isInternetReachable, wallet?.address, acks, refreshBalance]);

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
        <Text style={styles.balance}>{balance} {tokenSymbol}</Text>
        <Text style={styles.balanceMeta}>Source: {formatBalanceSource(balanceSource)}</Text>
        <Text style={styles.balanceMeta}>
          Last update: {lastBalanceUpdatedAt ? new Date(lastBalanceUpdatedAt).toLocaleString() : '—'}
        </Text>
        {flowDeposit ? (
          <Text style={styles.balanceMeta}>
            Protocol deposit: {flowDeposit} {tokenSymbol}
          </Text>
        ) : null}
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
  balanceMeta: { fontSize: 12, color: '#4b5563', marginTop: 4 },
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