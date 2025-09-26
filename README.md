# Bluetooth Transaction System

A decentralized Ethereum wallet system that enables offline transaction signing and Bluetooth-based transaction broadcasting with a relayer service.

## Project Structure

```
bluetooth-txns/
├── wallet/                 # React Native mobile wallet app
│   ├── screens/           # App screens
│   │   ├── WalletSetupScreen.js
│   │   ├── HomeScreen.js
│   │   ├── SendScreen.js
│   │   └── ScanScreen.js
│   ├── utils/             # Utility functions
│   │   ├── db.js          # SQLite database operations
│   │   └── verifyAck.js   # Acknowledgement verification
│   ├── App.js             # Main app component
│   ├── index.js           # App entry point
│   └── package.json       # Dependencies and scripts
└── relayer/               # Node.js relayer server
    ├── index.js          # Express server with transaction relaying
    └── package.json      # Server dependencies
```

## Features

### Wallet App

- **Wallet Management**: Create new wallets or import existing ones
- **Offline Operation**: Sign transactions completely offline
- **QR Code Support**: Send and receive transactions via QR codes
- **Transaction History**: View complete transaction history with balances
- **Secure Storage**: Private keys stored securely using Expo Secure Store

### Relayer Service

- **Transaction Broadcasting**: Relay signed transactions to Ethereum network
- **Acknowledgement System**: Provide signed transaction confirmations
- **Balance Tracking**: Track sender and receiver balances after transactions
- **REST API**: Simple HTTP endpoints for transaction processing

## Technology Stack

### Wallet (Mobile App)

- **React Native** with **Expo** framework
- **Ethers.js** for Ethereum operations
- **SQLite** for local data storage
- **React Navigation** for screen management
- **Expo Camera/Barcode Scanner** for QR code handling

### Relayer (Server)

- **Node.js** with **Express.js** framework
- **Ethers.js** for Ethereum interactions
- **CORS** enabled for cross-origin requests
- **Body-parser** for request body parsing

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Ethereum RPC endpoint (Infura, Alchemy, or local node)

### Wallet Setup

1. Navigate to the wallet directory:

   ```bash
   cd wallet
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm start
   ```

4. Use Expo Go app on your mobile device to scan the QR code and run the app

### Relayer Setup

1. Navigate to the relayer directory:

   ```bash
   cd relayer
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:

   ```env
   RPC_URL=your_ethereum_rpc_url
   RELAYER_PRIVATE_KEY=your_relayer_wallet_private_key
   PORT=3000
   ```

4. Start the relayer server:
   ```bash
   node index.js
   ```

## Usage

### Creating a Wallet

1. Open the mobile app
2. Tap "Create New Wallet" to generate a new Ethereum wallet
3. Securely save your private key (displayed on screen)
4. Tap "Save and Continue" to proceed to the home screen

### Sending a Transaction

1. From the home screen, tap "Send"
2. Enter the recipient address and amount
3. The app will generate a signed transaction (offline)
4. A QR code containing the signed transaction will be displayed
5. Use another device to scan the QR code and broadcast via the relayer

### Receiving a Transaction

1. From the home screen, tap "Scan to Receive"
2. Scan a QR code containing a signed transaction
3. The app will verify the transaction and store it locally
4. The relayer will broadcast the transaction to the network

### Relayer API

**POST /relay**

- Body: `{ "signedTx": "0x..." }`
- Response: Transaction acknowledgement with signature

**GET /**

- Health check endpoint returns "Relayer service is running!"

## Security Features

- Private keys never leave the device
- All transaction signing happens offline
- Relayer only broadcasts pre-signed transactions
- Acknowledgement signatures prevent tampering
- SQLite database encryption via Expo Secure Store

## Development

### Adding New Screens

1. Create new screen component in `wallet/screens/`
2. Add navigation route in `wallet/App.js`
3. Update navigation imports as needed

### Extending Relayer Functionality

1. Add new endpoints to `relayer/index.js`
2. Update environment variables as needed
3. Test with Postman or curl commands

## Troubleshooting

### Common Issues

**QR Code Scanning Not Working**

- Ensure camera permissions are granted
- Check Expo Camera compatibility with your device

**Relayer Connection Errors**

- Verify RPC_URL in `.env` is correct
- Check relayer wallet has sufficient ETH for gas

**Database Errors**

- App may need to be restarted if database schema changes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
