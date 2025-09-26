import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { ethers } from 'ethers';
import QRCode from 'react-native-qrcode-svg';
import { fetchWallet, fetchAcks } from '../utils/db';

export default function SendScreen({ navigation }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [signedTx, setSignedTx] = useState(null);
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
    setSignedTx(null);

    try {
      // 1. Fetch wallet and determine nonce
      const walletData = await fetchWallet();
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
      setSignedTx(signedTxHex);

    } catch (error) {
      Alert.alert('Transaction Error', 'Could not create signed transaction.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {!signedTx ? (
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
            value={signedTx}
            size={300}
          />
          <Button title="Done" onPress={() => navigation.goBack()} />
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
});