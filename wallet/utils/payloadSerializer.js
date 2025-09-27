/**
 * Transaction Payload Serialization & Chunking for BLE Transfer
 * Handles packing signed transactions into BLE-compatible chunks with metadata
 */

import { ethers } from 'ethers';
import CryptoJS from 'crypto-js';

// Phase 0 constants - will be refined in T0.6
export const MAX_CHUNK_SIZE = 240; // Bytes, accounting for BLE MTU limits
export const CHUNK_HEADER_SIZE = 9; // sessionId(4) + seq(2) + flags(1) + checksum(2)
export const MAX_PAYLOAD_PER_CHUNK = MAX_CHUNK_SIZE - CHUNK_HEADER_SIZE;

// Payload types
export const PAYLOAD_TYPES = {
  SIGNED_TRANSACTION: 0x01,
  RECEIPT_ACK: 0x02,
  BROADCAST_ACK: 0x03,
  HANDSHAKE: 0x04,
};

// Chunk flags
export const CHUNK_FLAGS = {
  FIRST_CHUNK: 0x01,
  LAST_CHUNK: 0x02,
  MIDDLE_CHUNK: 0x00,
  SINGLE_CHUNK: 0x03, // FIRST | LAST
};

/**
 * Create transaction payload for BLE transfer
 */
export function createTransactionPayload(signedTx, metadata = {}) {
  const txData = ethers.utils.parseTransaction(signedTx);
  
  const payload = {
    type: PAYLOAD_TYPES.SIGNED_TRANSACTION,
    timestamp: Date.now(),
    signedTx,
    metadata: {
      from: txData.from,
      to: txData.to,
      value: txData.value.toString(),
      nonce: txData.nonce,
      gasLimit: txData.gasLimit.toString(),
      gasPrice: txData.gasPrice?.toString(),
      chainId: txData.chainId,
      ...metadata,
    },
    signature: null, // Will be populated by sender
  };

  return payload;
}

/**
 * Create acknowledgement payload
 */
export function createAckPayload(type, txHash, result, relayerSignature = null) {
  return {
    type,
    timestamp: Date.now(),
    txHash,
    result: {
      success: result.success || false,
      error: result.error || null,
      blockNumber: result.blockNumber || null,
      gasUsed: result.gasUsed || null,
      ...result,
    },
    relayerSignature,
  };
}

/**
 * Serialize payload to binary format
 */
export function serializePayload(payload) {
  const jsonString = JSON.stringify(payload);
  return Buffer.from(jsonString, 'utf8');
}

/**
 * Deserialize payload from binary format
 */
