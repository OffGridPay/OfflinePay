import React, { useState, useEffect } from "react"
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView } from "react-native"
import { ethers } from "ethers"
import QRCode from "react-native-qrcode-svg"
import { fetchWallet, fetchAcks, saveAck, saveBleTransaction } from "../utils/db"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import CustomInput from "../components/CustomInput"
import { theme } from "../theme"
import useSimpleBle from "../hooks/useSimpleBle"

export default function SendScreen({ navigation }) {
  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [qrData, setQrData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sendMethod, setSendMethod] = useState('auto') // 'auto', 'ble', 'qr'
  const [bleStatus, setBleStatus] = useState('idle') // 'idle', 'scanning', 'connecting', 'sending', 'success', 'error'
  const [bleProgress, setBleProgress] = useState('')
  
  // BLE integration
  const bleRelay = useSimpleBle({ logger: console })

  // Auto-detect best send method based on available relayers
  useEffect(() => {
    if (bleRelay.isInitialized && !bleRelay.error) {
      if (!bleRelay.isScanning) {
        bleRelay.startScanning();
      }
      
      // Auto-select method based on available relayers
      if (bleRelay.relayerPeers.length > 0 && sendMethod === 'auto') {
        setSendMethod('ble');
      } else if (bleRelay.relayerPeers.length === 0 && sendMethod === 'auto') {
        setSendMethod('qr');
      }
    }
  }, [bleRelay.isInitialized, bleRelay.relayerPeers.length, bleRelay.isScanning, sendMethod]);

  const handleGenerateTransaction = async () => {
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
        // Phase 2: Add originator signature for BLE (FR-9)
        originatorSignature: await wallet.signMessage(JSON.stringify({
          signedTx: signedTxHex,
          metadata: {
            from: wallet.address,
            to: recipient,
            amountEth: amount,
            nonce,
            createdAt: new Date().toISOString(),
          }
        }))
      }

      setQrData(payload)
      
      // If BLE method is selected and relayer available, automatically send via BLE
      if (sendMethod === 'ble' && bleRelay.selectedRelayer) {
        await handleBleSend(payload)
      }
    } catch (error) {
      Alert.alert("Transaction Error", "Could not create signed transaction.")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleBleSend = async (payload) => {
    if (!bleRelay.selectedRelayer) {
      Alert.alert('No Relayer', 'No BLE relayer found. Switching to QR code method.')
      setSendMethod('qr')
      return
    }

    setBleStatus('connecting')
    setBleProgress('Connecting to relayer...')

    try {
      // Initiate handshake with selected relayer
      const handshakeResult = await bleRelay.initiateHandshake(bleRelay.selectedRelayer.id)
      
      if (!handshakeResult) {
        throw new Error('Handshake initiation failed')
      }

      setBleStatus('sending')
      setBleProgress('Sending transaction...')
      
      // T2.1 - Send actual payload via BLE with chunking
      const transmissionId = await bleRelay.service.sendTransactionPayload(payload, bleRelay.selectedRelayer.id)
      
      // T2.6 - Save BLE transaction to database (FR-16)
      await saveBleTransaction({
        transmissionId,
        direction: 'sent',
        fromAddress: payload.metadata.from,
        toAddress: payload.metadata.to,
        value: payload.metadata.amountEth,
        nonce: payload.metadata.nonce,
        signedTx: payload.signedTx,
        status: 'sent',
        deviceId: bleRelay.selectedRelayer.id,
      })
      
      setBleStatus('success')
      setBleProgress('Transaction sent successfully!')
      
      Alert.alert(
        'Success!',
        'Transaction sent via BLE to relayer. You will receive acknowledgements once processed.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
      
    } catch (error) {
      console.error('BLE send failed:', error)
      setBleStatus('error')
      setBleProgress(`Error: ${error.message}`)
      
      Alert.alert(
        'BLE Send Failed',
        `Could not send via BLE: ${error.message}. You can try QR code instead.`,
        [
          { text: 'Use QR Code', onPress: () => setSendMethod('qr') },
          { text: 'Retry', onPress: () => handleBleSend(payload) },
        ]
      )
    }
  }

  const renderRelayerStatus = () => {
    if (!bleRelay.isInitialized || bleRelay.error) {
      return (
        <CustomCard style={styles.statusCard}>
          <Text style={styles.statusTitle}>BLE Status</Text>
          <Text style={styles.statusError}>
            {bleRelay.error || 'BLE not available'}
          </Text>
        </CustomCard>
      )
    }

    return (
      <CustomCard style={styles.statusCard}>
        <Text style={styles.statusTitle}>BLE Relayers</Text>
        {bleRelay.isScanning && (
          <Text style={styles.statusScanning}>Scanning for relayers...</Text>
        )}
        
        {bleRelay.relayerPeers.length > 0 ? (
          <View>
            <Text style={styles.statusFound}>
              {bleRelay.relayerPeers.length} relayer{bleRelay.relayerPeers.length > 1 ? 's' : ''} found
            </Text>
            {bleRelay.selectedRelayer && (
              <Text style={styles.statusSelected}>
                Selected: {bleRelay.selectedRelayer.name} (RSSI: {bleRelay.selectedRelayer.rssi})
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.statusNotFound}>
            No relayers found. QR code will be used.
          </Text>
        )}
        
        {bleStatus !== 'idle' && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>{bleProgress}</Text>
            {(bleStatus === 'connecting' || bleStatus === 'sending') && (
              <ActivityIndicator size="small" color={theme.colors.primary} style={styles.progressSpinner} />
            )}
          </View>
        )}
      </CustomCard>
    )
  }

  const renderMethodSelector = () => {
    return (
      <CustomCard style={styles.methodCard}>
        <Text style={styles.methodTitle}>Send Method</Text>
        <View style={styles.methodButtons}>
          <CustomButton
            title="Auto"
            variant={sendMethod === 'auto' ? 'solid' : 'outline'}
            onPress={() => setSendMethod('auto')}
            style={styles.methodButton}
          />
          <CustomButton
            title="BLE"
            variant={sendMethod === 'ble' ? 'solid' : 'outline'}
            onPress={() => setSendMethod('ble')}
            style={styles.methodButton}
            disabled={bleRelay.relayerPeers.length === 0}
          />
          <CustomButton
            title="QR Code"
            variant={sendMethod === 'qr' ? 'solid' : 'outline'}
            onPress={() => setSendMethod('qr')}
            style={styles.methodButton}
          />
        </View>
      </CustomCard>
    )
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
          
          {renderRelayerStatus()}
          {renderMethodSelector()}

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Generating transaction...</Text>
            </View>
          ) : (
            <CustomButton
              title={sendMethod === 'ble' ? 'Send via BLE' : sendMethod === 'qr' ? 'Generate QR Code' : 'Send Transaction'}
              onPress={handleGenerateTransaction}
              style={styles.generateButton}
            />
          )}
        </CustomCard>
      ) : (
        <View style={styles.qrContainer}>
          <CustomCard>
            <Text style={styles.qrHeader}>
              {sendMethod === 'ble' ? 'Transaction Sent via BLE' : 'Show this QR to the Relayer'}
            </Text>
            
            {(sendMethod === 'qr' || bleStatus === 'error') && (
              <View style={styles.qrCodeContainer}>
                <QRCode
                  value={JSON.stringify(qrData)}
                  size={200}
                  color={theme.colors.text}
                  backgroundColor={theme.colors.card}
                />
              </View>
            )}
            
            {sendMethod === 'ble' && bleStatus === 'success' && (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>✓ Transaction sent successfully via BLE</Text>
                <Text style={styles.successSubtext}>Waiting for acknowledgements...</Text>
              </View>
            )}
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
            {qrData.originatorSignature && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Signed:</Text>
                <Text style={styles.summaryValue}>✓ Verified</Text>
              </View>
            )}
          </CustomCard>

          <View style={styles.actionButtons}>
            <CustomButton
              title="Done"
              onPress={() => navigation.goBack()}
              style={styles.actionButton}
            />
            <CustomButton
              title="Send Another"
              onPress={() => {
                setQrData(null)
                setRecipient("")
                setAmount("")
                setBleStatus('idle')
                setBleProgress('')
                setSendMethod('auto')
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
  statusCard: {
    marginBottom: theme.spacing.md,
  },
  statusTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  statusError: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.error,
  },
  statusScanning: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  statusFound: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.success,
    fontWeight: '500',
  },
  statusSelected: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.primary,
    marginTop: theme.spacing.xs,
  },
  statusNotFound: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.warning,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
  },
  progressText: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.text,
    flex: 1,
  },
  progressSpinner: {
    marginLeft: theme.spacing.sm,
  },
  methodCard: {
    marginBottom: theme.spacing.md,
  },
  methodTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  methodButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  methodButton: {
    flex: 0.32,
  },
  successContainer: {
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  successText: {
    fontSize: theme.typography.h3.fontSize,
    color: theme.colors.success,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  successSubtext: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
})