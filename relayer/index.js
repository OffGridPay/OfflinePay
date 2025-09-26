require('dotenv').config();
const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Setup Ethereum provider and relayer wallet
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const relayerWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);

console.log(`Relayer address: ${relayerWallet.address}`);

// Root endpoint to check if the server is running
app.get('/', (req, res) => {
  res.send('Relayer service is running!');
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
    console.log(`Broadcasting transaction...`);
    const txResponse = await provider.sendTransaction(signedTx);
    console.log(`Transaction sent! Hash: ${txResponse.hash}`);

    // 2. Wait for confirmation
    const txReceipt = await txResponse.wait();
    console.log(`Transaction confirmed in block: ${txReceipt.blockNumber}`);

    // 3. Decode the transaction to get details
    const decodedTx = ethers.utils.parseTransaction(signedTx);
    const { from, to, value } = decodedTx;

    // 4. Get new balances for sender and receiver
    const fromBalance = await provider.getBalance(from);
    const toBalance = await provider.getBalance(to);

    // 5. Create the acknowledgement object
    const ack = {
      txHash: txReceipt.transactionHash,
      blockNumber: txReceipt.blockNumber,
      from: from,
      to: to,
      value: value.toString(),
      newBalances: {
        [from]: ethers.utils.formatEther(fromBalance),
        [to]: ethers.utils.formatEther(toBalance),
      },
      relayerAddress: relayerWallet.address
    };

    // 6. Sign the acknowledgement hash
    const ackHash = ethers.utils.solidityKeccak256(
        ['bytes32', 'uint256', 'address', 'address', 'uint256', 'string', 'string'],
        [
            ack.txHash,
            ack.blockNumber,
            ack.from,
            ack.to,
            ack.value,
            ack.newBalances[ack.from],
            ack.newBalances[ack.to]
        ]
    );
    const relayerSig = await relayerWallet.signMessage(ethers.utils.arrayify(ackHash));
    console.log("Acknowledgement signed successfully.");

    // 7. Return the acknowledgement with the signature
    res.status(200).json({ ...ack, relayerSig });

  } catch (error) {
    console.error('Error relaying transaction:', error);
    res.status(500).json({ error: 'Failed to relay transaction', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Relayer server listening on port ${PORT}`);
});