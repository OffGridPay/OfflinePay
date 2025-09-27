import React, { useState } from "react"
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native"
import useWalletBle from "../hooks/useWalletBle"
import { DEVICE_STATES } from "../services/WalletBleService"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import { theme } from "../theme"

function WalletDeviceCard({ device, onConnect, onDisconnect, isConnected, onSendData }) {
  const getSourceColor = (source) => {
    switch (source) {
      case 'ble_manager':
        return theme.colors.success || '#4CAF50'
      case 'ble_advertiser':
        return theme.colors.info || '#2196F3'
      default:
        return theme.colors.textSecondary || '#757575'
    }
  }

  const getSourceLabel = (source) => {
    switch (source) {
      case 'ble_manager':
        return "🔍 Scanner"
      case 'ble_advertiser':
        return "📡 Advertiser"
      default:
        return "❓ Unknown"
    }
  }

  return (
    <CustomCard style={styles.deviceCard}>
      <View style={styles.deviceHeader}>
        <Text style={styles.deviceName} selectable>
          {device.name}
        </Text>
        <Text style={[styles.deviceType, { color: getSourceColor(device.source) }]}>
          {getSourceLabel(device.source)}
        </Text>
      </View>
      
      <Text style={styles.deviceDetail}>💳 Wallet App Device</Text>
      <Text style={styles.deviceDetail}>ID: {device.id.slice(0, 20)}...</Text>
      <Text style={styles.deviceDetail}>Signal: {device.rssi ?? "n/a"} dBm</Text>
      <Text style={styles.deviceDetail}>
        Connectable: {device.isConnectable ? "Yes" : "No"}
      </Text>
      <Text style={styles.deviceDetail}>
        Discovery: {getSourceLabel(device.source)}
      </Text>
      <Text style={styles.deviceDetail}>
        Last seen: {new Date(device.lastSeen).toLocaleTimeString()}
      </Text>
      
      <View style={styles.deviceActions}>
        {isConnected ? (
          <>
            <CustomButton
              title="Disconnect"
              onPress={() => onDisconnect(device.id)}
              variant="outline"
              style={styles.deviceButton}
            />
            <CustomButton
              title="Send Data"
              onPress={() => onSendData(device.id)}
              style={styles.deviceButton}
            />
          </>
        ) : (
          <CustomButton
            title="Connect"
            onPress={() => onConnect(device.id)}
            disabled={!device.isConnectable}
            style={styles.deviceButton}
          />
        )}
      </View>
    </CustomCard>
  )
}

