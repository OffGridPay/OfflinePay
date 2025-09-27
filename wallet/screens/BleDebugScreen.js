import React, { useMemo } from "react"
import { View, Text, StyleSheet, FlatList, ScrollView } from "react-native"
import useBleStackDemo from "../hooks/useBleStackDemo"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import { theme } from "../theme"

function renderDevice({ item }) {
  return (
    <CustomCard style={styles.deviceCard}>
      <Text style={styles.deviceName} selectable>
        {item.name} ({item.id})
      </Text>
      <Text style={styles.deviceDetail}>RSSI: {item.rssi ?? "n/a"}</Text>
      <Text style={styles.deviceDetail}>MTU: {item.mtu ?? "n/a"}</Text>
      <Text style={styles.deviceDetail}>Service UUIDs: {item.serviceUUIDs?.join(", ") || "—"}</Text>
      {item.manufacturerData ? (
        <Text style={styles.deviceDetail}>Manufacturer: {item.manufacturerData}</Text>
      ) : null}
    </CustomCard>
  )
}

function Header({ status, adapterState, error, onReset, supportInfo }) {
  const statusText = useMemo(() => {
    switch (status) {
      case "scanning":
        return "Scanning for nearby devices…"
      case "unsupported":
        return "BLE not supported in current build/runtime"
      default:
        return "Idle"
    }
  }, [status])

  return (
    <CustomCard style={styles.header}>
      <Text style={styles.headerTitle}>BLE Debug</Text>
      <Text style={styles.headerSubtitle}>Status: {statusText}</Text>
      <Text style={styles.headerSubtitle}>Adapter State: {adapterState}</Text>
      {!supportInfo.supported ? (
        <Text style={styles.warningText}>
          {supportInfo.message ||
            "BLE scanning requires a development build (Expo Go not supported)."}
        </Text>
      ) : null}
      {error ? <Text style={styles.errorText}>Error: {error}</Text> : null}
      <CustomButton title="Reset" onPress={onReset} variant="outline" style={styles.resetButton} />
    </CustomCard>
  )
}

export default function BleDebugScreen() {
  const ble = useBleStackDemo({ autoStart: false })

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Header
        status={ble.status}
        adapterState={ble.adapterState}
        error={ble.error}
        onReset={ble.reset}
        supportInfo={ble.supportInfo}
      />
      <View style={styles.actionsRow}>
        <CustomButton
          title="Start Scan"
          onPress={ble.startScan}
          disabled={!ble.isSupported || ble.status === "scanning"}
          style={styles.actionButton}
        />
        <CustomButton
          title="Stop Scan"
          onPress={ble.stopScan}
          disabled={ble.status !== "scanning"}
          variant="outline"
          style={styles.actionButton}
        />
      </View>
      <Text style={styles.sectionTitle}>Discovered Devices</Text>
      {ble.devices.length === 0 ? (
        <CustomCard>
          <Text style={styles.emptyText}>No devices discovered yet.</Text>
        </CustomCard>
      ) : (
        <View style={styles.devicesContainer}>
          {ble.devices.map((device, index) => (
            <View key={device.id}>{renderDevice({ item: device })}</View>
          ))}
        </View>
      )}
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
  warningText: {
    color: theme.colors.warning,
    fontSize: theme.typography.caption.fontSize,
    marginTop: theme.spacing.sm,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.caption.fontSize,
    marginTop: theme.spacing.sm,
  },
  resetButton: {
    marginTop: theme.spacing.lg,
    alignSelf: "flex-start",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.lg,
  },
  actionButton: {
    flex: 0.48,
  },
  sectionTitle: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  devicesContainer: {
    marginBottom: theme.spacing.xl,
  },
  deviceCard: {
    marginBottom: theme.spacing.sm,
  },
  deviceName: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  deviceDetail: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  emptyText: {
    textAlign: "center",
    color: theme.colors.textSecondary,
    padding: theme.spacing.xl,
  },
})
