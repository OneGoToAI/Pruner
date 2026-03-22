import { createApp } from './proxy';
import chalk from 'chalk';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
  try {
    const app = createApp();

    const server = app.listen(PORT, HOST, () => {
      console.log(chalk.green(`🚀 Pruner proxy server started`));
      console.log(chalk.blue(`   → Listening on ${HOST}:${PORT}`));
      console.log(chalk.gray(`   → Environment: ${process.env.NODE_ENV || 'development'}`));
      console.log(chalk.gray(`   → Ready to proxy Claude API requests\n`));
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n📋 Received SIGTERM, shutting down gracefully...'));
      server.close(() => {
        console.log(chalk.gray('✅ Server closed'));
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n📋 Received SIGINT, shutting down gracefully...'));
      server.close(() => {
        console.log(chalk.gray('✅ Server closed'));
        process.exit(0);
      });
    });

  } catch (error) {
    console.error(chalk.red('❌ Failed to start server:'), error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error(chalk.red('💥 Unhandled error during startup:'), error);
  process.exit(1);
});