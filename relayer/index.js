require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const REQUIRED_ENV_VARS = ['RPC_URL', 'RELAYER_PRIVATE_KEY', 'CONTRACT_ADDRESS'];

validateEnv();

// Setup Ethereum provider, relayer wallet, and contract instance
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const relayerWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
const contractAddress = ethers.utils.getAddress(process.env.CONTRACT_ADDRESS);
const LIN_PROTOCOL_ABI = [
  'function getBalance(address user) view returns (uint256)',
  'function getDepositBalance(address user) view returns (uint256)',
  'function getUserAccount(address user) view returns (tuple(uint256 balance,uint256 flowDeposit,uint256 nonce,uint256 lastSyncTime,bool isActive,address publicKeyAddress))'
];
const linProtocolContract = new ethers.Contract(contractAddress, LIN_PROTOCOL_ABI, provider);

console.log(`Relayer address: ${relayerWallet.address}`);

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
app.post('/balance', async (req, res) => {
  const { walletAddress, includeContractAccount = true } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ error: 'Missing walletAddress field' });
  }

  if (!ethers.utils.isAddress(walletAddress)) {
    return res.status(400).json({ error: 'Invalid walletAddress provided' });
  }

  try {
    const checksumAddress = ethers.utils.getAddress(walletAddress);

    const nativeBalancePromise = provider.getBalance(checksumAddress);
    const contractBalancePromise = includeContractAccount
      ? linProtocolContract.getUserAccount(checksumAddress)
      : Promise.resolve(null);

    const [nativeBalanceWei, contractAccount] = await Promise.all([
      nativeBalancePromise,
      contractBalancePromise
    ]);

    const responsePayload = {
      walletAddress: checksumAddress,
      nativeBalance: {
        wei: nativeBalanceWei.toString(),
        ether: ethers.utils.formatEther(nativeBalanceWei)
      }
    };

    if (contractAccount) {
      responsePayload.protocolAccount = formatUserAccount(contractAccount);
      responsePayload.protocolAccount.balanceEther = responsePayload.protocolAccount.balanceFormatted;
      delete responsePayload.protocolAccount.balanceFormatted;
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Failed to fetch balance snapshot:', error);
    res.status(500).json({ error: 'Failed to fetch balance', details: error.message });
  }
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
}

async function buildAccountSnapshot(walletAddress) {
  const checksumAddress = ethers.utils.getAddress(walletAddress);
  const [nativeBalanceWei, userAccount] = await Promise.all([
    provider.getBalance(checksumAddress),
    linProtocolContract.getUserAccount(checksumAddress)
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
    balanceFormatted: ethers.utils.formatEther(balance),
    flowDepositWei: flowDeposit.toString(),
    flowDeposit: ethers.utils.formatEther(flowDeposit),
    nonce: toBigNumber(account.nonce).toString(),
    lastSyncTime: toBigNumber(account.lastSyncTime).toString(),
    isActive: Boolean(account.isActive),
    publicKeyAddress: account.publicKeyAddress
  };
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