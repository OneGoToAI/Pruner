import chalk from 'chalk';

export function showBanner(): void {
  const banner = `
${chalk.green('╔═══════════════════════════════════════╗')}
${chalk.green('║')}           ${chalk.blue.bold('🌲 PRUNER')}              ${chalk.green('║')}
${chalk.green('║')}    ${chalk.gray('Intelligent LLM API Proxy')}     ${chalk.green('║')}
${chalk.green('╚═══════════════════════════════════════╝')}
`;

  console.log(banner);
  console.log(chalk.gray('Version: 1.0.0'));
  console.log(chalk.gray('Optimizing your LLM API requests...'));
  console.log();
}

export function showStartupMessage(host: string, port: number): void {
  console.log(chalk.green('✅ Proxy server started successfully!'));
  console.log(chalk.blue(`🌐 Server URL: http://${host}:${port}`));
  console.log(chalk.yellow('📊 Statistics: http://${host}:${port}/stats'));
  console.log(chalk.cyan('❤️  Health check: http://${host}:${port}/health'));
  console.log();
  console.log(chalk.gray('Press Ctrl+C to stop the server'));
}

export function showShutdownMessage(): void {
  console.log();
  console.log(chalk.yellow('🛑 Shutting down Pruner proxy server...'));
  console.log(chalk.gray('Goodbye! 👋'));
}

export function showErrorMessage(error: string): void {
  console.log();
  console.log(chalk.red('❌ Error: ') + error);
  console.log();
}

export function showSuccessMessage(message: string): void {
  console.log(chalk.green('✅ ') + message);
}

export function showWarningMessage(message: string): void {
  console.log(chalk.yellow('⚠️  ') + message);
}

export function showInfoMessage(message: string): void {
  console.log(chalk.blue('ℹ️  ') + message);
}