# BLE Debugging Guide for OfflinePay

## 🚧 **Critical: BLE Requires Native Build**

BLE functionality **WILL NOT WORK** in Expo Go or managed workflow. You must use:
- Expo Development Build (recommended)
- Bare React Native workflow
- Physical device testing (BLE doesn't work in emulators)

## 📱 **Building for Testing**

### Option 1: Expo Development Build (Recommended)

```bash
# Install Expo CLI and development build tools
npm install -g @expo/cli eas-cli

# Create development build
eas build --profile development --platform android

# Or build locally (faster for debugging)
npx expo run:android
```

### Option 2: Bare Workflow

```bash
# Eject to bare workflow
npx expo eject

# Build and run
npx react-native run-android
```

## 🔍 **Debugging Methods**

### 1. **Enhanced BLE Debug Screen**
- Navigate to "BLE Debug" in your app
- Real-time permission status
- Live BLE logs with filtering
- Device discovery monitoring
- Export logs for analysis

### 2. **Android Studio Logcat**
```bash
# Filter for BLE logs
adb logcat | grep -i "ble\|bluetooth"

# OfflinePay specific logs
adb logcat | grep -E "(ble-relay|BLE-)"

# All app logs
adb logcat | grep "com.anonymous.wallet"
```

### 3. **React Native Debugger**
```bash
# Install and run
npm install -g react-native-debugger
react-native-debugger
```

### 4. **Chrome DevTools Console**
- Shake device → "Debug JS Remotely"
- Open Chrome → `http://localhost:8081/debugger-ui/`
- Check console for detailed BLE logs

## 🛠 **Common Issues & Solutions**

### **Issue 1: BLE Not Supported Error**
```
BLE not supported - react-native-ble-plx unavailable
```

**Solution:**
1. Ensure you're using development build or bare workflow
2. Check `react-native-ble-plx` is installed:
   ```bash
   npm list react-native-ble-plx
   ```
3. Rebuild the app after installing BLE dependencies

### **Issue 2: Permission Denied**
```
BLE permissions not granted
```

**Solution:**
1. Open Debug Screen → Check permission status
2. Manually grant permissions in Android Settings
3. Use "Request Permissions" button in debug screen

### **Issue 3: Scanning Fails**
```
Scan failed: Bluetooth is not enabled
```

**Solution:**
1. Enable Bluetooth in device settings
2. Check Debug Screen for adapter state
3. Try stopping/starting scan from debug screen

### **Issue 4: No Devices Found**
**Check:**
- Both devices have BLE enabled
- Both devices are running the app
- Devices are within BLE range (<10m)
- Check logs for permission/scanning issues

## 📋 **Debugging Checklist**

### Before Testing:
- [ ] Using development build or bare workflow
- [ ] Testing on physical device (not emulator)
- [ ] Bluetooth enabled on device
- [ ] Location services enabled (Android requirement)
- [ ] App has all required permissions

### During Testing:
- [ ] Open BLE Debug Screen
- [ ] Check permission status (all should be "granted")
- [ ] Verify BLE service is "Supported" and "Initialized"
- [ ] Start scanning and check for discovered devices
- [ ] Monitor logs for errors or warnings

### Debug Information to Collect:
- [ ] Permission status from debug screen
- [ ] BLE adapter state
- [ ] Error messages from logs
- [ ] Device discovery results
- [ ] Platform/Android version info

## 🔧 **Manual Permission Grant**

If automatic permission requests fail:

### Android Settings:
1. Settings → Apps → OfflinePay → Permissions
2. Enable:
   - **Location** (required for BLE scanning)
   - **Nearby devices** (Android 12+)
   - **Phone** (may be required for some BLE operations)

### Developer Options:
1. Settings → Developer Options
2. Enable "Bluetooth HCI snoop log" for advanced debugging
3. Logs saved to: `/sdcard/Android/data/btsnoop_hci.log`

## 📊 **Log Analysis**

### Key Log Tags to Watch:
- `[BLE-RELAY]` - Main service logs
- `[BLE-PERMISSIONS]` - Permission handling
- `[BLE-STATE]` - Adapter state changes
- `[BLE-DISCOVERY]` - Device discovery
- `[BLE-CONNECTION]` - Connection attempts
- `[BLE-HANDSHAKE]` - Security handshake
- `[BLE-PAYLOAD]` - Transaction transmission

### Log Levels:
- **🔍 DEBUG** - Detailed operation info
- **ℹ️ INFO** - General status updates
- **⚠️ WARN** - Potential issues
- **❌ ERROR** - Critical failures

## 🧪 **Testing Scenarios**

### 1. **Single Device Test**
- Verify BLE initialization
- Check permission status
- Test advertising/scanning toggle

### 2. **Two Device Test**
- Device A: Start advertising
- Device B: Start scanning
- Verify Device B discovers Device A
- Check signal strength (RSSI)

### 3. **Transaction Test**
- Device A: Online relayer mode
- Device B: Send transaction via BLE
- Monitor handshake and payload transmission
- Verify acknowledgments received

## 🚀 **Performance Optimization**

### Battery Usage:
- BLE scanning can drain battery
- Use intermittent scanning in production
- Stop scanning when app backgrounded

### Connection Reliability:
- Keep devices within 5-10 meters
- Avoid interference from WiFi/other BLE devices
- Use retry mechanisms for failed connections

## 📞 **Getting Help**

When reporting BLE issues, include:
1. **Device Info**: Android version, device model
2. **Build Info**: Development build or bare workflow
3. **Permission Status**: Screenshot from debug screen
4. **Logs**: Exported logs from debug screen
5. **Steps to Reproduce**: Exact sequence that causes issue

## 🔮 **Advanced Debugging**

### Bluetooth HCI Logs:
```bash
# Enable HCI logging
adb shell settings put secure bluetooth_hci_log 1

# Restart Bluetooth
adb shell am broadcast -a android.bluetooth.adapter.action.REQUEST_DISABLE
adb shell am broadcast -a android.bluetooth.adapter.action.REQUEST_ENABLE

# Pull logs
adb pull /sdcard/Android/data/btsnoop_hci.log
```

### Wireshark Analysis:
1. Install Wireshark with Bluetooth support
2. Open `btsnoop_hci.log` file
3. Filter for BLE packets: `btle`
4. Analyze connection, advertising, and data packets

Remember: **BLE debugging requires patience and physical devices!** 🔧📱
