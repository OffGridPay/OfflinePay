import React, { useState } from 'react';
import { View, Text, Button, TextInput, StyleSheet, Alert, ScrollView } from 'react-native';
import { ethers } from 'ethers';
import { saveWallet } from '../utils/db';

export default function WalletSetupScreen({ navigation }) {
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [newWallet, setNewWallet] = useState(null);

  const handleCreateWallet = async () => {
    try {
      const wallet = ethers.Wallet.createRandom();
      setNewWallet({
        address: wallet.address,
        privateKey: wallet.privateKey,
      });
    } catch (error) {
      Alert.alert('Error', 'Could not create a new wallet.');
      console.error(error);
    }
  };

  const handleImportWallet = async () => {
    if (!privateKeyInput || !ethers.utils.isHexString(privateKeyInput, 32)) {
      Alert.alert('Invalid Key', 'Please enter a valid 64-character hex private key.');
      return;
    }
    try {
      const wallet = new ethers.Wallet(privateKeyInput);
      await saveAndNavigate(wallet.privateKey, wallet.address);
    } catch (error) {
      Alert.alert('Error', 'Could not import wallet from this private key.');
      console.error(error);
    }
  };

  const saveAndNavigate = async (pk, addr) => {
    try {
      await saveWallet(pk, addr);
      Alert.alert('Wallet Saved!', `Your address: ${addr}`);
      navigation.replace('Home');
    } catch (error) {
      Alert.alert('Database Error', 'Could not save the wallet.');
      console.error(error);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Create a New Wallet</Text>
      <Button title="Create New Wallet" onPress={handleCreateWallet} />
      {newWallet && (
        <View style={styles.walletInfo}>
          <Text style={styles.infoTitle}>Your New Wallet:</Text>
          <Text style={styles.infoLabel}>Address:</Text>
          <Text selectable style={styles.infoValue}>{newWallet.address}</Text>
          <Text style={styles.infoLabel}>Private Key (SAVE THIS!):</Text>
          <Text selectable style={styles.infoValue}>{newWallet.privateKey}</Text>
          <Button title="Save and Continue" onPress={() => saveAndNavigate(newWallet.privateKey, newWallet.address)} />
        </View>
      )}

      <Text style={styles.header}>Or Import Existing Wallet</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter your private key"
        value={privateKeyInput}
        onChangeText={setPrivateKeyInput}
        secureTextEntry
      />
      <Button title="Import Wallet" onPress={handleImportWallet} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 30,
    marginBottom: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    width: '100%',
    marginBottom: 20,
  },
  walletInfo: {
    marginTop: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    width: '100%',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  infoLabel: {
    fontWeight: 'bold',
    marginTop: 10,
  },
  infoValue: {
    fontFamily: 'monospace',
    marginBottom: 15,
  },
});