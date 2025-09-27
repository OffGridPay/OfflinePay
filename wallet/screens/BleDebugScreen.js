import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Button } from 'react-native';
import useBleStackDemo from '../hooks/useBleStackDemo';

const renderDevice = ({ item }) => (
  <View style={styles.deviceCard}>
    <Text style={styles.deviceName} selectable>{item.name} ({item.id})</Text>
    <Text style={styles.deviceDetail}>RSSI: {item.rssi ?? 'n/a'}</Text>
    <Text style={styles.deviceDetail}>MTU: {item.mtu ?? 'n/a'}</Text>
    <Text style={styles.deviceDetail}>Service UUIDs: {item.serviceUUIDs?.join(', ') || '—'}</Text>
    {item.manufacturerData ? (
      <Text style={styles.deviceDetail}>Manufacturer: {item.manufacturerData}</Text>
    ) : null}
  </View>
);

function Header({ status, adapterState, error, onReset }) {
  const statusText = useMemo(() => {
    switch (status) {
      case 'scanning':
        return 'Scanning for nearby devices…';
      case 'unsupported':
        return 'BLE not supported in current build/runtime';
      default:
        return 'Idle';
    }
  }, [status]);

  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>BLE Demo</Text>
      <Text style={styles.headerSubtitle}>Status: {statusText}</Text>
      <Text style={styles.headerSubtitle}>Adapter State: {adapterState}</Text>
      {error ? <Text style={styles.errorText}>Error: {error}</Text> : null}
      <Button title="Reset" onPress={onReset} />
    </View>
  );
}

export default function BleDebugScreen() {
  const ble = useBleStackDemo({ autoStart: false });

  return (
    <View style={styles.container}>
      <Header status={ble.status} adapterState={ble.adapterState} error={ble.error} onReset={ble.reset} />
      <View style={styles.actionsRow}>
        <Button title="Start Scan" onPress={ble.startScan} disabled={!ble.isSupported || ble.status === 'scanning'} />
        <Button title="Stop Scan" onPress={ble.stopScan} disabled={ble.status !== 'scanning'} />
      </View>
      <FlatList
        data={ble.devices}
        keyExtractor={(item) => item.id}
        renderItem={renderDevice}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>No devices discovered yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#cbd5f5',
    marginBottom: 4,
  },
  errorText: {
    color: '#f87171',
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#0f172a',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  deviceCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  deviceName: {
    color: '#f8fafc',
    fontWeight: '600',
    marginBottom: 8,
  },
  deviceDetail: {
    color: '#cbd5f5',
    fontSize: 12,
    marginBottom: 4,
  },
  emptyText: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 40,
  },
});