function Header({ state, isAdvertising, isScanning, error, onStartAdvertising, onStopAdvertising, onStartScanning, onStopScanning, onStartBoth, onStopBoth, onClear }) {
  const getStateColor = (state) => {
    switch (state) {
      case DEVICE_STATES.READY:
      case DEVICE_STATES.BOTH:
        return theme.colors.success || '#4CAF50'
      case DEVICE_STATES.ADVERTISING:
      case DEVICE_STATES.SCANNING:
        return theme.colors.info || '#2196F3'
      case DEVICE_STATES.BLUETOOTH_OFF:
      case DEVICE_STATES.ERROR:
        return theme.colors.error || '#F44336'
      default:
        return theme.colors.warning || '#FF9800'
    }
  }

  const getStateLabel = (state) => {
    switch (state) {
      case DEVICE_STATES.READY:
        return "Ready"
      case DEVICE_STATES.ADVERTISING:
        return "📡 Advertising"
      case DEVICE_STATES.SCANNING:
        return "🔍 Scanning"
      case DEVICE_STATES.BOTH:
        return "📡🔍 Both Active"
      case DEVICE_STATES.BLUETOOTH_OFF:
        return "Bluetooth Off"
      case DEVICE_STATES.ERROR:
        return "Error"
      default:
        return state
    }
  }

  return (
    <CustomCard style={styles.header}>
      <Text style={styles.headerTitle}>Wallet BLE Discovery</Text>
      <Text style={styles.headerSubtitle}>
        Status: <Text style={{ color: getStateColor(state) }}>{getStateLabel(state)}</Text>
      </Text>
      <Text style={styles.headerSubtitle}>
        Advertising: {isAdvertising ? "📡 Active" : "⏸️ Inactive"} | 
        Scanning: {isScanning ? "🔍 Active" : "⏸️ Inactive"}
      </Text>
      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}
      
      <View style={styles.headerActions}>
        <CustomButton
          title="Start Both"
          onPress={onStartBoth}
          disabled={state === DEVICE_STATES.BLUETOOTH_OFF || state === DEVICE_STATES.BOTH}
          style={styles.headerButton}
        />
        <CustomButton
          title="Stop All"
          onPress={onStopBoth}
          disabled={!isAdvertising && !isScanning}
          variant="outline"
          style={styles.headerButton}
        />
      </View>
      
      <View style={styles.headerActions}>
        <CustomButton
          title={isAdvertising ? "Stop Ads" : "Advertise"}
          onPress={isAdvertising ? onStopAdvertising : onStartAdvertising}
          disabled={state === DEVICE_STATES.BLUETOOTH_OFF}
          variant={isAdvertising ? "outline" : "secondary"}
          style={styles.headerButton}
        />
        <CustomButton
          title={isScanning ? "Stop Scan" : "Scan"}
          onPress={isScanning ? onStopScanning : onStartScanning}
          disabled={state === DEVICE_STATES.BLUETOOTH_OFF}
          variant={isScanning ? "outline" : "secondary"}
          style={styles.headerButton}
        />
      </View>
      
      <View style={styles.headerActions}>
        <CustomButton
          title="Clear"
          onPress={onClear}
          variant="outline"
          style={styles.headerButton}
        />
      </View>
    </CustomCard>
  )
}

