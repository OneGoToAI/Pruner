"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const proxy_1 = require("./proxy");
const chalk_1 = __importDefault(require("chalk"));
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
async function startServer() {
    try {
        const app = (0, proxy_1.createApp)();
        const server = app.listen(PORT, HOST, () => {
            console.log(chalk_1.default.green(`🚀 Pruner proxy server started`));
            console.log(chalk_1.default.blue(`   → Listening on ${HOST}:${PORT}`));
            console.log(chalk_1.default.gray(`   → Environment: ${process.env.NODE_ENV || 'development'}`));
            console.log(chalk_1.default.gray(`   → Ready to proxy Claude API requests\n`));
        });
        // Graceful shutdown handling
        process.on('SIGTERM', () => {
            console.log(chalk_1.default.yellow('\n📋 Received SIGTERM, shutting down gracefully...'));
            server.close(() => {
                console.log(chalk_1.default.gray('✅ Server closed'));
                process.exit(0);
            });
        });
        process.on('SIGINT', () => {
            console.log(chalk_1.default.yellow('\n📋 Received SIGINT, shutting down gracefully...'));
            server.close(() => {
                console.log(chalk_1.default.gray('✅ Server closed'));
                process.exit(0);
            });
        });
    }
    catch (error) {
        console.error(chalk_1.default.red('❌ Failed to start server:'), error);
        process.exit(1);
    }
}
// Start the server
startServer().catch((error) => {
    console.error(chalk_1.default.red('💥 Unhandled error during startup:'), error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map