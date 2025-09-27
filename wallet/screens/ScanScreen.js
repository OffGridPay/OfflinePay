import React, { useState, useEffect } from "react"
import { Text, View, StyleSheet, Alert, StatusBar } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useIsFocused } from "@react-navigation/native"

import { verifyAck } from "../utils/verifyAck"
import { saveAck } from "../utils/db"
import CustomButton from "../components/CustomButton"
import CustomCard from "../components/CustomCard"
import { theme } from "../theme"

export default function ScanScreen({ navigation }) {
  const [scanned, setScanned] = useState(false)
  const isFocused = useIsFocused()
  const [permission, requestPermission] = useCameraPermissions()

  useEffect(() => {
    if (!permission) {
      requestPermission()
    }
  }, [permission, requestPermission])

  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true)
    try {
      const ack = JSON.parse(data)

      if (ack?.type === "offline-signed-transaction") {
        Alert.alert(
          "Signed Transaction Detected",
          "This QR contains a signed transaction for the relayer. Please share it with the relayer device to broadcast.",
          [{ text: "OK", onPress: () => setScanned(false) }]
        )
        return
      }

      if (!ack || !ack.txHash) {
        throw new Error("Missing acknowledgement payload fields.")
      }

      // 1. Verify the signature
      const isVerified = verifyAck(ack)

      if (isVerified) {
        // 2. Save the valid ack to the database
        await saveAck(ack)
        Alert.alert(
          "Success!",
          "Transaction acknowledgement received and verified. Your balance has been updated.",
          [{ text: "OK", onPress: () => navigation.goBack() }]
        )
      } else {
        Alert.alert(
          "Invalid Signature",
          "This acknowledgement is not from the trusted relayer. Discarding.",
          [{ text: "OK", onPress: () => setScanned(false) }]
        )
      }
    } catch (error) {
      Alert.alert("Scan Error", "Could not read a valid acknowledgement from this QR code.", [
        { text: "Try Again", onPress: () => setScanned(false) },
      ])
      console.error("Failed to process scanned data:", error)
    }
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <CustomCard style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            Camera access is required to scan QR codes for transaction acknowledgements.
          </Text>
          <CustomButton
            title="Grant Permission"
            onPress={requestPermission}
            style={styles.permissionButton}
          />
        </CustomCard>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {isFocused && (
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          facing="back"
          style={StyleSheet.absoluteFillObject}
        >
          <View style={styles.overlay}>
            <CustomCard style={styles.instructionCard}>
              <Text style={styles.instructionTitle}>Scan QR Code</Text>
              <Text style={styles.instructionText}>
                Position the QR code within the frame to scan transaction acknowledgements.
              </Text>
            </CustomCard>

            <View style={styles.scannerFrame}>
              <View style={[styles.scannerCorner, styles.topLeft]} />
              <View style={[styles.scannerCorner, styles.topRight]} />
              <View style={[styles.scannerCorner, styles.bottomLeft]} />
              <View style={[styles.scannerCorner, styles.bottomRight]} />
            </View>

            {scanned && (
              <CustomButton
                title="Tap to Scan Again"
                onPress={() => setScanned(false)}
                style={styles.scanAgainButton}
              />
            )}
          </View>
        </CameraView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text,
  },
  permissionCard: {
    margin: theme.spacing.lg,
    alignItems: "center",
  },
  permissionTitle: {
    fontSize: theme.typography.h2.fontSize,
    fontWeight: theme.typography.h2.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: "center",
  },
  permissionText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: theme.spacing.xl,
  },
  permissionButton: {
    width: "100%",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  instructionCard: {
    width: "80%",
    marginBottom: theme.spacing.xxl,
    alignItems: "center",
  },
  instructionTitle: {
    fontSize: theme.typography.h3.fontSize,
    fontWeight: theme.typography.h3.fontWeight,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  instructionText: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textSecondary,
    textAlign: "center",
  },
  scannerFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  scannerCorner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: theme.colors.primary,
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  scanAgainButton: {
    marginTop: theme.spacing.xxl,
  },
})
