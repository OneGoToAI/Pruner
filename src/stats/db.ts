import Database from 'better-sqlite3';
import { Config } from '../config';

export interface RequestLog {
  id?: number;
  timestamp: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  responseTime: number;
  cacheHit: boolean;
  error?: string;
}

export interface DailyStats {
  date: string;
  total_requests: number;
  total_errors: number;
  total_tokens: number;
  total_cache_hits: number;
  avg_response_time: number;
}

export interface TotalStats {
  total_requests: number;
  total_errors: number;
  total_tokens: number;
  total_cache_hits: number;
  avg_response_time: number;
  first_request: string;
  last_request: string;
}

export class StatsDatabase {
  private db: Database.Database;

  constructor(private config: Config) {
    this.db = new Database(config.database.path);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Create request logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        response_time INTEGER NOT NULL,
        cache_hit BOOLEAN NOT NULL,
        error TEXT
      )
    `);

    // Create daily stats table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        total_requests INTEGER DEFAULT 0,
        total_errors INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cache_hits INTEGER DEFAULT 0,
        avg_response_time REAL DEFAULT 0
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);
    `);
  }

  logRequest(log: RequestLog): void {
    const stmt = this.db.prepare(`
      INSERT INTO request_logs (
        timestamp, model, prompt_tokens, completion_tokens, total_tokens,
        response_time, cache_hit, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      log.timestamp,
      log.model,
      log.promptTokens,
      log.completionTokens,
      log.totalTokens,
      log.responseTime,
      log.cacheHit,
      log.error || null
    );
  }

  getRequestLogs(limit: number = 100, offset: number = 0): RequestLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM request_logs
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(limit, offset) as any[];
    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      model: row.model,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      responseTime: row.response_time,
      cacheHit: !!row.cache_hit,
      error: row.error
    }));
  }

  getStatsByDateRange(startDate: string, endDate: string): DailyStats[] {
    const stmt = this.db.prepare(`
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as total_requests,
        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as total_errors,
        SUM(total_tokens) as total_tokens,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as total_cache_hits,
        AVG(response_time) as avg_response_time
      FROM request_logs
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY DATE(timestamp)
      ORDER BY date
    `);

    return stmt.all(startDate, endDate) as DailyStats[];
  }

  getTotalStats(): TotalStats {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_requests,
        SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as total_errors,
        SUM(total_tokens) as total_tokens,
        SUM(CASE WHEN cache_hit = 1 THEN 1 ELSE 0 END) as total_cache_hits,
        AVG(response_time) as avg_response_time,
        MIN(timestamp) as first_request,
        MAX(timestamp) as last_request
      FROM request_logs
    `);

    return stmt.get() as TotalStats;
  }

  close(): void {
    this.db.close();
  }
}