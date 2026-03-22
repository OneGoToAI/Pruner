import chalk from 'chalk';
import Table from 'cli-table3';
import { StatsCounter, Stats } from './counter';
import { StatsDatabase, DailyStats } from './db';

export class StatsReporter {
  constructor(
    private statsCounter: StatsCounter,
    private statsDatabase: StatsDatabase
  ) {}

  generateConsoleReport(): string {
    const stats = this.statsCounter.getStats();

    let report = '\n' + chalk.blue.bold('=== PRUNER STATISTICS REPORT ===\n');

    // Overview table
    const overviewTable = new Table({
      head: [chalk.cyan('Metric'), chalk.cyan('Value')],
      colWidths: [25, 15]
    });

    overviewTable.push(
      ['Total Requests', chalk.green(stats.requests.toString())],
      ['Successful Responses', chalk.green(stats.responses.toString())],
      ['Errors', stats.errors > 0 ? chalk.red(stats.errors.toString()) : chalk.green('0')],
      ['Cache Hits', chalk.yellow(stats.cacheHits.toString())],
      ['Cache Misses', chalk.gray(stats.cacheMisses.toString())],
      ['Tokens Saved', chalk.blue(stats.totalTokensSaved.toString())],
      ['Uptime (seconds)', chalk.magenta(stats.uptime.toString())]
    );

    report += overviewTable.toString() + '\n';

    // Performance metrics
    const cacheHitRate = this.statsCounter.getCacheHitRate() * 100;
    const successRate = this.statsCounter.getSuccessRate() * 100;

    const metricsTable = new Table({
      head: [chalk.cyan('Performance Metric'), chalk.cyan('Value')],
      colWidths: [25, 15]
    });

    metricsTable.push(
      ['Cache Hit Rate', `${cacheHitRate.toFixed(1)}%`],
      ['Success Rate', `${successRate.toFixed(1)}%`],
      ['Start Time', stats.startTime]
    );

    report += metricsTable.toString() + '\n';

    return report;
  }

  generateDailySummary(date?: string): string {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const endDate = targetDate + ' 23:59:59';
    const startDate = targetDate + ' 00:00:00';

    const dailyStats = this.statsDatabase.getStatsByDateRange(startDate, endDate);

    if (dailyStats.length === 0) {
      return chalk.yellow(`No data found for ${targetDate}`);
    }

    const stats = dailyStats[0];

    let report = '\n' + chalk.blue.bold(`=== DAILY SUMMARY - ${targetDate} ===\n`);

    const dailyTable = new Table({
      head: [chalk.cyan('Metric'), chalk.cyan('Value')],
      colWidths: [25, 15]
    });

    dailyTable.push(
      ['Date', targetDate],
      ['Total Requests', stats.total_requests.toString()],
      ['Total Errors', stats.total_errors.toString()],
      ['Total Tokens', stats.total_tokens.toString()],
      ['Cache Hits', stats.total_cache_hits.toString()],
      ['Avg Response Time', `${stats.avg_response_time.toFixed(2)}ms`]
    );

    report += dailyTable.toString() + '\n';

    return report;
  }

  generateWeeklySummary(): string {
    const endDate = new Date().toISOString();
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const weeklyStats = this.statsDatabase.getStatsByDateRange(startDate, endDate);

    let report = '\n' + chalk.blue.bold('=== WEEKLY SUMMARY ===\n');

    if (weeklyStats.length === 0) {
      return report + chalk.yellow('No data available for the past week.');
    }

    const weeklyTable = new Table({
      head: [
        chalk.cyan('Date'),
        chalk.cyan('Requests'),
        chalk.cyan('Errors'),
        chalk.cyan('Cache Hits'),
        chalk.cyan('Avg RT (ms)')
      ],
      colWidths: [12, 10, 8, 12, 15]
    });

    weeklyStats.forEach((day: any) => {
      weeklyTable.push([
        day.date,
        day.total_requests.toString(),
        day.total_errors.toString(),
        day.total_cache_hits.toString(),
        day.avg_response_time.toFixed(1)
      ]);
    });

    report += weeklyTable.toString() + '\n';

    // Weekly totals
    const totals = weeklyStats.reduce((acc: any, day: any) => ({
      requests: acc.requests + day.total_requests,
      errors: acc.errors + day.total_errors,
      cacheHits: acc.cacheHits + day.total_cache_hits,
      tokens: acc.tokens + day.total_tokens
    }), { requests: 0, errors: 0, cacheHits: 0, tokens: 0 });

    const totalsTable = new Table({
      head: [chalk.cyan('Weekly Totals'), chalk.cyan('Value')],
      colWidths: [25, 15]
    });

    totalsTable.push(
      ['Total Requests', totals.requests.toString()],
      ['Total Errors', totals.errors.toString()],
      ['Total Cache Hits', totals.cacheHits.toString()],
      ['Total Tokens', totals.tokens.toString()]
    );

    report += totalsTable.toString() + '\n';

    return report;
  }

  printReport(type: 'console' | 'daily' | 'weekly' = 'console', date?: string): void {
    let report: string;

    switch (type) {
      case 'daily':
        report = this.generateDailySummary(date);
        break;
      case 'weekly':
        report = this.generateWeeklySummary();
        break;
      default:
        report = this.generateConsoleReport();
    }

    console.log(report);
  }

  /**
   * Generate and print a final report when the CLI session ends
   */
  printFinalReport(): void {
    const stats = this.statsCounter.getStats();

    if (stats.requests === 0) {
      return; // No activity, no report needed
    }

    console.log('\n' + chalk.blue('=== Session Summary ==='));

    const summaryTable = new Table({
      head: [chalk.cyan('Metric'), chalk.cyan('Value')],
      colWidths: [20, 15],
      style: { head: [], border: [] }
    });

    summaryTable.push(
      ['Requests', stats.requests.toString()],
      ['Errors', stats.errors > 0 ? chalk.red(stats.errors.toString()) : '0'],
      ['Cache Hits', stats.cacheHits > 0 ? chalk.green(stats.cacheHits.toString()) : '0'],
      ['Tokens Saved', stats.totalTokensSaved > 0 ? chalk.blue(stats.totalTokensSaved.toString()) : '0'],
      ['Session Time', `${stats.uptime}s`]
    );

    console.log(summaryTable.toString());

    if (stats.cacheHits > 0) {
      const hitRate = this.statsCounter.getCacheHitRate() * 100;
      console.log(chalk.green(`🎯 Cache hit rate: ${hitRate.toFixed(1)}%`));
    }

    if (stats.totalTokensSaved > 0) {
      console.log(chalk.blue(`💾 Total tokens saved: ${stats.totalTokensSaved}`));
    }

    console.log();
  }
}

/**
 * Standalone function to print final report with current stats
 */
export function printFinalReport(statsCounter: StatsCounter): void {
  const dummyDb = {
    getStatsByDateRange: () => [],
    getTotalStats: () => ({
      total_requests: 0,
      total_errors: 0,
      total_tokens: 0,
      total_cache_hits: 0,
      avg_response_time: 0,
      first_request: '',
      last_request: ''
    })
  } as any;

  const reporter = new StatsReporter(statsCounter, dummyDb);
  reporter.printFinalReport();
}