import React, { useState } from "react"
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native"
import useSimpleBle from "../hooks/useSimpleBle"
import { DEVICE_TYPES } from "../services/SimpleBleService"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import { theme } from "../theme"

function DeviceCard({ device, onConnect, onDisconnect, isConnected, onSendData }) {
  const getDeviceTypeColor = (type) => {
    switch (type) {
      case DEVICE_TYPES.PHONE:
        return theme.colors.success
      case DEVICE_TYPES.OTHER:
        return theme.colors.warning
      default:
        return theme.colors.textSecondary
    }
  }

  const getDeviceTypeLabel = (type) => {
    switch (type) {
      case DEVICE_TYPES.PHONE:
        return "📱 Phone"
      case DEVICE_TYPES.OTHER:
        return "🔧 Device"
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
        <Text style={[styles.deviceType, { color: getDeviceTypeColor(device.type) }]}>
          {getDeviceTypeLabel(device.type)}
        </Text>
      </View>
      
      <Text style={styles.deviceDetail}>ID: {device.id.slice(0, 20)}...</Text>
      <Text style={styles.deviceDetail}>Signal: {device.rssi ?? "n/a"} dBm</Text>
      <Text style={styles.deviceDetail}>
        Connectable: {device.isConnectable ? "Yes" : "No"}
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

function Header({ bluetoothState, isScanning, error, onStartScan, onStopScan, onClear }) {
  const getStateColor = (state) => {
    switch (state) {
      case 'PoweredOn':
        return theme.colors.success
      case 'PoweredOff':
        return theme.colors.error
      default:
        return theme.colors.warning
    }
  }

  return (
    <CustomCard style={styles.header}>
      <Text style={styles.headerTitle}>BLE Device Scanner</Text>
      <Text style={styles.headerSubtitle}>
        Bluetooth: <Text style={{ color: getStateColor(bluetoothState) }}>{bluetoothState}</Text>
      </Text>
      <Text style={styles.headerSubtitle}>
        Status: {isScanning ? "🔍 Scanning..." : "⏸️ Idle"}
      </Text>
      {error && <Text style={styles.errorText}>⚠️ {error}</Text>}
      
      <View style={styles.headerActions}>
        <CustomButton
          title={isScanning ? "Stop Scan" : "Start Scan"}
          onPress={isScanning ? onStopScan : onStartScan}
          disabled={bluetoothState !== 'PoweredOn'}
          variant={isScanning ? "outline" : "primary"}
          style={styles.headerButton}
        />
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
  const ble = useSimpleBle({ autoStart: false })
  const [testMessage, setTestMessage] = useState("Hello from wallet app!")

  const handleConnect = async (deviceId) => {
    try {
      await ble.connectToDevice(deviceId)
      Alert.alert("Success", "Connected to device successfully!")
    } catch (error) {
      Alert.alert("Connection Failed", error.message)
    }
  }

  const handleDisconnect = async (deviceId) => {
    try {
      await ble.disconnectFromDevice(deviceId)
      Alert.alert("Success", "Disconnected from device")
    } catch (error) {
      Alert.alert("Disconnect Failed", error.message)
    }
  }

  const handleSendData = async (deviceId) => {
    Alert.prompt(
      "Send Data",
      "Enter message to send:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async (message) => {
            if (message) {
              try {
                await ble.sendData(deviceId, message)
                Alert.alert("Success", "Data sent successfully!")
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

  const isDeviceConnected = (deviceId) => {
    return ble.connectedDevices.some(conn => conn.deviceId === deviceId)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Header
        bluetoothState={ble.bluetoothState}
        isScanning={ble.isScanning}
        error={ble.error}
        onStartScan={ble.startScanning}
        onStopScan={ble.stopScanning}
        onClear={ble.clearDiscoveredDevices}
      />

      {/* Phone Devices Section */}
      <Text style={styles.sectionTitle}>📱 Phone Devices ({ble.phoneDevices.length})</Text>
      {ble.phoneDevices.length === 0 ? (
        <CustomCard>
          <Text style={styles.emptyText}>No phone devices found. Start scanning to discover nearby phones.</Text>
        </CustomCard>
      ) : (
        <View style={styles.devicesContainer}>
          {ble.phoneDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSendData={handleSendData}
              isConnected={isDeviceConnected(device.id)}
            />
          ))}
        </View>
      )}

      {/* Other Devices Section */}
      <Text style={styles.sectionTitle}>🔧 Other Devices ({ble.otherDevices.length})</Text>
      {ble.otherDevices.length === 0 ? (
        <CustomCard>
          <Text style={styles.emptyText}>No other devices found.</Text>
        </CustomCard>
      ) : (
        <View style={styles.devicesContainer}>
          {ble.otherDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onSendData={handleSendData}
              isConnected={isDeviceConnected(device.id)}
            />
          ))}
        </View>
      )}

      {/* Connected Devices Section */}
      {ble.connectedDevices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>🔗 Connected Devices ({ble.connectedDevices.length})</Text>
          <CustomCard>
            {ble.connectedDevices.map((conn) => (
              <View key={conn.deviceId} style={styles.connectedDevice}>
                <Text style={styles.deviceName}>{conn.deviceInfo.name}</Text>
                <Text style={styles.deviceDetail}>
                  Connected: {new Date(conn.connectedAt).toLocaleTimeString()}
                </Text>
                <Text style={styles.deviceDetail}>
                  Services: {conn.connectionInfo.services.length}
                </Text>
              </View>
            ))}
          </CustomCard>
        </>
      )}

      {/* Stats Section */}
      <CustomCard>
        <Text style={styles.sectionTitle}>📊 Statistics</Text>
        <Text style={styles.deviceDetail}>Total discovered: {ble.discoveredDevices.length}</Text>
        <Text style={styles.deviceDetail}>Phone devices: {ble.phoneDevices.length}</Text>
        <Text style={styles.deviceDetail}>Other devices: {ble.otherDevices.length}</Text>
        <Text style={styles.deviceDetail}>Connected: {ble.connectedDevices.length}</Text>
        <Text style={styles.deviceDetail}>Bluetooth state: {ble.bluetoothState}</Text>
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
