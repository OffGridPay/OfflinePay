import React, { useState, useEffect, useMemo } from "react"
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Alert, 
  Share, 
  Platform, 
  PermissionsAndroid,
  RefreshControl,
  Dimensions
} from "react-native"
import useBleRelay from "../hooks/useBleRelay"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import { theme } from "../theme"
import { bleLogger } from "../utils/BleLogger"

const { width } = Dimensions.get('window');

export default function BleDebugScreen() {
  const [logs, setLogs] = useState([]);
  const [permissionStatus, setPermissionStatus] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLogLevel, setSelectedLogLevel] = useState('all');
  
  const bleRelay = useBleRelay({ 
    logger: bleLogger.createContextLogger('DEBUG-SCREEN') 
  });

  // Subscribe to real-time logs
  useEffect(() => {
    const unsubscribe = bleLogger.subscribe((log) => {
      setLogs(prev => [log, ...prev.slice(0, 199)]); // Keep last 200 logs
    });
    
    // Load initial logs
    setLogs(bleLogger.getRecentLogs(100));
    
    return unsubscribe;
  }, []);

  // Check permission status on mount and refresh
  const checkPermissions = async () => {
    if (Platform.OS !== 'android') {
      setPermissionStatus({ platform: 'iOS', status: 'Not Required' });
      return;
    }

    try {
      const permissions = Platform.Version >= 31 ? [
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.BLUETOOTH_SCAN', 
        'android.permission.BLUETOOTH_ADVERTISE',
        'android.permission.ACCESS_FINE_LOCATION',
      ] : [
        'android.permission.ACCESS_FINE_LOCATION',
      ];

      const results = {};
      for (const permission of permissions) {
        try {
          const granted = await PermissionsAndroid.check(permission);
          results[permission] = granted ? 'granted' : 'denied';
        } catch (error) {
          results[permission] = 'error';
        }
      }

      setPermissionStatus({
        platform: `Android ${Platform.Version}`,
        apiLevel: Platform.Version,
        permissions: results,
        allGranted: Object.values(results).every(status => status === 'granted'),
      });
    } catch (error) {
      setPermissionStatus({ error: error.message });
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await checkPermissions();
    // Refresh BLE state if possible
    if (bleRelay.service?.manager) {
      try {
        if (!bleRelay.isScanning) {
          bleRelay.startScanning();
        }
      } catch (error) {
        bleLogger.error('DEBUG-REFRESH', 'Failed to refresh BLE scan', error);
      }
    }
    setRefreshing(false);
  };

  const exportLogs = async () => {
    try {
      const logData = bleLogger.exportLogs();
      const logText = `OfflinePay BLE Debug Log
Platform: ${logData.platform} ${Platform.Version}
Generated: ${logData.timestamp}
Total Logs: ${logData.logs.length}

${logData.text}`;

      await Share.share({
        message: logText,
        title: 'BLE Debug Logs',
      });
    } catch (error) {
      Alert.alert('Export Failed', error.message);
    }
  };

  const clearLogs = () => {
    Alert.alert(
      'Clear Logs',
      'This will clear all BLE debug logs. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => {
          bleLogger.clear();
          setLogs([]);
        }},
      ]
    );
  };

  const requestPermissions = async () => {
    if (bleRelay.service?.requestBlePermissions) {
      const granted = await bleRelay.service.requestBlePermissions();
      await checkPermissions();
      
      if (granted) {
        Alert.alert('Success', 'All BLE permissions granted');
      } else {
        Alert.alert('Permission Denied', 'Some BLE permissions were denied. BLE functionality may not work properly.');
      }
    }
  };

  const filteredLogs = useMemo(() => {
    if (selectedLogLevel === 'all') return logs;
    return logs.filter(log => log.level === selectedLogLevel.toUpperCase());
  }, [logs, selectedLogLevel]);

  const renderPermissionStatus = () => (
    <CustomCard style={styles.statusCard}>
      <Text style={styles.sectionTitle}>🔐 Permission Status</Text>
      <Text style={styles.statusDetail}>
        Platform: {permissionStatus.platform || 'Unknown'}
      </Text>
      
      {permissionStatus.permissions && (
        <View style={styles.permissionList}>
          {Object.entries(permissionStatus.permissions).map(([permission, status]) => (
            <View key={permission} style={styles.permissionRow}>
              <Text style={styles.permissionName}>
                {permission.split('.').pop()}
              </Text>
              <Text style={[
                styles.permissionStatus,
                status === 'granted' ? styles.granted : styles.denied
              ]}>
                {status}
              </Text>
            </View>
          ))}
        </View>
      )}
      
      {permissionStatus.allGranted === false && (
        <CustomButton
          title="Request Permissions"
          onPress={requestPermissions}
          style={styles.permissionButton}
        />
      )}
    </CustomCard>
  );

  const renderBleStatus = () => (
    <CustomCard style={styles.statusCard}>
      <Text style={styles.sectionTitle}>📡 BLE Status</Text>
      
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Service:</Text>
        <Text style={[styles.statusValue, bleRelay.isSupported ? styles.success : styles.error]}>
          {bleRelay.isSupported ? 'Supported' : 'Not Supported'}
        </Text>
      </View>
      
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Initialized:</Text>
        <Text style={[styles.statusValue, bleRelay.isInitialized ? styles.success : styles.warning]}>
          {bleRelay.isInitialized ? 'Yes' : 'No'}
        </Text>
      </View>
      
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Scanning:</Text>
        <Text style={[styles.statusValue, bleRelay.isScanning ? styles.success : styles.neutral]}>
          {bleRelay.isScanning ? 'Active' : 'Inactive'}
        </Text>
      </View>
      
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Relayers Found:</Text>
        <Text style={styles.statusValue}>
          {bleRelay.relayerPeers?.length || 0}
        </Text>
      </View>
      
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Selected Relayer:</Text>
        <Text style={styles.statusValue}>
          {bleRelay.selectedRelayer?.name || 'None'}
        </Text>
      </View>
      
      {bleRelay.error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Error:</Text>
          <Text style={styles.errorText} selectable>{bleRelay.error}</Text>
        </View>
      )}
    </CustomCard>
  );

  const renderDeviceList = () => (
    <CustomCard style={styles.statusCard}>
      <Text style={styles.sectionTitle}>📱 Discovered Devices</Text>
      
      {bleRelay.peers?.length > 0 ? (
        bleRelay.peers.map((device, index) => (
          <View key={device.id || index} style={styles.deviceCard}>
      <Text style={styles.deviceName} selectable>
              {device.name || 'Unknown Device'}
            </Text>
            <Text style={styles.deviceDetail}>
              ID: {device.id?.slice(0, 12)}...
      </Text>
      <Text style={styles.deviceDetail}>
              RSSI: {device.rssi || 'N/A'} dBm
      </Text>
      <Text style={styles.deviceDetail}>
              Role: {device.role & 0x04 ? '🔄 Relayer' : 
                     device.role & 0x02 ? '🌐 Online' : '📱 Offline'}
      </Text>
            {device.lastSeen && (
              <Text style={styles.deviceDetail}>
                Last seen: {new Date(device.lastSeen).toLocaleTimeString()}
        </Text>
            )}
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>No devices discovered</Text>
      )}
    </CustomCard>
  );

  const renderLogControls = () => (
    <View style={styles.logControls}>
      <View style={styles.logFilters}>
        {['all', 'error', 'warn', 'info', 'debug'].map(level => (
          <CustomButton
            key={level}
            title={level.toUpperCase()}
            variant={selectedLogLevel === level ? 'solid' : 'outline'}
            onPress={() => setSelectedLogLevel(level)}
            style={styles.filterButton}
          />
        ))}
      </View>
      
      <View style={styles.logActions}>
        <CustomButton
          title="Export"
          onPress={exportLogs}
          variant="outline"
          style={styles.actionButton}
        />
        <CustomButton
          title="Clear"
          onPress={clearLogs}
          variant="outline"
          style={styles.actionButton}
        />
      </View>
        </View>
  );

  const renderLogs = () => (
    <CustomCard style={[styles.statusCard, styles.logsCard]}>
      <Text style={styles.sectionTitle}>
        📝 Debug Logs ({filteredLogs.length})
      </Text>
      
      <ScrollView style={styles.logScrollView} nestedScrollEnabled>
        {filteredLogs.map((log) => (
          <View key={log.id} style={[styles.logEntry, styles[`log${log.level}`]]}>
            <Text style={styles.logTimestamp}>
              {new Date(log.timestamp).toLocaleTimeString()}
            </Text>
            <Text style={styles.logTag}>[{log.tag}]</Text>
            <Text style={styles.logMessage} selectable>
              {log.message}
            </Text>
            {log.data && (
              <Text style={styles.logData} selectable>
                {log.data}
              </Text>
            )}
          </View>
        ))}
        
        {filteredLogs.length === 0 && (
          <Text style={styles.emptyText}>No logs to display</Text>
        )}
      </ScrollView>
      </CustomCard>
  );

  const renderControls = () => (
    <CustomCard style={styles.controlsCard}>
      <Text style={styles.sectionTitle}>🎛 Controls</Text>
      
      <View style={styles.controlRow}>
        <CustomButton
          title={bleRelay.isScanning ? "Stop Scan" : "Start Scan"}
          onPress={bleRelay.isScanning ? bleRelay.stopScanning : bleRelay.startScanning}
          disabled={!bleRelay.isInitialized}
          style={styles.controlButton}
        />
        
        <CustomButton
          title="Refresh"
          onPress={onRefresh}
          variant="outline"
          style={styles.controlButton}
        />
          </View>
      </CustomCard>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.title}>BLE Debug Dashboard</Text>
      
      {renderPermissionStatus()}
      {renderBleStatus()}
      {renderDeviceList()}
      {renderControls()}
      {renderLogControls()}
      {renderLogs()}
      
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Build: {Platform.OS} {Platform.Version} • 
          Logs: {logs.length} • 
          {__DEV__ ? 'Development' : 'Production'}
              </Text>
            </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.text,
    textAlign: 'center',
    marginVertical: theme.spacing.lg,
  },
  statusCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  statusDetail: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  permissionList: {
    marginTop: theme.spacing.sm,
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  permissionName: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.text,
    flex: 1,
  },
  permissionStatus: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: 'bold',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  granted: {
    color: theme.colors.success,
    backgroundColor: theme.colors.success + '20',
  },
  denied: {
    color: theme.colors.error,
    backgroundColor: theme.colors.error + '20',
  },
  permissionButton: {
    marginTop: theme.spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  statusLabel: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
  },
  statusValue: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '500',
  },
  success: {
    color: theme.colors.success,
  },
  warning: {
    color: theme.colors.warning,
  },
  error: {
    color: theme.colors.error,
  },
  neutral: {
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.error + '10',
    borderRadius: theme.borderRadius.sm,
  },
  errorTitle: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: 'bold',
    color: theme.colors.error,
  },
  errorText: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  deviceCard: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  deviceName: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  deviceDetail: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  emptyText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: theme.spacing.lg,
  },
  controlsCard: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  controlButton: {
    flex: 0.45,
  },
  logControls: {
    margin: theme.spacing.md,
  },
  logFilters: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.md,
  },
  filterButton: {
    flex: 0.18,
    minWidth: 0,
  },
  logActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    flex: 0.4,
  },
  logsCard: {
    maxHeight: 400,
  },
  logScrollView: {
    maxHeight: 300,
  },
  logEntry: {
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    borderLeftWidth: 2,
  },
  logDEBUG: {
    backgroundColor: theme.colors.textSecondary + '10',
    borderLeftColor: theme.colors.textSecondary,
  },
  logINFO: {
    backgroundColor: theme.colors.primary + '10',
    borderLeftColor: theme.colors.primary,
  },
  logWARN: {
    backgroundColor: theme.colors.warning + '10',
    borderLeftColor: theme.colors.warning,
  },
  logERROR: {
    backgroundColor: theme.colors.error + '10',
    borderLeftColor: theme.colors.error,
  },
  logTimestamp: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  logTag: {
    fontSize: 11,
    fontWeight: 'bold',
    color: theme.colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  logMessage: {
    fontSize: 12,
    color: theme.colors.text,
    marginTop: 2,
  },
  logData: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 2,
  },
  footer: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});