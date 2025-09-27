const { ethers } = require('ethers');

async function getFetch() {
  const module = await import('node-fetch');
  return module.default || module;
}

const BASE_URL = process.env.API_BASE_URL || 'https://acronychous-frederick-hyperconservatively.ngrok-free.dev';
const TEST_WALLET_ADDRESS = process.env.TEST_WALLET_ADDRESS || ethers.Wallet.createRandom().address;
const DUMMY_SIGNED_TX = process.env.DUMMY_SIGNED_TX || null;

async function run() {
  const fetch = await getFetch();
  console.log('Running relayer API smoke test against', BASE_URL);
  const failures = [];

  try {
    const healthRes = await fetch(`${BASE_URL}/health`, { method: 'GET' });
    const body = await healthRes.json();
    console.log('Health:', healthRes.status, body);
    if (!healthRes.ok) {
      failures.push(`Health check failed with status ${healthRes.status}`);
    }
  } catch (error) {
    failures.push(`Health check error: ${error.message}`);
  }

  try {
    const balanceRes = await fetch(`${BASE_URL}/balance?walletAddress=${TEST_WALLET_ADDRESS}`);
    const balanceJson = await balanceRes.json();
    console.log('Balance snapshot:', balanceRes.status, balanceJson);
    if (!balanceRes.ok) {
      failures.push(`Balance endpoint failed with status ${balanceRes.status}`);
    }
  } catch (error) {
    failures.push(`Balance request error: ${error.message}`);
  }

  if (DUMMY_SIGNED_TX) {
    try {
      const relayRes = await fetch(`${BASE_URL}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTx: DUMMY_SIGNED_TX })
      });
      const relayJson = await relayRes.json();
      console.log('Relay response:', relayRes.status, relayJson);
      if (!relayRes.ok) {
        failures.push(`Relay endpoint failed with status ${relayRes.status}`);
      }
    } catch (error) {
      failures.push(`Relay request error: ${error.message}`);
    }
  } else {
    console.log('Skipping /relay test (no DUMMY_SIGNED_TX provided).');
  }

  if (failures.length) {
    console.error('Smoke test finished with failures:', failures);
    process.exitCode = 1;
  } else {
    console.log('Smoke test completed successfully.');
  }
}

run();
