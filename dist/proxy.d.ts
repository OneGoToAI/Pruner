import express from 'express';
export interface TokenStats {
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    savings: number;
}
export interface MessageRequest {
    messages: any[];
    model: string;
    max_tokens?: number;
    temperature?: number;
    [key: string]: any;
}
export interface MessageResponse {
    id: string;
    type: string;
    role: string;
    content: any[];
    model: string;
    stop_reason: string;
    stop_sequence: string | null;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}
/**
 * Formats a number with thousand separators (commas)
 */
export declare function formatNumber(num: number): string;
/**
 * Calculates token compression statistics
 */
export declare function calculateTokenStats(originalTokens: number, compressedTokens: number): TokenStats;
/**
 * Prints colored token statistics to console
 */
export declare function printTokenStats(stats: TokenStats, isPassthrough?: boolean): void;
/**
 * Mock function to simulate token compression
 * In a real implementation, this would integrate with the actual compression engine
 */
export declare function compressMessages(messages: any[]): {
    compressed: any[];
    originalTokens: number;
    compressedTokens: number;
};
/**
 * Creates an Express router for handling Claude API proxy requests
 */
export declare function createProxyRouter(): express.Router;
/**
 * Creates and configures the Express application
 */
export declare function createApp(): express.Application;
//# sourceMappingURL=proxy.d.ts.map