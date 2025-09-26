import React, { useState, useCallback } from 'react';
import { View, Text, Button, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWallet, fetchAcks } from '../utils/db';
import { ethers } from 'ethers';

export default function HomeScreen({ navigation }) {
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState('0.0');
  const [acks, setAcks] = useState([]);
  const [loading, setLoading] = useState(true);

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
      </View>

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
  historyTitle: { fontSize: 22, fontWeight: 'bold', marginLeft: 10, marginBottom: 10 },
  txList: { flex: 1 },
  txItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  txHash: { flex: 1, fontFamily: 'monospace' },
  txAmount: { fontWeight: 'bold' },
  noTxText: { textAlign: 'center', marginTop: 20, color: '#888' },
});