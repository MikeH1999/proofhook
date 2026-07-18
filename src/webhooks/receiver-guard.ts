interface RateWindow {
  startedAt: number
  count: number
}

export class InvalidWebhookRateGuard {
  private readonly windows = new Map<string, RateWindow>()

  constructor(
    private readonly maxAttempts = 10,
    private readonly windowMs = 60_000,
    private readonly maxTrackedIps = 1_000
  ) {}

  allow(ip: string, now = Date.now()): boolean {
    const current = this.windows.get(ip)
    if (!current || now - current.startedAt >= this.windowMs) {
      this.makeRoom(now)
      this.windows.set(ip, { startedAt: now, count: 1 })
      return true
    }
    if (current.count >= this.maxAttempts) return false
    current.count += 1
    return true
  }

  private makeRoom(now: number): void {
    if (this.windows.size < this.maxTrackedIps) return
    for (const [ip, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(ip)
    }
    if (this.windows.size >= this.maxTrackedIps) {
      const oldest = this.windows.keys().next().value as string | undefined
      if (oldest) this.windows.delete(oldest)
    }
  }
}
