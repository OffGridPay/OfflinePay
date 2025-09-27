**Platform:** FlowEVM (Flow's EVM-compatible blockchain)  
**Framework:** Solidity Smart Contracts  
**Status:** 🚧 **READY FOR DEPLOYMENT**

## 🔄 Migration from Flow to FlowEVM

This is the FlowEVM (Solidity) version of the original Flow blockchain LIN Protocol. Key changes made during migration:

### Technical Changes
- **Language**: Cadence → Solidity 0.8.19
- **Token Standard**: FlowToken → Native ETH/FLOW
- **Resource Model**: Flow Resources → Solidity Structs + Access Control
- **Cryptography**: Flow Crypto → OpenZeppelin ECDSA
- **Access Control**: Cadence access modifiers → OpenZeppelin Ownable + ReentrancyGuard

### Feature Compatibility
✅ **Offline Transactions**: Fully preserved  
✅ **Batch Synchronization**: Fully preserved  
✅ **FLOW Deposit Management**: Adapted to use native ETH/FLOW  
✅ **Cryptographic Security**: Migrated to ECDSA signature validation  
✅ **Replay Protection**: Fully preserved  
✅ **Nonce-based Security**: Fully preserved  

## 🚀 Quick Start

### Prerequisites
- Node.js v16 or higher
- npm or yarn
- FlowEVM wallet with FLOW tokens

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your private key
nano .env
```

### Configuration

Edit `.env` file:
```bash
# Your wallet private key (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Optional: Enable gas reporting
REPORT_GAS=true
```

### Compilation

```bash
# Compile contracts
npm run compile
```

### Testing

```bash
# Run tests
npm test
```

### Deployment

```bash
# Deploy to FlowEVM Testnet
npm run deploy:testnet

# Deploy to FlowEVM Mainnet
npm run deploy:mainnet
```

## 🌐 FlowEVM Network Information

### Testnet
- **RPC URL**: `https://testnet.evm.nodes.onflow.org`
- **Chain ID**: `545`
- **Explorer**: https://evm-testnet.flowscan.org
- **Faucet**: https://testnet-faucet.onflow.org/fund-account

### Mainnet
- **RPC URL**: `https://mainnet.evm.nodes.onflow.org`
- **Chain ID**: `747`
- **Explorer**: https://evm.flowscan.org

## 📋 Contract Interface

### Core Functions

#### Account Management
```solidity
// Initialize account with FLOW deposit
function initializeAccount() external payable

// Add more FLOW deposit
function addFlowDeposit() external payable

// Withdraw FLOW deposit
function withdrawFlowDeposit(uint256 amount) external

// Deactivate/reactivate account
function deactivateAccount() external
function reactivateAccount() external
```

#### Transaction Processing
```solidity
// Process batch of offline transactions
function syncOfflineTransactions(TransactionBatch memory batch) external returns (bool)

// Validate transaction signature
function validateSignature(OfflineTransaction memory tx) public view returns (bool)

// Check for replay attacks
function preventReplay(string memory txId) public view returns (bool)
```

#### View Functions
```solidity
function getBalance(address user) external view returns (uint256)
function getDepositBalance(address user) external view returns (uint256)
function getUserNonce(address user) external view returns (uint256)
function isUserActive(address user) external view returns (bool)
function getUserAccount(address user) external view returns (UserAccount memory)
```

### Data Structures

```solidity
struct OfflineTransaction {
    string id;
    address from;
    address to;
    uint256 amount;
    uint256 timestamp;
    uint256 nonce;
    bytes signature;
    TransactionStatus status;
}

struct TransactionBatch {
    string batchId;
    address submitter;
    OfflineTransaction[] transactions;
    uint256 timestamp;
    uint256 flowUsed;
}

struct UserAccount {
    uint256 balance;
    uint256 flowDeposit;
    uint256 nonce;
    uint256 lastSyncTime;
    bool isActive;
    address publicKeyAddress;
}
```

## 🔧 Integration Guide

### Relayer Integration Notes

- **Balance Snapshots**: Mobile relayer nodes query `getUserAccount` and `getBalance` to construct combined native/protocol balance snapshots for offline wallet updates.
- **Signed Responses**: Balance payloads returned to offline devices must be signed with the relayer key; signatures are later verified by the backend when connectivity is restored.
- **RPC Abstraction**: When devices regain internet, they bypass the BLE relayer and fetch balances via the backend API, which also leverages these contract view functions to ensure state consistency.
- **Caching Strategy**: Relayers should employ short-lived caching (30–60 seconds) of contract responses to minimize RPC usage while keeping balances fresh for nearby offline clients.

### Frontend Integration

```javascript
// Contract ABI and address (after deployment)
const contractAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
const contractABI = [...]; // From artifacts/contracts/LINProtocolEVM.sol/LINProtocolEVM.json

// Initialize contract
const contract = new ethers.Contract(contractAddress, contractABI, signer);

// Initialize user account
await contract.initializeAccount({ value: ethers.parseEther("10") });

// Get user balance
const balance = await contract.getBalance(userAddress);

// Process offline transactions
const batch = {
    batchId: "batch-123",
    submitter: userAddress,
    transactions: [...],
    timestamp: Date.now(),
    flowUsed: ethers.parseEther("0.1")
};
await contract.syncOfflineTransactions(batch);
```

### Mobile App Integration

```javascript
// Generate transaction ID
const txId = await contract.generateTransactionId(
    fromAddress,
    toAddress,
    nonce,
    timestamp
);

// Create offline transaction
const offlineTransaction = {
    id: txId,
    from: fromAddress,
    to: toAddress,
    amount: ethers.parseEther("10"),
    timestamp: Math.floor(Date.now() / 1000),
    nonce: userNonce + 1,
    signature: await signTransaction(transactionData),
    status: 0 // Pending
};
```

## 🔒 Security Features

- **ECDSA Signature Verification**: All transactions must be cryptographically signed
- **Replay Attack Prevention**: Each transaction ID can only be processed once
- **Nonce-based Ordering**: Prevents transaction reordering attacks
- **Time-based Expiry**: Transactions expire after 24 hours
- **Access Control**: Owner-only functions for emergency situations
- **Reentrancy Protection**: All state-changing functions are protected

## 📊 Gas Optimization

The contract is optimized for gas efficiency:
- Batch processing reduces per-transaction costs
- Efficient storage patterns
- Minimal external calls
- Optimized data structures

## 🧪 Testing

Comprehensive test suite covering:
- Account initialization and management
- Deposit/withdrawal operations
- Transaction validation and processing
- Security features (replay protection, signature validation)
- Edge cases and error conditions

```bash
# Run all tests
npm test

# Run with gas reporting
REPORT_GAS=true npm test
```

## 🚀 Deployment Verification

After deployment, verify your contract:

```bash
# Verify on FlowScan
npx hardhat verify --network flowTestnet YOUR_CONTRACT_ADDRESS
```

## 📞 Support

For technical support or questions:
- Check the test files for usage examples
- Review the contract comments for detailed function documentation
- Ensure your wallet has sufficient FLOW for gas fees

## 🔗 Useful Links

- [FlowEVM Documentation](https://developers.flow.com/evm/about)
- [FlowEVM Testnet Faucet](https://testnet-faucet.onflow.org/fund-account)
- [FlowScan Explorer](https://evm-testnet.flowscan.org)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)