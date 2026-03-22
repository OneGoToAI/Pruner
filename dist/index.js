"use strict";
/**
 * Session Stats - Real-time tracking of session token data
 *
 * This module provides functionality to track token usage, costs, and statistics
 * for AI model requests in an in-memory session state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultPricingConfig = exports.getPricingConfig = exports.resetSession = exports.getSessionStats = exports.recordRequest = void 0;
var sessionStats_1 = require("./sessionStats");
Object.defineProperty(exports, "recordRequest", { enumerable: true, get: function () { return sessionStats_1.recordRequest; } });
Object.defineProperty(exports, "getSessionStats", { enumerable: true, get: function () { return sessionStats_1.getSessionStats; } });
Object.defineProperty(exports, "resetSession", { enumerable: true, get: function () { return sessionStats_1.resetSession; } });
var config_1 = require("./config");
Object.defineProperty(exports, "getPricingConfig", { enumerable: true, get: function () { return config_1.getPricingConfig; } });
Object.defineProperty(exports, "defaultPricingConfig", { enumerable: true, get: function () { return config_1.defaultPricingConfig; } });
//# sourceMappingURL=index.js.map