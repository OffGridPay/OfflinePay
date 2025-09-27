import React, { useState } from "react"
import { View, Text, StyleSheet, Alert, ScrollView } from "react-native"
import { ethers } from "ethers"
import { saveWallet } from "../utils/db"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import CustomInput from "../components/CustomInput"
import { theme } from "../theme"

export default function WalletSetupScreen({ navigation }) {
  const [privateKeyInput, setPrivateKeyInput] = useState("")
  const [newWallet, setNewWallet] = useState(null)

  const handleCreateWallet = async () => {
    try {
      const wallet = ethers.Wallet.createRandom()
      setNewWallet({
        address: wallet.address,
        privateKey: wallet.privateKey,
      })
    } catch (error) {
      Alert.alert("Error", "Could not create a new wallet.")
      console.error(error)
    }
  }

  const handleImportWallet = async () => {
    if (!privateKeyInput || !ethers.utils.isHexString(privateKeyInput, 32)) {
      Alert.alert("Invalid Key", "Please enter a valid 64-character hex private key.")
      return
    }
    try {
      const wallet = new ethers.Wallet(privateKeyInput)
      await saveAndNavigate(wallet.privateKey, wallet.address)
    } catch (error) {
      Alert.alert("Error", "Could not import wallet from this private key.")
      console.error(error)
    }
  }

  const saveAndNavigate = async (pk, addr) => {
    try {
      await saveWallet(pk, addr)
      Alert.alert("Wallet Saved!", `Your address: ${addr}`)
      navigation.replace("Home")
    } catch (error) {
      Alert.alert("Database Error", "Could not save the wallet.")
      console.error(error)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Wallet Setup</Text>
      <Text style={styles.subtitle}>Create a new wallet or import an existing one</Text>

      <CustomCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Create a New Wallet</Text>
        <CustomButton
          title="Generate New Wallet"
          onPress={handleCreateWallet}
          style={styles.button}
        />

        {newWallet && (
          <CustomCard style={styles.walletInfoCard}>
            <Text style={styles.infoTitle}>Your New Wallet</Text>
            <Text style={styles.infoLabel}>Address:</Text>
            <Text selectable style={styles.infoValue}>
              {newWallet.address}
            </Text>
            <Text style={styles.infoLabel}>Private Key:</Text>
            <Text selectable style={styles.infoValue}>
              {newWallet.privateKey}
            </Text>
            <Text style={styles.warningText}>
              Save your private key securely! You will not see it again.
            </Text>
            <CustomButton
              title="Save and Continue"
              onPress={() => saveAndNavigate(newWallet.privateKey, newWallet.address)}
              style={styles.button}
            />
          </CustomCard>
        )}
      </CustomCard>

      <CustomCard style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Import Existing Wallet</Text>
        <Text style={styles.infoText}>Enter your private key to import an existing wallet</Text>
        <CustomInput
          placeholder="Enter your private key"
          value={privateKeyInput}
          onChangeText={setPrivateKeyInput}
          secureTextEntry
          style={styles.input}
        />
        <CustomButton title="Import Wallet" onPress={handleImportWallet} style={styles.button} />
      </CustomCard>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.typography.h1.fontSize,
    fontWeight: theme.typography.h1.fontWeight,
    color: theme.colors.text,
    textAlign: "center",
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.xxl,
  },
  sectionCard: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.typography.h2.fontSize,
    fontWeight: theme.typography.h2.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  button: {
    marginVertical: theme.spacing.sm,
  },
  walletInfoCard: {
    marginTop: theme.spacing.lg,
    borderColor: theme.colors.warning,
    borderWidth: 1,
  },
  infoTitle: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: "center",
  },
  infoLabel: {
    fontWeight: "bold",
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  infoValue: {
    fontFamily: "monospace",
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.sm,
  },
  warningText: {
    color: theme.colors.error,
    fontSize: theme.typography.caption.fontSize,
    textAlign: "center",
    marginVertical: theme.spacing.md,
    fontStyle: "italic",
  },
  infoText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  input: {
    marginBottom: theme.spacing.lg,
  },
})
