// src/htmlex.js
/**
 * @module HTMLeX
 * @description Entry point for HTMLeX, a declarative, server-driven UI framework.
 */

import { installRuntimeErrorBoundary, Logger } from './logger.js';

installRuntimeErrorBoundary();
Logger.system.debug("[HTMLeX] Entry point module loaded.");

export { initHTMLeX } from './registration.js';
