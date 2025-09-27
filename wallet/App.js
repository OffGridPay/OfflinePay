import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import WalletSetupScreen from './screens/WalletSetupScreen';
import HomeScreen from './screens/HomeScreen';
import SendScreen from './screens/SendScreen';
import ScanScreen from './screens/ScanScreen';
import BleDebugScreen from './screens/BleDebugScreen';

import { init as initDB, fetchWallet } from './utils/db';
import useConnectivityMonitor from './hooks/useConnectivityMonitor';
import ConnectivityContext from './context/ConnectivityContext';
import { RELAYER_HEALTHCHECK_URL } from './config/env';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasWallet, setHasWallet] = useState(false);
  const connectivity = useConnectivityMonitor({
    heartbeatUrl: RELAYER_HEALTHCHECK_URL,
    autoStartHeartbeat: true,
  });

  useEffect(() => {
    const setup = async () => {
      try {
        await initDB();
        console.log('Database initialized');
        const wallet = await fetchWallet();
        if (wallet && wallet.privateKey) {
          setHasWallet(true);
        }
      } catch (err) {
        console.log('App setup failed:', err);
      }
      setIsLoading(false);
    };

    setup();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered}><ActivityIndicator size="large" /></View>
    );
  }

  return (
    <ConnectivityContext.Provider value={connectivity}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName={hasWallet ? 'Home' : 'WalletSetup'}>
        <Stack.Screen 
          name="WalletSetup" 
          component={WalletSetupScreen} 
          options={{ title: 'Setup Your Wallet' }}
        />
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Offline Wallet' }}
        />
        <Stack.Screen 
          name="Send" 
          component={SendScreen} 
          options={{ title: 'Send Transaction' }}
        />
          <Stack.Screen 
            name="Scan" 
            component={ScanScreen} 
            options={{ title: 'Scan QR Code' }}
          />
          <Stack.Screen
            name="BleDebug"
            component={BleDebugScreen}
            options={{ title: 'BLE Debug' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ConnectivityContext.Provider>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});