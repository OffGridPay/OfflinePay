/**
 * Polyfills for React Native environment
 * Adds Node.js globals like Buffer that aren't available by default
 */

import { Buffer } from 'buffer';

// Make Buffer available globally (like in Node.js)
global.Buffer = Buffer;

// Also make it available as a named export
export { Buffer };
