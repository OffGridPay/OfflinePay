import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { ethers } from 'ethers';
import QRCode from 'react-native-qrcode-svg';
import { fetchWallet, fetchAcks } from '../utils/db';

export default function SendScreen({ navigation }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerateQR = async () => {
    if (!ethers.utils.isAddress(recipient)) {
      Alert.alert('Invalid Address', 'Please enter a valid Ethereum recipient address.');
      return;
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    setLoading(true);
    setQrData(null);

    try {
      // 1. Fetch wallet and determine nonce
      const walletData = await fetchWallet();
      if (!walletData) {
        Alert.alert('Wallet Missing', 'Create or import a wallet before sending transactions.');
        return;
      }
      const acks = await fetchAcks();
      const nonce = acks.length; // Use the number of past successful txs as nonce

      const wallet = new ethers.Wallet(walletData.privateKey);

      // 2. Create transaction object (offline)
      const tx = {
        to: recipient,
        value: ethers.utils.parseEther(amount),
        nonce: nonce,
        gasLimit: 21000, // Standard for ETH transfer
        gasPrice: ethers.utils.parseUnits('10', 'gwei'), // Hardcoded gas price for MVP
      };

      // 3. Sign the transaction
      const signedTxHex = await wallet.signTransaction(tx);
      const payload = {
        version: 1,
        type: 'offline-signed-transaction',
        signedTx: signedTxHex,
        metadata: {
          from: wallet.address,
          to: recipient,
          amountEth: amount,
          nonce,
          gasLimit: String(tx.gasLimit),
          gasPriceGwei: ethers.utils.formatUnits(tx.gasPrice, 'gwei'),
          createdAt: new Date().toISOString(),
        },
      };

      setQrData(payload);

    } catch (error) {
      Alert.alert('Transaction Error', 'Could not create signed transaction.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {!qrData ? (
        <>
          <Text style={styles.label}>Recipient Address</Text>
          <TextInput
            style={styles.input}
            value={recipient}
            onChangeText={setRecipient}
            placeholder="0x..."
          />
          <Text style={styles.label}>Amount (ETH)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.1"
            keyboardType="numeric"
          />
          {loading ? (
            <ActivityIndicator size="large" />
          ) : (
            <Button title="Generate Transaction QR Code" onPress={handleGenerateQR} />
          )}
        </>
      ) : (
        <View style={styles.qrContainer}>
          <Text style={styles.qrHeader}>Show this QR to the Relayer</Text>
          <QRCode
            value={JSON.stringify(qrData)}
            size={300}
          />
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>Transaction Summary</Text>
            <Text selectable style={styles.summaryText}>From: {qrData.metadata.from}</Text>
            <Text selectable style={styles.summaryText}>To: {qrData.metadata.to}</Text>
            <Text style={styles.summaryText}>Amount: {qrData.metadata.amountEth} ETH</Text>
            <Text style={styles.summaryText}>Nonce: {qrData.metadata.nonce}</Text>
            <Text style={styles.summaryText}>Gas: {qrData.metadata.gasLimit} @ {qrData.metadata.gasPriceGwei} gwei</Text>
          </View>
          <View style={styles.actionButtons}>
            <Button title="Done" onPress={() => navigation.goBack()} />
            <View style={styles.buttonSpacer} />
            <Button
              title="Generate Another"
              onPress={() => {
                setQrData(null);
                setRecipient('');
                setAmount('');
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'flex-start',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    width: '100%',
    marginBottom: 20,
  },
  qrContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  summaryBox: {
    width: '100%',
    marginTop: 20,
    marginBottom: 20,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 14,
    marginBottom: 6,
  },
  actionButtons: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonSpacer: {
    width: 10,
  },
});