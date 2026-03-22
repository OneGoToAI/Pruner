"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatNumber = formatNumber;
exports.calculateTokenStats = calculateTokenStats;
exports.printTokenStats = printTokenStats;
exports.compressMessages = compressMessages;
exports.createProxyRouter = createProxyRouter;
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Formats a number with thousand separators (commas)
 */
function formatNumber(num) {
    return num.toLocaleString('en-US');
}
/**
 * Calculates token compression statistics
 */
function calculateTokenStats(originalTokens, compressedTokens) {
    const compressionRatio = ((originalTokens - compressedTokens) / originalTokens) * 100;
    // Assuming $0.003 per 1000 input tokens (Claude-3.5 pricing)
    const inputCostPer1k = 0.003;
    const savings = ((originalTokens - compressedTokens) / 1000) * inputCostPer1k;
    return {
        originalTokens,
        compressedTokens,
        compressionRatio,
        savings
    };
}
/**
 * Prints colored token statistics to console
 */
function printTokenStats(stats, isPassthrough = false) {
    const { originalTokens, compressedTokens, compressionRatio, savings } = stats;
    if (isPassthrough) {
        // When compression engine is degraded (direct passthrough)
        console.log(chalk_1.default.gray(`[Pruner] → 透传: ${formatNumber(originalTokens)} tokens | 无压缩`));
        return;
    }
    const compressionText = compressionRatio > 0 ?
        chalk_1.default.green(`-${compressionRatio.toFixed(1)}%`) :
        chalk_1.default.gray('0.0%');
    const savingsText = savings > 0.001 ?
        chalk_1.default.green(`$${savings.toFixed(3)}`) :
        chalk_1.default.gray('$0.000');
    console.log(`${chalk_1.default.blue('[Pruner]')} ${chalk_1.default.cyan('↓')} 压缩: ${formatNumber(originalTokens)} → ${formatNumber(compressedTokens)} tokens (${compressionText}) | 节省: ${savingsText}`);
}
/**
 * Mock function to simulate token compression
 * In a real implementation, this would integrate with the actual compression engine
 */
function compressMessages(messages) {
    // Validate input
    if (!Array.isArray(messages)) {
        throw new Error('Messages must be an array');
    }
    // Mock implementation - replace with actual compression logic
    const messageText = JSON.stringify(messages);
    const originalTokens = Math.floor(messageText.length / 4); // Rough token estimation
    // Simulate compression (in reality this would be much more sophisticated)
    const compressionFactor = 0.25; // 75% reduction
    const compressedTokens = Math.floor(originalTokens * compressionFactor);
    return {
        compressed: messages, // In reality, this would be compressed
        originalTokens,
        compressedTokens
    };
}
/**
 * Creates an Express router for handling Claude API proxy requests
 */
function createProxyRouter() {
    const router = express_1.default.Router();
    // POST /v1/messages endpoint handler
    router.post('/v1/messages', async (req, res) => {
        try {
            const messageRequest = req.body;
            // Validate required fields
            if (!messageRequest || !Array.isArray(messageRequest.messages)) {
                return res.status(400).json({
                    error: 'Bad Request',
                    message: 'Request must include a messages array'
                });
            }
            // Get original token count
            const originalMessages = messageRequest.messages;
            let compressedMessages = originalMessages;
            let tokenStats;
            let isPassthrough = false;
            try {
                // Attempt compression
                const compressionResult = compressMessages(originalMessages);
                compressedMessages = compressionResult.compressed;
                tokenStats = calculateTokenStats(compressionResult.originalTokens, compressionResult.compressedTokens);
            }
            catch (error) {
                // Compression engine degraded - use passthrough
                console.warn('Compression engine failed, using passthrough:', error);
                isPassthrough = true;
                const estimatedTokens = Math.floor(JSON.stringify(originalMessages).length / 4);
                tokenStats = calculateTokenStats(estimatedTokens, estimatedTokens);
            }
            // Forward request to Claude API
            const claudeRequest = {
                ...messageRequest,
                messages: compressedMessages
            };
            // Mock Claude API response (replace with actual API call)
            const claudeResponse = {
                id: 'msg_' + Date.now(),
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Mock response from Claude API' }],
                model: messageRequest.model || 'claude-3.5-sonnet-20241022',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: {
                    input_tokens: tokenStats.compressedTokens,
                    output_tokens: 150
                }
            };
            // Print token statistics after processing
            printTokenStats(tokenStats, isPassthrough);
            // Return response to client
            res.json(claudeResponse);
        }
        catch (error) {
            console.error('Error processing /v1/messages request:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'Failed to process request'
            });
        }
    });
    return router;
}
/**
 * Creates and configures the Express application
 */
function createApp() {
    const app = (0, express_1.default)();
    // Middleware
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // Error handling middleware for malformed JSON
    app.use((err, req, res, next) => {
        if (err instanceof SyntaxError && 'body' in err) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Invalid JSON in request body'
            });
        }
        next(err);
    });
    // Add proxy router
    app.use('/', createProxyRouter());
    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    return app;
}
//# sourceMappingURL=proxy.js.map