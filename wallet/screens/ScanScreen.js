import React, { useState, useEffect } from 'react';
import { Text, View, StyleSheet, Button, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';

import { verifyAck } from '../utils/verifyAck';
import { saveAck } from '../utils/db';

export default function ScanScreen({ navigation }) {
  const [scanned, setScanned] = useState(false);
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleBarCodeScanned = async ({ type, data }) => {
    setScanned(true);
    try {
      const ack = JSON.parse(data);

      // 1. Verify the signature
      const isVerified = verifyAck(ack);

      if (isVerified) {
        // 2. Save the valid ack to the database
        await saveAck(ack);
        Alert.alert(
          'Success!',
          'Transaction acknowledgement received and verified. Your balance has been updated.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert(
          'Invalid Signature',
          'This acknowledgement is not from the trusted relayer. Discarding.',
          [{ text: 'OK', onPress: () => setScanned(false) }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Scan Error',
        'Could not read a valid acknowledgement from this QR code.',
        [{ text: 'Try Again', onPress: () => setScanned(false) }]
      );
      console.error('Failed to process scanned data:', error);
    }
  };

  if (!permission) {
    return <Text>Requesting for camera permission</Text>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionText}>Camera access is required to scan acknowledgements.</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          facing="back"
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {scanned && <Button title={'Tap to Scan Again'} onPress={() => setScanned(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    textAlign: 'center',
    marginBottom: 20,
  },
});