require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const REQUIRED_ENV_VARS = ['RELAYER_PRIVATE_KEY', 'CONTRACT_ADDRESS'];

const DEFAULT_RPC_URL = 'https://testnet.evm.nodes.onflow.org';
const DEFAULT_CHAIN_ID = 545;
const DEFAULT_NETWORK_NAME = 'flowevm-testnet';
const IS_DEV = process.env.RELAYER_LOG_REQUESTS === 'true' || process.env.NODE_ENV !== 'production';

validateEnv();

const rpcUrl = process.env.RPC_URL || DEFAULT_RPC_URL;

// Setup Ethereum provider, relayer wallet, and contract instance
const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, {
  name: DEFAULT_NETWORK_NAME,
  chainId: DEFAULT_CHAIN_ID,
});
const relayerWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
const contractAddress = ethers.utils.getAddress(process.env.CONTRACT_ADDRESS);
const OFFGRIDPAY_PROTOCOL_ABI = [
  'function getBalance(address user) view returns (uint256)',
  'function getDepositBalance(address user) view returns (uint256)',
  'function getUserAccount(address user) view returns (tuple(uint256 balance,uint256 flowDeposit,uint256 nonce,uint256 lastSyncTime,bool isActive,address publicKeyAddress))'
];
const OFFGRIDPAYProtocolContract = new ethers.Contract(contractAddress, OFFGRIDPAY_PROTOCOL_ABI, provider);

console.log(`Relayer address: ${relayerWallet.address}`);

if (IS_DEV) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const payload = req.method === 'GET' ? { query: req.query } : { query: req.query, body: req.body };
      console.log(
        `[relayer][${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`,
        payload
      );
    });
    next();
  });
}

// Root endpoint to check if the server is running
app.get('/', (req, res) => {
  res.send('Relayer service is running!');
});

app.get('/health', async (req, res) => {
  try {
    const latestBlock = await provider.getBlockNumber();
    res.json({ status: 'ok', latestBlock, relayerAddress: relayerWallet.address });
  } catch (error) {
    res.status(503).json({ status: 'error', message: error.message });
  }
});

/**
 * Provide on-demand account state for devices that cannot reach the blockchain directly.
 */
app.get('/balance', async (req, res) => {
  const { walletAddress, includeContractAccount } = req.query;
  await handleBalanceRequest({ walletAddress, includeContractAccount, res });
});

app.post('/balance', async (req, res) => {
  const { walletAddress, includeContractAccount } = req.body || {};
  await handleBalanceRequest({ walletAddress, includeContractAccount, res });
});

/**
 * Endpoint to relay a transaction to the Ethereum network.
 * Expects a JSON body with a `signedTx` field containing the raw, signed transaction hex.
 */