export default function BleDebugScreen() {
  const walletBle = useWalletBle({ autoStart: false })
  const [testMessage, setTestMessage] = useState("Hello from wallet app!")

  const handleConnect = async (deviceId) => {
    try {
      await walletBle.connectToWalletDevice(deviceId)
      Alert.alert("Success", "Connected to wallet device successfully!")
    } catch (error) {
      Alert.alert("Connection Failed", error.message)
    }
  }

  const handleDisconnect = async (deviceId) => {
    try {
      // Note: Disconnect functionality needs to be added to WalletBleService
      Alert.alert("Info", "Disconnect functionality coming soon")
    } catch (error) {
      Alert.alert("Disconnect Failed", error.message)
    }
  }

  const handleSendData = async (deviceId) => {
    Alert.prompt(
      "Send Data to Wallet",
      "Enter message to send to wallet device:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async (message) => {
            if (message) {
              try {
                await walletBle.sendDataToWalletDevice(deviceId, message)
                Alert.alert("Success", "Data sent to wallet device successfully!")
              } catch (error) {
                Alert.alert("Send Failed", error.message)
              }
            }
          }
        }
      ],
      "plain-text",
      testMessage
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Header
        state={walletBle.state}
        isAdvertising={walletBle.isAdvertising}
        isScanning={walletBle.isScanning}
        error={walletBle.error}
        onStartAdvertising={walletBle.startAdvertising}
        onStopAdvertising={walletBle.stopAdvertising}
        onStartScanning={walletBle.startScanning}
        onStopScanning={walletBle.stopScanning}
        onStartBoth={walletBle.startBoth}
        onStopBoth={walletBle.stopBoth}
        onClear={walletBle.clearDiscoveredDevices}
      />

      {/* Wallet Devices Section */}
      <Text style={styles.sectionTitle}>💳 Wallet App Devices ({walletBle.deviceCount})</Text>
      {walletBle.discoveredWalletDevices.length === 0 ? (
        <CustomCard>
          <Text style={styles.emptyText}>
            No wallet devices found. Start advertising and scanning to discover nearby wallet app users.
          </Text>
          <Text style={styles.emptyText}>
            📡 Advertising makes your device discoverable to other wallet apps
          </Text>
          <Text style={styles.emptyText}>
            🔍 Scanning finds other devices running the wallet app
          </Text>
        </CustomCard>
      ) : (
        <View style={styles.devicesContainer}>
          {walletBle.discoveredWalletDevices.map((device) => (
            <WalletDeviceCard
              key={device.id}
              device={device}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSendData={handleSendData}
              isConnected={walletBle.isWalletDeviceConnected(device.id)}
            />
          ))}
        </View>
      )}

      {/* Connected Wallet Devices Section */}
      {walletBle.connectedWalletDevices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🔗 Connected Wallet Devices ({walletBle.connectionCount})</Text>
          <CustomCard>
            {walletBle.connectedWalletDevices.map((conn) => (
              <View key={conn.deviceId} style={styles.connectedDevice}>
                <Text style={styles.deviceName}>{conn.walletDevice.name}</Text>
                <Text style={styles.deviceDetail}>
                  Connected: {new Date(conn.connectedAt).toLocaleTimeString()}
                </Text>
                <Text style={styles.deviceDetail}>
                  Services: {conn.connectionInfo.services.length}
                </Text>
                <Text style={styles.deviceDetail}>
                  Discovery: {conn.walletDevice.source}
                </Text>
              </View>
            ))}
          </CustomCard>
        </>
      )}

      {/* Instructions Section */}
      <CustomCard>
        <Text style={styles.sectionTitle}>📝 How It Works</Text>
        <Text style={styles.deviceDetail}>• Only devices with this wallet app will be discovered</Text>
        <Text style={styles.deviceDetail}>• Start "Both" to advertise and scan simultaneously</Text>
        <Text style={styles.deviceDetail}>• Advertising makes you visible to other wallet apps</Text>
        <Text style={styles.deviceDetail}>• Scanning finds other wallet app users nearby</Text>
        <Text style={styles.deviceDetail}>• Tap "Connect" to establish secure connection</Text>
        <Text style={styles.deviceDetail}>• Use "Send Data" to share information</Text>
      </CustomCard>

      {/* Stats Section */}
      <CustomCard>
        <Text style={styles.sectionTitle}>📊 Statistics</Text>
        <Text style={styles.deviceDetail}>BLE State: {walletBle.state}</Text>
        <Text style={styles.deviceDetail}>Advertising: {walletBle.isAdvertising ? 'Active' : 'Inactive'}</Text>
        <Text style={styles.deviceDetail}>Scanning: {walletBle.isScanning ? 'Active' : 'Inactive'}</Text>
        <Text style={styles.deviceDetail}>Wallet devices found: {walletBle.deviceCount}</Text>
        <Text style={styles.deviceDetail}>Connected devices: {walletBle.connectionCount}</Text>
        <Text style={styles.deviceDetail}>Bluetooth ready: {walletBle.isBluetoothReady ? 'Yes' : 'No'}</Text>
      </CustomCard>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: theme.spacing.md,
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  headerTitle: {
    fontSize: theme.typography.h2.fontSize,
    fontWeight: theme.typography.h2.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  headerSubtitle: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  headerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.lg,
  },
  headerButton: {
    flex: 0.48,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.caption.fontSize,
    marginTop: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  devicesContainer: {
    marginBottom: theme.spacing.lg,
  },
  deviceCard: {
    marginBottom: theme.spacing.md,
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  deviceName: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: "600",
    color: theme.colors.text,
    flex: 1,
  },
  deviceType: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: "500",
  },
  deviceDetail: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  deviceActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.md,
  },
  deviceButton: {
    flex: 0.48,
  },
  connectedDevice: {
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border || '#e0e0e0',
  },
  emptyText: {
    textAlign: "center",
    color: theme.colors.textSecondary,
    padding: theme.spacing.xl,
    fontStyle: "italic",
  },
})
