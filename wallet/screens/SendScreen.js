import React, { useState } from "react"
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView } from "react-native"
import { ethers } from "ethers"
import QRCode from "react-native-qrcode-svg"
import { fetchWallet, fetchAcks } from "../utils/db"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import CustomInput from "../components/CustomInput"
import { theme } from "../theme"

export default function SendScreen({ navigation }) {
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [qrData, setQrData] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleGenerateQR = async () => {
    if (!ethers.utils.isAddress(recipient)) {
      Alert.alert("Invalid Address", "Please enter a valid Ethereum recipient address.")
      return
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount.")
      return
    }

    setLoading(true)
    setQrData(null)

    try {
      // 1. Fetch wallet and determine nonce
      const walletData = await fetchWallet()
      if (!walletData) {
        Alert.alert("Wallet Missing", "Create or import a wallet before sending transactions.")
        return
      }
      const acks = await fetchAcks()
      const nonce = acks.length // Use the number of past successful txs as nonce

      const wallet = new ethers.Wallet(walletData.privateKey)

      // 2. Create transaction object (offline)
      const tx = {
        to: recipient,
        value: ethers.utils.parseEther(amount),
        nonce: nonce,
        gasLimit: 21000, // Standard for ETH transfer
        gasPrice: ethers.utils.parseUnits("10", "gwei"), // Hardcoded gas price for MVP
      }

      // 3. Sign the transaction
      const signedTxHex = await wallet.signTransaction(tx)
      const payload = {
        version: 1,
        type: "offline-signed-transaction",
        signedTx: signedTxHex,
        metadata: {
          from: wallet.address,
          to: recipient,
          amountEth: amount,
          nonce,
          gasLimit: String(tx.gasLimit),
          gasPriceGwei: ethers.utils.formatUnits(tx.gasPrice, "gwei"),
          createdAt: new Date().toISOString(),
        },
      }

      setQrData(payload)
    } catch (error) {
      Alert.alert("Transaction Error", "Could not create signed transaction.")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {!qrData ? (
        <CustomCard>
          <Text style={styles.title}>Send Transaction</Text>
          <Text style={styles.label}>Recipient Address</Text>
          <CustomInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="0x..."
            style={styles.input}
          />
          <Text style={styles.label}>Amount (ETH)</Text>
          <CustomInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.1"
            keyboardType="numeric"
            style={styles.input}
          />
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Generating transaction...</Text>
            </View>
          ) : (
            <CustomButton
              title="Generate Transaction QR Code"
              onPress={handleGenerateQR}
              style={styles.generateButton}
            />
          )}
        </CustomCard>
      ) : (
        <View style={styles.qrContainer}>
          <CustomCard>
            <Text style={styles.qrHeader}>Show this QR to the Relayer</Text>
            <View style={styles.qrCodeContainer}>
              <QRCode
                value={JSON.stringify(qrData)}
                size={200}
                color={theme.colors.text}
                backgroundColor={theme.colors.card}
              />
            </View>
          </CustomCard>

          <CustomCard style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Transaction Summary</Text>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>From:</Text>
              <Text selectable style={styles.summaryValue}>
                {qrData.metadata.from}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>To:</Text>
              <Text selectable style={styles.summaryValue}>
                {qrData.metadata.to}
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Amount:</Text>
              <Text style={styles.summaryValue}>{qrData.metadata.amountEth} ETH</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Nonce:</Text>
              <Text style={styles.summaryValue}>{qrData.metadata.nonce}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Gas:</Text>
              <Text style={styles.summaryValue}>
                {qrData.metadata.gasLimit} @ {qrData.metadata.gasPriceGwei} gwei
              </Text>
            </View>
          </CustomCard>

          <View style={styles.actionButtons}>
            <CustomButton
              title="Done"
              onPress={() => navigation.goBack()}
              style={styles.actionButton}
            />
            <CustomButton
              title="Generate Another"
              onPress={() => {
                setQrData(null)
                setRecipient("")
                setAmount("")
              }}
              variant="outline"
              style={styles.actionButton}
            />
          </View>
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
  title: {
    fontSize: theme.typography.h2.fontSize,
    fontWeight: theme.typography.h2.fontWeight,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  input: {
    marginBottom: theme.spacing.lg,
  },
  loadingContainer: {
    alignItems: "center",
    marginVertical: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
  },
  generateButton: {
    marginVertical: theme.spacing.sm,
  },
  qrContainer: {
    alignItems: "center",
  },
  qrHeader: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.lg,
  },
  qrCodeContainer: {
    alignItems: "center",
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.lg,
  },
  summaryCard: {
    width: "100%",
    marginTop: theme.spacing.lg,
  },
  summaryTitle: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: "center",
  },
  summaryItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  summaryLabel: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text,
    textAlign: "right",
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: theme.spacing.lg,
  },
  actionButton: {
    flex: 0.48,
  },
})
