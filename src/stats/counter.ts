export interface Stats {
  requests: number;
  responses: number;
  errors: number;
  cacheHits: number;
  cacheMisses: number;
  totalTokensSaved: number;
  startTime: string;
  uptime: number;
}

export class StatsCounter {
  private stats: Stats;

  constructor() {
    this.stats = {
      requests: 0,
      responses: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTokensSaved: 0,
      startTime: new Date().toISOString(),
      uptime: 0
    };
  }

  incrementRequest(): void {
    this.stats.requests++;
  }

  incrementResponse(): void {
    this.stats.responses++;
  }

  incrementError(): void {
    this.stats.errors++;
  }

  incrementCacheHit(): void {
    this.stats.cacheHits++;
  }

  incrementCacheMiss(): void {
    this.stats.cacheMisses++;
  }

  addTokensSaved(tokens: number): void {
    this.stats.totalTokensSaved += tokens;
  }

  getStats(): Stats {
    // Calculate uptime in seconds
    const startTime = new Date(this.stats.startTime).getTime();
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    return {
      ...this.stats,
      uptime
    };
  }

  reset(): void {
    this.stats = {
      requests: 0,
      responses: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTokensSaved: 0,
      startTime: new Date().toISOString(),
      uptime: 0
    };
  }

  getCacheHitRate(): number {
    const totalCacheAttempts = this.stats.cacheHits + this.stats.cacheMisses;
    return totalCacheAttempts > 0 ? this.stats.cacheHits / totalCacheAttempts : 0;
  }

  getSuccessRate(): number {
    const totalRequests = this.stats.requests;
    return totalRequests > 0 ? (this.stats.responses / totalRequests) : 0;
  }
}