# Expo BLE Setup Guide

## 🚨 **Critical Setup for BLE Functionality**

Since you're using Expo and BLE requires native modules, here's exactly what you need to do:

## 1. **Convert to Expo Development Build**

Your `app.json` should include:

```json
{
  "expo": {
    "name": "OfflinePay",
    "plugins": [
      [
        "expo-dev-client",
        {
          "addGeneratedScheme": false
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "NSBluetoothAlwaysUsageDescription": "OfflinePay uses Bluetooth to discover nearby devices for offline transactions.",
        "NSBluetoothPeripheralUsageDescription": "OfflinePay uses Bluetooth to connect with nearby devices for offline transactions."
      }
    },
    "android": {
      "permissions": [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN", 
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_ADVERTISE",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    }
  }
}
```

## 2. **Install Required Dependencies**

```bash
# Install BLE library
npm install react-native-ble-plx

# Install development build client
npx expo install expo-dev-client

# Install EAS CLI for builds
npm install -g @expo/cli eas-cli
```

## 3. **Configure EAS Build**

Create `eas.json` in project root:

```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "aab"
      }
    }
  }
}
```

## 4. **Build Development APK**

```bash
# Login to Expo
eas login

# Build development APK
eas build --profile development --platform android

# Or build locally (faster)
npx expo run:android
```

## 5. **Alternative: Local Development Build**

If EAS build is slow, build locally:

```bash
# Prebuild native code
npx expo prebuild

# Run on Android
npx expo run:android

# This creates an APK you can install and debug
```

## 6. **Debug BLE Issues**

Once you have the development build:

1. **Install the APK** on your physical Android device
2. **Open the app** → Navigate to "BLE Debug" screen
3. **Check Permission Status** - should show all permissions as "granted"
4. **Start Scanning** - should discover nearby BLE devices
5. **Export Logs** if issues occur

## 7. **Common Build Issues**

### **Metro bundler not finding BLE module:**
```bash
# Clear cache and restart
npx expo start --clear
```

### **Native module linking issues:**
```bash
# Rebuild from scratch
rm -rf node_modules
npm install
npx expo prebuild --clean
npx expo run:android
```

### **Permission issues after install:**
- Manually grant permissions in Android Settings
- Use debug screen "Request Permissions" button
- Check Android version compatibility (needs Android 6+)

## 8. **Testing Workflow**

```bash
# 1. Build once
eas build --profile development --platform android

# 2. Install APK on device
# Download from EAS build or use adb install

# 3. Development workflow
npx expo start --dev-client

# 4. Code changes hot-reload automatically
# No need to rebuild APK for JS changes!
```

## 9. **Production Build**

When ready for production:

```bash
# Production AAB for Play Store
eas build --profile production --platform android

# Production APK for direct distribution  
eas build --profile preview --platform android
```

## 🔧 **Quick Troubleshooting**

**BLE not working?**
1. ✅ Using development build (not Expo Go)
2. ✅ Physical Android device (not emulator) 
3. ✅ Bluetooth enabled on device
4. ✅ Location permissions granted
5. ✅ Check BLE Debug screen for detailed status

**Need faster development?**
- Use `npx expo run:android` for local builds
- JS changes hot-reload without rebuilding APK
- Only rebuild when changing native dependencies

This setup will give you full BLE functionality with proper debugging capabilities! 🚀
