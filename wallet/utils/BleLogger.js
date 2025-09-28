/**
 * Enhanced BLE Logger for Native Builds
 * Provides comprehensive logging, debugging, and error reporting for BLE functionality
 */

import { Platform } from 'react-native';

class BleLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000; // Keep last 1000 logs
    this.logLevel = __DEV__ ? 'debug' : 'info';
    this.subscribers = [];
  }

  // Log levels: debug, info, warn, error
  setLogLevel(level) {
    this.logLevel = level;
  }

  _shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  _formatMessage(level, tag, message, data = null) {
    const timestamp = new Date().toISOString();
    const platform = Platform.OS;
    const formatted = {
      timestamp,
      level: level.toUpperCase(),
      platform,
      tag,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      data: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null,
      id: Date.now() + Math.random().toString(36).substr(2),
    };

    // Add to internal log buffer
    this.logs.push(formatted);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Notify subscribers
    this.subscribers.forEach(callback => {
      try {
        callback(formatted);
      } catch (error) {
        console.warn('BleLogger subscriber error:', error);
      }
    });

    return formatted;
  }

  debug(tag, message, data = null) {
    if (!this._shouldLog('debug')) return;
    const log = this._formatMessage('debug', tag, message, data);
    console.log(`🔍 [${tag}] ${log.message}`, data || '');
    return log;
  }

  info(tag, message, data = null) {
    if (!this._shouldLog('info')) return;
    const log = this._formatMessage('info', tag, message, data);
    console.log(`ℹ️ [${tag}] ${log.message}`, data || '');
    return log;
  }

  warn(tag, message, data = null) {
    if (!this._shouldLog('warn')) return;
    const log = this._formatMessage('warn', tag, message, data);
    console.warn(`⚠️ [${tag}] ${log.message}`, data || '');
    return log;
  }

  error(tag, message, data = null) {
    if (!this._shouldLog('error')) return;
    const log = this._formatMessage('error', tag, message, data);
    console.error(`❌ [${tag}] ${log.message}`, data || '');
    
    // Enhanced error logging for debugging
    if (data instanceof Error) {
      console.error(`❌ [${tag}] Stack:`, data.stack);
    }
    
    return log;
  }

  // BLE-specific logging methods
  logPermissionRequest(permissions, results) {
    return this.info('BLE-PERMISSIONS', 'Permission request completed', {
      permissions,
      results,
      platform: Platform.OS,
      apiLevel: Platform.Version,
    });
  }

  logBleState(state, previous = null) {
    return this.info('BLE-STATE', `Adapter state changed: ${previous} -> ${state}`, {
      state,
      previous,
      timestamp: Date.now(),
    });
  }

  logDeviceDiscovered(device) {
    return this.debug('BLE-DISCOVERY', 'Device discovered', {
      id: device.id?.slice(0, 8),
      name: device.name,
      rssi: device.rssi,
      isConnectable: device.isConnectable,
      manufacturerData: device.manufacturerData,
    });
  }

  logConnectionAttempt(deviceId, action) {
    return this.info('BLE-CONNECTION', `${action} device ${deviceId?.slice(0, 8)}`);
  }

  logHandshakeStep(step, deviceId, success, error = null) {
    return this.info('BLE-HANDSHAKE', `${step} - ${success ? 'SUCCESS' : 'FAILED'}`, {
      deviceId: deviceId?.slice(0, 8),
      step,
      success,
      error: error?.message,
    });
  }

  logPayloadTransmission(type, size, chunks = null) {
    return this.info('BLE-PAYLOAD', `Transmitting ${type} payload`, {
      type,
      size,
      chunks,
    });
  }

  // Subscribe to log updates (for UI display)
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  // Get recent logs for debugging
  getRecentLogs(count = 100) {
    return this.logs.slice(-count);
  }

  // Get logs by level
  getLogsByLevel(level) {
    return this.logs.filter(log => log.level === level.toUpperCase());
  }

  // Export logs for debugging
  exportLogs() {
    const logsText = this.logs.map(log => 
      `${log.timestamp} [${log.level}] [${log.tag}] ${log.message}${log.data ? ' | ' + log.data : ''}`
    ).join('\n');
    
    return {
      logs: this.logs,
      text: logsText,
      platform: Platform.OS,
      version: Platform.Version,
      timestamp: new Date().toISOString(),
    };
  }

  // Clear logs
  clear() {
    this.logs = [];
    this.info('BLE-LOGGER', 'Logs cleared');
  }

  // Create contextual logger for specific components
  createContextLogger(context) {
    return {
      debug: (message, data) => this.debug(context, message, data),
      info: (message, data) => this.info(context, message, data),
      warn: (message, data) => this.warn(context, message, data),
      error: (message, data) => this.error(context, message, data),
    };
  }
}

// Singleton instance
export const bleLogger = new BleLogger();

// Enhanced console logger that integrates with BleLogger
export const createEnhancedLogger = (tag) => {
  return {
    debug: (message, data) => bleLogger.debug(tag, message, data),
    info: (message, data) => bleLogger.info(tag, message, data),
    warn: (message, data) => bleLogger.warn(tag, message, data),
    error: (message, data) => bleLogger.error(tag, message, data),
    
    // BLE-specific methods
    logPermissionRequest: (perms, results) => bleLogger.logPermissionRequest(perms, results),
    logBleState: (state, prev) => bleLogger.logBleState(state, prev),
    logDeviceDiscovered: (device) => bleLogger.logDeviceDiscovered(device),
    logConnectionAttempt: (deviceId, action) => bleLogger.logConnectionAttempt(deviceId, action),
    logHandshakeStep: (step, deviceId, success, error) => bleLogger.logHandshakeStep(step, deviceId, success, error),
    logPayloadTransmission: (type, size, chunks) => bleLogger.logPayloadTransmission(type, size, chunks),
  };
};

export default BleLogger;
