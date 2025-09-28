/**
 * Relayer API Service - Handles HTTP communication with Node.js relayer backend
 * Implements T2.4 - FR-13, FR-14: Relayer API Connection and Broadcast Handling
 */

import { Alert } from 'react-native';

// Default relayer API configuration
const DEFAULT_CONFIG = {
  baseUrl: process.env.EXPO_PUBLIC_RELAYER_URL || 'http://localhost:3001',
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
};

export class RelayerApiService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config.logger || console;
  }

  /**
   * Forward signed transaction to Node.js relayer for broadcast (FR-13)
   * @param {Object} payload - Transaction payload from BLE
   * @param {string} relayerAddress - Address of the relayer device
   * @returns {Promise<Object>} - Broadcast result with tx hash or error
   */
  async broadcastTransaction(payload, relayerAddress) {
    const endpoint = '/api/v1/broadcast';
    const requestBody = {
      signedTx: payload.signedTx,
      metadata: payload.metadata,
      relayerAddress,
      bleSource: true,
      timestamp: Date.now(),
    };

    try {
      this.logger.info('[relayer-api] broadcasting transaction', {
        from: payload.metadata.from,
        to: payload.metadata.to,
        value: payload.metadata.value,
      });

      const response = await this._makeRequest('POST', endpoint, requestBody);

      if (response.success) {
        this.logger.info('[relayer-api] transaction broadcasted successfully', {
          txHash: response.txHash,
          blockNumber: response.blockNumber,
        });

        return {
          success: true,
          txHash: response.txHash,
          blockNumber: response.blockNumber,
          gasUsed: response.gasUsed,
          effectiveGasPrice: response.effectiveGasPrice,
          status: response.status,
          confirmations: response.confirmations || 0,
          timestamp: Date.now(),
        };
      } else {
        throw new Error(response.error || 'Broadcast failed');
      }
    } catch (error) {
      this.logger.error('[relayer-api] broadcast failed:', error);
      
      return {
        success: false,
        error: error.message,
        code: error.code || 'BROADCAST_ERROR',
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get balance information for an address (T2.7 - FR-30)
   * @param {string} address - Wallet address to check
   * @returns {Promise<Object>} - Balance information with signature
   */
  async getBalance(address) {
    const endpoint = `/api/v1/balance/${address}`;
    
    try {
      this.logger.info('[relayer-api] fetching balance', { address: address.slice(0, 10) });

      const response = await this._makeRequest('GET', endpoint);

      if (response.success) {
        return {
          success: true,
          address: response.address,
          nativeBalance: response.nativeBalance,
          protocolBalance: response.protocolBalance,
          nonce: response.nonce,
          timestamp: response.timestamp,
          signature: response.signature,
          dataSource: 'relayer-api',
        };
      } else {
        throw new Error(response.error || 'Balance fetch failed');
      }
    } catch (error) {
      this.logger.error('[relayer-api] balance fetch failed:', error);
      
      return {
        success: false,
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Health check for relayer API
   * @returns {Promise<boolean>} - True if relayer is healthy
   */
  async healthCheck() {
    try {
      const response = await this._makeRequest('GET', '/api/v1/health');
      return response.status === 'ok';
    } catch (error) {
      this.logger.warn('[relayer-api] health check failed:', error.message);
      return false;
    }
  }

  /**
   * Get relayer information
   * @returns {Promise<Object>} - Relayer metadata
   */
  async getRelayerInfo() {
    try {
      const response = await this._makeRequest('GET', '/api/v1/info');
      return {
        success: true,
        address: response.address,
        chainId: response.chainId,
        networkName: response.networkName,
        version: response.version,
        capabilities: response.capabilities || [],
      };
    } catch (error) {
      this.logger.error('[relayer-api] relayer info fetch failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Submit acknowledgement to relayer for persistence
   * @param {Object} ack - Acknowledgement data
   * @returns {Promise<boolean>} - Success status
   */
  async submitAck(ack) {
    const endpoint = '/api/v1/acknowledgements';
    
    try {
      const response = await this._makeRequest('POST', endpoint, ack);
      return response.success;
    } catch (error) {
      this.logger.error('[relayer-api] ACK submission failed:', error);
      return false;
    }
  }

  /**
   * Make HTTP request with retry logic and error handling
   * @private
   */
  async _makeRequest(method, endpoint, body = null, attempt = 1) {
    const url = `${this.config.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OfflinePay-Mobile/1.0',
        'X-Request-ID': this._generateRequestId(),
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      this.logger.debug('[relayer-api] request', { method, endpoint, attempt });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      options.signal = controller.signal;

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }

        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        error.message = 'Request timeout';
      }

      // Retry logic for network errors
      if (attempt < this.config.maxRetries && this._isRetryableError(error)) {
        this.logger.warn('[relayer-api] retrying request', { 
          attempt, 
          maxRetries: this.config.maxRetries,
          error: error.message 
        });
        
        await this._delay(this.config.retryDelay * attempt);
        return this._makeRequest(method, endpoint, body, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    return (
      error.name === 'AbortError' ||
      error.message.includes('timeout') ||
      error.message.includes('network') ||
      error.message.includes('ECONNRESET') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('fetch')
    );
  }

  /**
   * Generate unique request ID
   * @private
   */
  _generateRequestId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Delay utility for retries
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Test connection to relayer
   * @returns {Promise<Object>} - Connection test result
   */
  async testConnection() {
    const startTime = Date.now();
    
    try {
      const isHealthy = await this.healthCheck();
      const responseTime = Date.now() - startTime;
      
      if (isHealthy) {
        const info = await this.getRelayerInfo();
        return {
          success: true,
          responseTime,
          relayerInfo: info.success ? info : null,
          url: this.config.baseUrl,
        };
      } else {
        return {
          success: false,
          error: 'Health check failed',
          responseTime,
          url: this.config.baseUrl,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        responseTime: Date.now() - startTime,
        url: this.config.baseUrl,
      };
    }
  }
}

// Export singleton instance
export const relayerApi = new RelayerApiService();

export default RelayerApiService;
