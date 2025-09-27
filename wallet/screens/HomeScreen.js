import React, { useState, useCallback } from "react"
import { View, Text, StyleSheet, FlatList, ActivityIndicator, ScrollView } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { fetchWallet, fetchAcks } from "../utils/db"
import { ethers } from "ethers"
import { useConnectivity } from "../context/ConnectivityContext"
import useBleRelay from "../hooks/useBleRelay"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import { theme } from "../theme"

export default function HomeScreen({ navigation }) {
  const [wallet, setWallet] = useState(null)
  const [balance, setBalance] = useState("0.000")
  const [acks, setAcks] = useState([])
  const [loading, setLoading] = useState(true)
  const connectivity = useConnectivity()
  const bleRelay = useBleRelay({ autoStart: true })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const fetchedWallet = await fetchWallet()
      if (fetchedWallet) {
        setWallet(fetchedWallet)
        const fetchedAcks = await fetchAcks()
        setAcks(fetchedAcks)

        // Determine balance from the latest ack
        if (fetchedAcks.length > 0) {
          const latestAck = fetchedAcks[0] // DB query is ordered by blockNumber DESC
          const newBalances = JSON.parse(latestAck.newBalances)
          const userBalance = newBalances[fetchedWallet.address]
          setBalance(userBalance || "0.0")
        } else {
          setBalance("0.0") // No transactions yet
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  const renderTxItem = ({ item }) => {
    const isSender = item.fromAddress.toLowerCase() === wallet.address.toLowerCase()
    const value = ethers.utils.formatEther(item.value)
    return (
      <View style={styles.txItem}>
        <View style={styles.txHeader}>
          <Text style={styles.txHash} numberOfLines={1} ellipsizeMode="middle">
            {item.txHash}
          </Text>
          <Text
            style={[
              styles.txAmount,
              { color: isSender ? theme.colors.error : theme.colors.success },
            ]}
          >
            {isSender ? "-" : "+"}
            {value} ETH
          </Text>
        </View>
        <View style={styles.txDetails}>
          <Text style={styles.txDetailText}>
            {isSender
              ? `To: ${item.toAddress.substring(0, 10)}...`
              : `From: ${item.fromAddress.substring(0, 10)}...`}
          </Text>
          <Text style={styles.txDetailText}>Block: {item.blockNumber}</Text>
        </View>
      </View>
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Wallet Header Card */}
      <CustomCard>
        <Text style={styles.addressLabel}>Your Address</Text>
        <Text style={styles.address} selectable numberOfLines={1} ellipsizeMode="middle">
          {wallet ? wallet.address : "Loading..."}
        </Text>
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balance}>{balance} ETH</Text>
        </View>
      </CustomCard>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <CustomButton
          title="Send"
          onPress={() => navigation.navigate("Send")}
          style={styles.actionButton}
        />
        <CustomButton
          title="Scan to Receive"
          onPress={() => navigation.navigate("Scan")}
          variant="outline"
          style={styles.actionButton}
        />
        <CustomButton
          title="BLE Debug"
          onPress={() => navigation.navigate("BleDebug")}
          variant="text"
          style={styles.actionButton}
        />
      </View>

      {/* Connectivity Status Card */}
      <CustomCard
        variant={
          connectivity.isConnected
            ? connectivity.isInternetReachable
              ? "success"
              : "warning"
            : "error"
        }
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Connectivity Status</Text>
          <CustomButton
            title="Refresh"
            onPress={connectivity.triggerHeartbeatCheck}
            variant="text"
            textStyle={{ fontSize: 12 }}
            style={{ padding: 0 }}
          />
        </View>
        <Text style={styles.statusText}>
          {connectivity.isConnected
            ? connectivity.isInternetReachable
              ? "Online Relayer"
              : "Limited Connection"
            : "Offline Device"}
        </Text>
        <Text style={styles.detailText}>Connection: {connectivity.connectionType}</Text>
        <Text style={styles.detailText}>
          Last update:{" "}
          {connectivity.lastChangedAt
            ? new Date(connectivity.lastChangedAt).toLocaleTimeString()
            : "—"}
        </Text>
        {connectivity.heartbeat.url ? (
          <Text style={styles.detailText}>
            Relayer check: {connectivity.heartbeat.status}{" "}
            {connectivity.heartbeat.latencyMs ? `(${connectivity.heartbeat.latencyMs}ms)` : ""}
          </Text>
        ) : (
          <Text style={styles.detailText}>Heartbeat not configured</Text>
        )}
      </CustomCard>

      {/* BLE Relay Card */}
      {bleRelay.isSupported && (
        <CustomCard
          variant={
            bleRelay.relayerRole.canRelay
              ? "success"
              : bleRelay.relayerRole.isOnline
              ? "info"
              : "error"
          }
        >
          <Text style={styles.cardTitle}>BLE Mesh Network</Text>
          <View style={styles.bleStatusRow}>
            <Text style={styles.bleStatusLabel}>Status:</Text>
            <View
              style={[
                styles.bleStatusBadge,
                {
                  backgroundColor: bleRelay.relayerRole.canRelay
                    ? theme.colors.bleActive
                    : bleRelay.relayerRole.isOnline
                    ? theme.colors.bleOnline
                    : theme.colors.bleOffline,
                },
              ]}
            >
              <Text style={styles.bleStatusText}>
                {bleRelay.relayerRole.canRelay
                  ? "Active Relayer"
                  : bleRelay.relayerRole.isOnline
                  ? "Online"
                  : "Offline"}
              </Text>
            </View>
          </View>
          <Text style={styles.detailText}>
            Nearby peers: {bleRelay.peers.length} | Relayers: {bleRelay.relayerPeers.length}
          </Text>
          {bleRelay.error && <Text style={styles.errorText}>Error: {bleRelay.error}</Text>}
          <View style={styles.bleActions}>
            <CustomButton
              title="Start Scan"
              onPress={bleRelay.startScanning}
              disabled={!bleRelay.isInitialized}
              style={styles.bleActionButton}
            />
            <CustomButton
              title="Stop Scan"
              onPress={bleRelay.stopScanning}
              disabled={!bleRelay.isInitialized}
              variant="outline"
              style={styles.bleActionButton}
            />
          </View>
        </CustomCard>
      )}

      {/* Transaction History */}
      <Text style={styles.historyTitle}>Transaction History</Text>
      {acks.length === 0 ? (
        <CustomCard>
          <Text style={styles.noTxText}>No transactions yet.</Text>
        </CustomCard>
      ) : (
        <View style={styles.txList}>
          {acks.map((item, index) => (
            <CustomCard key={item.id} style={index === 0 ? styles.latestTxCard : {}}>
              {renderTxItem({ item })}
            </CustomCard>
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  addressLabel: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  address: {
    fontSize: theme.typography.caption.fontSize,
    fontFamily: "monospace",
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: "center",
  },
  balanceContainer: {
    alignItems: "center",
  },
  balanceLabel: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  balance: {
    fontSize: 36,
    fontWeight: "bold",
    color: theme.colors.text,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: theme.spacing.lg,
  },
  actionButton: {
    flex: 1,
    marginHorizontal: theme.spacing.xs,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    color: theme.colors.text,
  },
  statusText: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  detailText: {
    fontSize: theme.typography.small.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  bleStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  bleStatusLabel: {
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
    fontSize: theme.typography.body.fontSize,
  },
  bleStatusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
  },
  bleStatusText: {
    color: "#fff",
    fontSize: theme.typography.small.fontSize,
    fontWeight: "500",
  },
  bleActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.md,
  },
  bleActionButton: {
    flex: 0.48,
  },
  historyTitle: {
    fontSize: theme.typography.h2.fontSize,
    fontWeight: theme.typography.h2.fontWeight,
    color: theme.colors.text,
    marginVertical: theme.spacing.lg,
    marginHorizontal: theme.spacing.sm,
  },
  txList: {
    marginBottom: theme.spacing.xl,
  },
  latestTxCard: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  txItem: {
    padding: theme.spacing.sm,
  },
  txHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.xs,
  },
  txHash: {
    fontSize: theme.typography.caption.fontSize,
    fontFamily: "monospace",
    color: theme.colors.text,
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  txAmount: {
    fontWeight: "bold",
    fontSize: theme.typography.body.fontSize,
  },
  txDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  txDetailText: {
    fontSize: theme.typography.small.fontSize,
    color: theme.colors.textSecondary,
  },
  noTxText: {
    textAlign: "center",
    color: theme.colors.textSecondary,
    padding: theme.spacing.xl,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.small.fontSize,
    marginBottom: theme.spacing.sm,
  },
})