export function deserializePayload(buffer) {
  try {
    const jsonString = buffer.toString('utf8');
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Payload deserialization failed: ${error.message}`);
  }
}

/**
 * Split payload into BLE-compatible chunks
 */
export function chunkPayload(payload, sessionId) {
  const serialized = serializePayload(payload);
  const totalSize = serialized.length;
  const chunks = [];
  
  if (totalSize <= MAX_PAYLOAD_PER_CHUNK) {
    // Single chunk
    const chunk = createChunk(
      sessionId,
      0, // sequence
      CHUNK_FLAGS.SINGLE_CHUNK,
      serialized
    );
    chunks.push(chunk);
  } else {
    // Multiple chunks
    let offset = 0;
    let sequence = 0;
    
    while (offset < totalSize) {
      const remainingBytes = totalSize - offset;
      const chunkSize = Math.min(remainingBytes, MAX_PAYLOAD_PER_CHUNK);
      const isFirst = offset === 0;
      const isLast = offset + chunkSize >= totalSize;
      
      let flags = CHUNK_FLAGS.MIDDLE_CHUNK;
      if (isFirst) flags |= CHUNK_FLAGS.FIRST_CHUNK;
      if (isLast) flags |= CHUNK_FLAGS.LAST_CHUNK;
      
      const chunkData = serialized.slice(offset, offset + chunkSize);
      const chunk = createChunk(sessionId, sequence, flags, chunkData);
      
      chunks.push(chunk);
      offset += chunkSize;
      sequence++;
    }
  }
  
  return chunks;
}

/**
 * Create individual chunk with header
 */
function createChunk(sessionId, sequence, flags, data) {
  const checksum = calculateChecksum(data);
  
  // Create header: sessionId(4) + sequence(2) + flags(1) + checksum(2)
  const header = Buffer.alloc(CHUNK_HEADER_SIZE);
  header.writeUInt32LE(sessionId, 0);
  header.writeUInt16LE(sequence, 4);
  header.writeUInt8(flags, 6);
  header.writeUInt16LE(checksum, 7);
  
  return {
    sessionId,
    sequence,
    flags,
    checksum,
    data,
    raw: Buffer.concat([header, data]),
  };
}

/**
 * Parse chunk from raw BLE data
 */
export function parseChunk(rawData) {
  if (rawData.length < CHUNK_HEADER_SIZE) {
    throw new Error('Invalid chunk: too small');
  }
  
  const header = rawData.slice(0, CHUNK_HEADER_SIZE);
  const data = rawData.slice(CHUNK_HEADER_SIZE);
  
  const sessionId = header.readUInt32LE(0);
  const sequence = header.readUInt16LE(4);
  const flags = header.readUInt8(6);
  const expectedChecksum = header.readUInt16LE(7);
  const actualChecksum = calculateChecksum(data);
  
  if (expectedChecksum !== actualChecksum) {
    throw new Error(`Chunk checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`);
  }
  
  return {
    sessionId,
    sequence,
    flags,
    checksum: actualChecksum,
    data,
    raw: rawData,
  };
}

/**
 * Reassemble chunks into original payload
 */
export class PayloadAssembler {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.chunks = new Map(); // sequence -> chunk
    this.totalChunks = null;
    this.isComplete = false;
    this.payload = null;
  }
  
  addChunk(chunk) {
    if (chunk.sessionId !== this.sessionId) {
      throw new Error(`Session ID mismatch: expected ${this.sessionId}, got ${chunk.sessionId}`);
    }
    
    if (this.chunks.has(chunk.sequence)) {
      // Duplicate chunk - ignore or log warning
      return false;
    }
    
    this.chunks.set(chunk.sequence, chunk);
    
    // Check if we have all chunks
    this._checkCompletion();
    
    return true;
  }
  
  _checkCompletion() {
    if (this.isComplete) return;
    
    const sequences = Array.from(this.chunks.keys()).sort((a, b) => a - b);
    
    // Check for gaps
    for (let i = 0; i < sequences.length - 1; i++) {
      if (sequences[i + 1] - sequences[i] !== 1) {
        return; // Gap found
      }
    }
    
    // Check if we have first and last chunks
    const firstChunk = this.chunks.get(0);
    if (!firstChunk || !(firstChunk.flags & CHUNK_FLAGS.FIRST_CHUNK)) {
      return;
    }
    
    const lastChunk = this.chunks.get(sequences[sequences.length - 1]);
    if (!lastChunk || !(lastChunk.flags & CHUNK_FLAGS.LAST_CHUNK)) {
      return;
    }
    
    // All chunks present - reassemble
    this._reassemble();
  }
  
  _reassemble() {
    const sequences = Array.from(this.chunks.keys()).sort((a, b) => a - b);
    const dataBuffers = sequences.map(seq => this.chunks.get(seq).data);
    const completeBuffer = Buffer.concat(dataBuffers);
    
    try {
      this.payload = deserializePayload(completeBuffer);
      this.isComplete = true;
    } catch (error) {
      throw new Error(`Payload reassembly failed: ${error.message}`);
    }
  }
  
  getProgress() {
    return {
      receivedChunks: this.chunks.size,
      totalChunks: this.totalChunks,
      isComplete: this.isComplete,
      completionPercentage: this.totalChunks ? (this.chunks.size / this.totalChunks) * 100 : 0,
    };
  }
}

/**
 * Calculate simple checksum for chunk validation
 */
function calculateChecksum(data) {
  return CryptoJS.CRC32(data.toString('hex')).toString() & 0xFFFF;
}

/**
 * Generate unique session ID
 */
export function generateSessionId() {
  return Math.floor(Math.random() * 0xFFFFFFFF);
}

export default {
  createTransactionPayload,
  createAckPayload,
  serializePayload,
  deserializePayload,
  chunkPayload,
  parseChunk,
  PayloadAssembler,
  generateSessionId,
  PAYLOAD_TYPES,
  CHUNK_FLAGS,
};
