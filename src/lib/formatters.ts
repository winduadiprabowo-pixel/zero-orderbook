// ─── Number formatters ────────────────────────────────────────────────────────

export function formatCompact(n: number): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return '$' + (n / 1e9).toFixed(2)  + 'B';
  if (abs >= 1e6)  return '$' + (n / 1e6).toFixed(2)  + 'M';
  if (abs >= 1e3)  return '$' + (n / 1e3).toFixed(2)  + 'K';
  return '$' + n.toFixed(2);
}

export function formatCompactNum(n: number): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return n.toFixed(2);
}

export function formatPrice(n: number): string {
  if (!isFinite(n)) return '—';
  if (n >= 10000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1000)  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)     return n.toFixed(4);
  if (n >= 0.01)  return n.toFixed(6);
  return n.toFixed(8);
}

export function formatSize(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000)     return (v / 1_000).toFixed(2) + 'K';
  return v.toFixed(4);
}

export function formatChange(n: number): string {
  if (!isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + n.toFixed(2) + '%';
}

export function formatPct(n: number, decimals = 2): string {
  return n.toFixed(decimals) + '%';
}

export function formatFundingRate(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return sign + (n * 100).toFixed(4) + '%';
}

export function formatUsdValue(n: number): string {
  if (!isFinite(n)) return '$0';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return '$' + (n / 1_000).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return [
    d.getHours().toString().padStart(2, '0'),
    d.getMinutes().toString().padStart(2, '0'),
    d.getSeconds().toString().padStart(2, '0'),
  ].join(':');
}

export function formatTimeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)  return Math.floor(diff / 1000) + 's ago';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + 'm ago';
  return Math.floor(diff / 3600_000) + 'h ago';
}

// ─── Reconnect backoff ────────────────────────────────────────────────────────

export function deterministicJitter(attempt: number): number {
  const seed = (attempt + 1) * 0x9e3779b9;
  return ((seed ^ (seed >>> 16)) & 0x1ff);
}

export function getReconnectDelay(attempt: number): number {
  const base = 1000 * Math.pow(2, Math.min(attempt, 5));
  return Math.min(base + deterministicJitter(attempt), 8_000); // v95: cap 30s→8s
}

// ─── Precision helpers ────────────────────────────────────────────────────────

export function getPrecisionDecimals(p: '0.1' | '0.01' | '0.001'): number {
  return p === '0.1' ? 1 : p === '0.01' ? 2 : 3;
}

// ─── Fear & Greed color ───────────────────────────────────────────────────────

export function fearGreedColor(value: number): string {
  if (value >= 75) return 'rgba(38,166,154,1)';
  if (value >= 55) return 'rgba(130,200,150,1)';
  if (value >= 45) return 'rgba(242,142,44,1)';
  if (value >= 25) return 'rgba(239,130,80,1)';
  return 'rgba(239,83,80,1)';
}
