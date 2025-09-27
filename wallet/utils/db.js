import * as SQLite from "expo-sqlite"

const db = SQLite.openDatabaseSync("wallet.db")

export const init = () => {
  return new Promise((resolve, reject) => {
    try {
      // Table for wallet keys
      db.execSync(
        "CREATE TABLE IF NOT EXISTS wallet (id INTEGER PRIMARY KEY NOT NULL, privateKey TEXT NOT NULL, address TEXT NOT NULL);"
      )
      db.execSync(
        "CREATE TABLE IF NOT EXISTS balance_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, walletAddress TEXT NOT NULL, nativeBalanceWei TEXT NOT NULL, nativeBalanceEther TEXT NOT NULL, protocolAccount TEXT, timestamp INTEGER NOT NULL, dataSource TEXT NOT NULL, signature TEXT NOT NULL, digest TEXT NOT NULL, createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')));"
      )
      // Table for transaction acknowledgements
      db.execSync(
        "CREATE TABLE IF NOT EXISTS acks (id INTEGER PRIMARY KEY NOT NULL, txHash TEXT UNIQUE NOT NULL, blockNumber INTEGER NOT NULL, fromAddress TEXT NOT NULL, toAddress TEXT NOT NULL, value TEXT NOT NULL, newBalances TEXT NOT NULL, relayerAddress TEXT NOT NULL, relayerSig TEXT NOT NULL);"
      )
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

export const saveWallet = (privateKey, address) => {
  return new Promise((resolve, reject) => {
    try {
      db.runSync("DELETE FROM wallet") // Ensure only one wallet at a time
      const result = db.runSync("INSERT INTO wallet (privateKey, address) VALUES (?, ?);", [
        privateKey,
        address,
      ])
      resolve(result)
    } catch (err) {
      reject(err)
    }
  })
}

export const fetchWallet = () => {
  return new Promise((resolve, reject) => {
    try {
      const result = db.getAllSync("SELECT * FROM wallet LIMIT 1;")
      resolve(result[0])
    } catch (err) {
      reject(err)
    }
  })
}

export const upsertBalanceSnapshot = (snapshot) => {
  return new Promise((resolve, reject) => {
    try {
      db.runSync(
        "INSERT INTO balance_snapshots (walletAddress, nativeBalanceWei, nativeBalanceEther, protocolAccount, timestamp, dataSource, signature, digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
        [
          snapshot.walletAddress,
          snapshot.nativeBalance.wei,
          snapshot.nativeBalance.ether,
          snapshot.protocolAccount ? JSON.stringify(snapshot.protocolAccount) : null,
          snapshot.timestamp,
          snapshot.dataSource,
          snapshot.signature,
          snapshot.digest,
        ]
      )
      resolve(true)
    } catch (err) {
      reject(err)
    }
  })
}

export const fetchLatestBalanceSnapshot = (walletAddress) => {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.getAllSync(
        "SELECT * FROM balance_snapshots WHERE walletAddress = ? ORDER BY timestamp DESC LIMIT 1;",
        [walletAddress]
      )
      resolve(rows[0])
    } catch (err) {
      reject(err)
    }
  })
}

export const saveAck = (ack) => {
  return new Promise((resolve, reject) => {
    try {
      const result = db.runSync(
        "INSERT OR REPLACE INTO acks (txHash, blockNumber, fromAddress, toAddress, value, newBalances, relayerAddress, relayerSig) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
        [
          ack.txHash,
          ack.blockNumber,
          ack.from,
          ack.to,
          ack.value,
          JSON.stringify(ack.newBalances),
          ack.relayerAddress,
          ack.relayerSig,
        ]
      )
      resolve(result)
    } catch (err) {
      reject(err)
    }
  })
}

export const fetchAcks = () => {
  return new Promise((resolve, reject) => {
    try {
      const result = db.getAllSync("SELECT * FROM acks ORDER BY blockNumber DESC;")
      resolve(result)
    } catch (err) {
      reject(err)
    }
  })
}

export const purgeOldBalanceSnapshots = (beforeTimestamp) => {
  return new Promise((resolve, reject) => {
    try {
      db.runSync("DELETE FROM balance_snapshots WHERE timestamp < ?;", [beforeTimestamp])
      resolve(true)
    } catch (err) {
      reject(err)
    }
  })
}
