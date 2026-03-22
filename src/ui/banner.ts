/**
 * Banner and report display functionality for Pruner
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import { SessionStats, BannerConfig, ReportOptions } from '../types';

const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  useColors: true,
  bannerWidth: 42,
  currencySymbol: '$'
};

/**
 * Print the startup banner
 */
export function printStartupBanner(config: BannerConfig): void {
  console.log();

  const title = chalk.cyan.bold('🚀 Pruner Token Compression Proxy');
  const version = chalk.gray(`v${config.version}`);
  const port = chalk.green(`Port: ${config.port}`);
  const separator = chalk.gray('─'.repeat(50));

  console.log(separator);
  console.log(`${title} ${version}`);
  console.log(`${port}`);
  console.log(chalk.gray('Ready to optimize your Claude API requests'));
  console.log(separator);
  console.log();
}

/**
 * Print the final session report
 */
export function printFinalReport(stats: SessionStats, options: Partial<ReportOptions> = {}): void {
  const opts = { ...DEFAULT_REPORT_OPTIONS, ...options };

  console.log();

  // Handle zero requests case
  if (stats.requestCount === 0) {
    printEmptySessionMessage(opts);
    return;
  }

  printSessionReport(stats, opts);
  console.log();
}

/**
 * Print a message for sessions with no requests
 */
function printEmptySessionMessage(options: ReportOptions): void {
  const { useColors } = options;

  const title = useColors ? chalk.yellow('💤 Pruner 会话报告') : '💤 Pruner 会话报告';
  const message = useColors ? chalk.gray('本次会话未处理任何请求') : '本次会话未处理任何请求';
  const tip = useColors ? chalk.dim('提示：代理已就绪，等待 API 请求') : '提示：代理已就绪，等待 API 请求';

  // Create table for consistent formatting
  const table = new Table({
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
      'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
      'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
      'right': '║', 'right-mid': '╢', 'middle': '│'
    },
    style: { 'padding-left': 1, 'padding-right': 1, border: useColors ? ['cyan'] : [] },
    colWidths: [options.bannerWidth]
  });

  table.push(
    [{ content: title, hAlign: 'center' }],
    [{ content: message, hAlign: 'center' }],
    [{ content: tip, hAlign: 'center' }]
  );

  console.log(table.toString());
}

/**
 * Print the detailed session report
 */
function printSessionReport(stats: SessionStats, options: ReportOptions): void {
  const { useColors, currencySymbol } = options;

  // Format numbers with commas
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  };

  const formatCurrency = (amount: number): string => {
    return `${currencySymbol}${amount.toFixed(2)}`;
  };

  const formatPercentage = (percent: number): string => {
    return `${percent.toFixed(1)}%`;
  };

  // Prepare data
  const requestCount = formatNumber(stats.requestCount);
  const originalTokens = formatNumber(stats.originalTokens);
  const compressedTokens = formatNumber(stats.compressedTokens);
  const savingsPercent = formatPercentage(stats.savingsPercentage);
  const sessionSavings = formatCurrency(stats.sessionCostSavings);
  const cumulativeSavings = formatCurrency(stats.cumulativeCostSavings);

  // Create the report table
  const table = new Table({
    chars: {
      'top': '═', 'top-mid': '╤', 'top-left': '╔', 'top-right': '╗',
      'bottom': '═', 'bottom-mid': '╧', 'bottom-left': '╚', 'bottom-right': '╝',
      'left': '║', 'left-mid': '╟', 'mid': '─', 'mid-mid': '┼',
      'right': '║', 'right-mid': '╢', 'middle': '│'
    },
    style: {
      'padding-left': 1,
      'padding-right': 1,
      border: useColors ? ['cyan'] : []
    },
    colWidths: [options.bannerWidth]
  });

  // Title row
  const title = useColors ?
    chalk.yellow.bold('💰 Pruner 会话报告') :
    '💰 Pruner 会话报告';

  table.push([{ content: title, hAlign: 'center' }]);

  // Add separator
  table.push([{ content: '', colSpan: 1 }]);

  // Data rows
  const rows = [
    ['请求数', requestCount],
    ['原始 Token', originalTokens],
    ['压缩后 Token', compressedTokens],
    ['节省比例', savingsPercent],
    ['本次节省', sessionSavings],
    ['累计节省', cumulativeSavings]
  ];

  rows.forEach(([label, value]) => {
    const formattedLabel = useColors ? chalk.gray(label) : label;
    const formattedValue = useColors ?
      (label.includes('节省') ? chalk.green.bold(value) : chalk.white(value)) :
      value;

    const paddedLabel = label.padEnd(12);
    const content = `${formattedLabel.padEnd(12)} ${formattedValue}`;

    table.push([content]);
  });

  console.log(table.toString());
}

/**
 * Print a simple text-based report (fallback for environments without table support)
 */
export function printSimpleReport(stats: SessionStats, options: Partial<ReportOptions> = {}): void {
  const opts = { ...DEFAULT_REPORT_OPTIONS, ...options };

  console.log();

  if (stats.requestCount === 0) {
    console.log('💤 本次会话未处理任何请求');
    console.log('提示：代理已就绪，等待 API 请求');
    return;
  }

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  };

  console.log('💰 Pruner 会话报告');
  console.log('═'.repeat(30));
  console.log(`请求数:        ${formatNumber(stats.requestCount)}`);
  console.log(`原始 Token:    ${formatNumber(stats.originalTokens)}`);
  console.log(`压缩后 Token:   ${formatNumber(stats.compressedTokens)}`);
  console.log(`节省比例:       ${stats.savingsPercentage.toFixed(1)}%`);
  console.log(`本次节省:       ${opts.currencySymbol}${stats.sessionCostSavings.toFixed(2)}`);
  console.log(`累计节省:       ${opts.currencySymbol}${stats.cumulativeCostSavings.toFixed(2)}`);
  console.log('═'.repeat(30));
  console.log();
}

/**
 * Setup exit handlers to print the final report
 */
export function setupExitHandlers(getStats: () => SessionStats | null): void {
  const handleExit = () => {
    const stats = getStats();
    if (stats) {
      printFinalReport(stats);
    }
  };

  // Handle different exit scenarios
  process.on('SIGINT', () => {
    console.log('\n'); // New line after ^C
    handleExit();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    handleExit();
    process.exit(0);
  });

  process.on('exit', () => {
    // This runs when process.exit() is called
    // Note: stats should already be finalized by this point
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    handleExit();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    handleExit();
    process.exit(1);
  });
}