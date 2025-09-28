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
      // Table for transaction acknowledgements (legacy QR-based)
      db.execSync(
        "CREATE TABLE IF NOT EXISTS acks (id INTEGER PRIMARY KEY NOT NULL, txHash TEXT UNIQUE NOT NULL, blockNumber INTEGER NOT NULL, fromAddress TEXT NOT NULL, toAddress TEXT NOT NULL, value TEXT NOT NULL, newBalances TEXT NOT NULL, relayerAddress TEXT NOT NULL, relayerSig TEXT NOT NULL);"
      )
      
      // Table for BLE acknowledgements (T2.6 - FR-16)
      db.execSync(`
        CREATE TABLE IF NOT EXISTS ble_acks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transmissionId TEXT NOT NULL,
          ackType INTEGER NOT NULL, -- 1=Receipt, 2=Broadcast
          txHash TEXT,
          deviceId TEXT NOT NULL,
          payload TEXT NOT NULL,
          signature TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'received',
          createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          UNIQUE(transmissionId, ackType)
        );
      `)
      
      // Table for BLE transactions (both sent and received)
      db.execSync(`
        CREATE TABLE IF NOT EXISTS ble_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transmissionId TEXT UNIQUE NOT NULL,
          direction TEXT NOT NULL, -- 'sent' or 'received'
          fromAddress TEXT NOT NULL,
          toAddress TEXT NOT NULL,
          value TEXT NOT NULL,
          nonce INTEGER NOT NULL,
          signedTx TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          deviceId TEXT,
          receiptAckId INTEGER,
          broadcastAckId INTEGER,
          createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
          FOREIGN KEY(receiptAckId) REFERENCES ble_acks(id),
          FOREIGN KEY(broadcastAckId) REFERENCES ble_acks(id)
        );
      `)
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

// BLE Transaction and Acknowledgement Functions (T2.6 - FR-16)

/**
 * Save BLE transaction record
 */