app.post('/relay', async (req, res) => {
  const { signedTx } = req.body;

  if (!signedTx) {
    return res.status(400).json({ error: 'Missing signedTx field' });
  }

  try {
    // 1. Broadcast the transaction
    console.log('Broadcasting transaction...');
    const txResponse = await provider.sendTransaction(signedTx);
    console.log(`Transaction sent! Hash: ${txResponse.hash}`);

    // 2. Wait for confirmation
    const txReceipt = await txResponse.wait();
    console.log(`Transaction confirmed in block: ${txReceipt.blockNumber}`);

    // 3. Decode the transaction to get details
    const decodedTx = ethers.utils.parseTransaction(signedTx);
    const { from, to, value } = decodedTx;

    const [fromSnapshot, toSnapshot] = await Promise.all([
      buildAccountSnapshot(from),
      to ? buildAccountSnapshot(to) : Promise.resolve(null)
    ]);

    // 4. Create the acknowledgement object
    const ack = {
      txHash: txReceipt.transactionHash,
      blockNumber: txReceipt.blockNumber,
      from,
      to,
      value: value.toString(),
      accounts: {
        [ethers.utils.getAddress(from)]: fromSnapshot
      },
      relayerAddress: relayerWallet.address
    };

    if (toSnapshot) {
      ack.accounts[ethers.utils.getAddress(to)] = toSnapshot;
    }

    // 5. Sign the acknowledgement hash
    const ackHash = ethers.utils.solidityKeccak256(
      ['bytes32', 'uint256', 'address', 'address', 'uint256'],
      [
        ack.txHash,
        ack.blockNumber,
        ack.from,
        ack.to || ethers.constants.AddressZero,
        ack.value
      ]
    );
    const relayerSig = await relayerWallet.signMessage(ethers.utils.arrayify(ackHash));
    console.log('Acknowledgement signed successfully.');

    // 6. Return the acknowledgement with the signature and account snapshots
    res.status(200).json({ ...ack, relayerSig });
  } catch (error) {
    console.error('Error relaying transaction:', error);
    res.status(500).json({ error: 'Failed to relay transaction', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Relayer server listening on port ${PORT}`);
});

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (!process.env.RPC_URL) {
    console.warn(`[relayer] RPC_URL not set. Falling back to ${DEFAULT_RPC_URL}`);
  }
}

async function buildAccountSnapshot(walletAddress) {
  const checksumAddress = ethers.utils.getAddress(walletAddress);
  const [nativeBalanceWei, userAccount] = await Promise.all([
    provider.getBalance(checksumAddress),
    OFFGRIDPAYProtocolContract.getUserAccount(checksumAddress)
  ]);

  const formattedAccount = formatUserAccount(userAccount);

  return {
    address: checksumAddress,
    nativeBalanceWei: nativeBalanceWei.toString(),
    nativeBalance: ethers.utils.formatEther(nativeBalanceWei),
    protocolAccount: formattedAccount
  };
}

function formatUserAccount(account) {
  if (!account) {
    return null;
  }

  const balance = toBigNumber(account.balance);
  const flowDeposit = toBigNumber(account.flowDeposit);

  return {
    balanceWei: balance.toString(),
    balanceEther: ethers.utils.formatEther(balance),
    flowDepositWei: flowDeposit.toString(),
    flowDepositEther: ethers.utils.formatEther(flowDeposit),
    nonce: toBigNumber(account.nonce).toString(),
    lastSyncTime: toBigNumber(account.lastSyncTime).toString(),
    isActive: Boolean(account.isActive),
    publicKeyAddress: account.publicKeyAddress
  };
}

async function handleBalanceRequest({ walletAddress, includeContractAccount, res }) {
  if (!walletAddress) {
    return res.status(400).json({ error: 'Missing walletAddress field' });
  }

  if (!ethers.utils.isAddress(walletAddress)) {
    return res.status(400).json({ error: 'Invalid walletAddress provided' });
  }

  try {
    const include = includeContractAccount !== undefined ? includeContractAccount !== false && includeContractAccount !== 'false' : true;
    const snapshot = await buildBalanceSnapshot(walletAddress, include);
    res.json(snapshot);
  } catch (error) {
    console.error('Failed to fetch balance snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch balance', details: error.message });
  }
}

async function buildBalanceSnapshot(walletAddress, includeContractAccount = true) {
  const checksumAddress = ethers.utils.getAddress(walletAddress);
  const nativeBalanceWei = await provider.getBalance(checksumAddress);

  const snapshot = {
    walletAddress: checksumAddress,
    nativeBalance: {
      wei: nativeBalanceWei.toString(),
      ether: ethers.utils.formatEther(nativeBalanceWei)
    },
    protocolAccount: null,
    timestamp: Math.floor(Date.now() / 1000),
    signer: relayerWallet.address,
    dataSource: 'relayer'
  };

  if (includeContractAccount) {
    const contractAccount = await OFFGRIDPAYProtocolContract.getUserAccount(checksumAddress);
    snapshot.protocolAccount = formatUserAccount(contractAccount);
  }

  const digest = computeBalanceSnapshotDigest(snapshot);
  const signature = await relayerWallet.signMessage(ethers.utils.arrayify(digest));

  return { ...snapshot, digest, signature };
}

function computeBalanceSnapshotDigest(snapshot) {
  const nativeBalanceWei = ethers.BigNumber.from(snapshot.nativeBalance.wei || 0);
  const protocol = snapshot.protocolAccount;
  const protocolBalanceWei = protocol ? ethers.BigNumber.from(protocol.balanceWei) : ethers.constants.Zero;
  const protocolDepositWei = protocol ? ethers.BigNumber.from(protocol.flowDepositWei) : ethers.constants.Zero;
  const protocolNonce = protocol ? ethers.BigNumber.from(protocol.nonce) : ethers.constants.Zero;
  const isActive = protocol ? protocol.isActive : false;
  const lastSyncTime = protocol ? ethers.BigNumber.from(protocol.lastSyncTime || 0) : ethers.constants.Zero;

  return ethers.utils.solidityKeccak256(
    ['address', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'uint256', 'uint256'],
    [
      snapshot.walletAddress,
      nativeBalanceWei,
      protocolBalanceWei,
      protocolDepositWei,
      protocolNonce,
      isActive,
      lastSyncTime,
      ethers.BigNumber.from(snapshot.timestamp)
    ]
  );
}

function toBigNumber(value) {
  if (ethers.BigNumber.isBigNumber(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return ethers.BigNumber.from(value);
  }

  if (typeof value === 'number') {
    return ethers.BigNumber.from(value);
  }

  return ethers.BigNumber.from(0);
}