export const saveBleTransaction = (transactionData) => {
  return new Promise((resolve, reject) => {
    try {
      const result = db.runSync(`
        INSERT INTO ble_transactions 
        (transmissionId, direction, fromAddress, toAddress, value, nonce, signedTx, status, deviceId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        transactionData.transmissionId,
        transactionData.direction, // 'sent' or 'received'
        transactionData.fromAddress,
        transactionData.toAddress,
        transactionData.value,
        transactionData.nonce,
        transactionData.signedTx,
        transactionData.status || 'pending',
        transactionData.deviceId || null,
      ])
      resolve(result.insertId)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Save BLE acknowledgement
 */
export const saveBleAck = (ackData) => {
  return new Promise((resolve, reject) => {
    try {
      const result = db.runSync(`
        INSERT OR REPLACE INTO ble_acks 
        (transmissionId, ackType, txHash, deviceId, payload, signature, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        ackData.transmissionId,
        ackData.ackType, // 1=Receipt, 2=Broadcast
        ackData.txHash,
        ackData.deviceId,
        JSON.stringify(ackData.payload),
        ackData.signature,
        ackData.timestamp,
        ackData.status || 'received',
      ])
      
      // Update transaction record with ACK reference
      if (ackData.ackType === 1) { // Receipt ACK
        db.runSync(`
          UPDATE ble_transactions 
          SET receiptAckId = ?, status = 'receipt_received' 
          WHERE transmissionId = ?
        `, [result.insertId, ackData.transmissionId])
      } else if (ackData.ackType === 2) { // Broadcast ACK
        db.runSync(`
          UPDATE ble_transactions 
          SET broadcastAckId = ?, status = ? 
          WHERE transmissionId = ?
        `, [
          result.insertId, 
          ackData.payload.result?.success ? 'broadcast_success' : 'broadcast_failed',
          ackData.transmissionId
        ])
      }
      
      resolve(result.insertId)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Get BLE transaction with acknowledgements
 */
export const getBleTransaction = (transmissionId) => {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.getFirstSync(`
        SELECT * FROM ble_transactions WHERE transmissionId = ?
      `, [transmissionId])
      
      if (transaction) {
        // Get associated acknowledgements
        const acks = db.getAllSync(`
          SELECT * FROM ble_acks WHERE transmissionId = ? ORDER BY ackType
        `, [transmissionId])
        
        transaction.acks = acks.map(ack => ({
          ...ack,
          payload: JSON.parse(ack.payload)
        }))
      }
      
      resolve(transaction)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Get all BLE transactions (with pagination)
 */
export const getBleTransactions = (limit = 50, offset = 0) => {
  return new Promise((resolve, reject) => {
    try {
      const transactions = db.getAllSync(`
        SELECT 
          bt.*,
          ra.payload as receiptAckPayload,
          ra.signature as receiptAckSignature,
          ba.payload as broadcastAckPayload,
          ba.signature as broadcastAckSignature,
          ba.txHash as broadcastTxHash
        FROM ble_transactions bt
        LEFT JOIN ble_acks ra ON bt.receiptAckId = ra.id
        LEFT JOIN ble_acks ba ON bt.broadcastAckId = ba.id
        ORDER BY bt.createdAt DESC
        LIMIT ? OFFSET ?
      `, [limit, offset])
      
      const processedTransactions = transactions.map(tx => ({
        ...tx,
        receiptAck: tx.receiptAckPayload ? {
          payload: JSON.parse(tx.receiptAckPayload),
          signature: tx.receiptAckSignature
        } : null,
        broadcastAck: tx.broadcastAckPayload ? {
          payload: JSON.parse(tx.broadcastAckPayload),
          signature: tx.broadcastAckSignature,
          txHash: tx.broadcastTxHash
        } : null
      }))
      
      resolve(processedTransactions)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Get transaction history combining both QR and BLE transactions
 */
export const getAllTransactionHistory = () => {
  return new Promise((resolve, reject) => {
    try {
      // Get legacy QR-based acks
      const qrAcks = db.getAllSync(`
        SELECT 
          'qr' as type,
          txHash,
          blockNumber,
          fromAddress as fromAddress,
          toAddress as toAddress,
          value,
          relayerAddress,
          'completed' as status,
          null as transmissionId,
          id as createdAt
        FROM acks 
        ORDER BY blockNumber DESC
      `)
      
      // Get BLE transactions
      const bleTransactions = db.getAllSync(`
        SELECT 
          'ble' as type,
          ba.txHash,
          null as blockNumber,
          bt.fromAddress,
          bt.toAddress,
          bt.value,
          bt.deviceId as relayerAddress,
          bt.status,
          bt.transmissionId,
          bt.createdAt
        FROM ble_transactions bt
        LEFT JOIN ble_acks ba ON bt.broadcastAckId = ba.id
        ORDER BY bt.createdAt DESC
      `)
      
      // Combine and sort by timestamp
      const allTransactions = [...qrAcks, ...bleTransactions].sort((a, b) => {
        const timeA = a.blockNumber || a.createdAt
        const timeB = b.blockNumber || b.createdAt
        return timeB - timeA
      })
      
      resolve(allTransactions)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Update BLE transaction status
 */
export const updateBleTransactionStatus = (transmissionId, status) => {
  return new Promise((resolve, reject) => {
    try {
      db.runSync(`
        UPDATE ble_transactions SET status = ? WHERE transmissionId = ?
      `, [status, transmissionId])
      resolve(true)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Get pending BLE transactions (for retry or monitoring)
 */
export const getPendingBleTransactions = () => {
  return new Promise((resolve, reject) => {
    try {
      const transactions = db.getAllSync(`
        SELECT * FROM ble_transactions 
        WHERE status IN ('pending', 'receipt_received') 
        ORDER BY createdAt ASC
      `)
      resolve(transactions)
    } catch (err) {
      reject(err)
    }
  })
}
