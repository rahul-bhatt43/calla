/**
 * Deliberately tiny: counters and gauges in memory, exposed in Prometheus text
 * format on /metrics. A metrics client library would add more dependency weight
 * than the whole feature is worth at this scale.
 *
 * The number that matters most here is `relay_ratio` — it is the only signal
 * that tells us how much TURN bandwidth we are actually paying for.
 */

const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const histograms = new Map<string, number[]>();

export const metrics = {
  inc(name: string, by = 1): void {
    counters.set(name, (counters.get(name) ?? 0) + by);
  },
  gauge(name: string, value: number): void {
    gauges.set(name, value);
  },
  observe(name: string, value: number): void {
    const arr = histograms.get(name) ?? [];
    arr.push(value);
    // Bounded ring: we only ever report quantiles over a recent window, and an
    // unbounded array here would be a slow memory leak on a long-lived process.
    if (arr.length > 2048) arr.splice(0, arr.length - 2048);
    histograms.set(name, arr);
  },
};

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx] ?? 0;
}

export function renderPrometheus(): string {
  const lines: string[] = [];

  for (const [name, value] of counters) {
    lines.push(`# TYPE callme_${name} counter`);
    lines.push(`callme_${name} ${value}`);
  }
  for (const [name, value] of gauges) {
    lines.push(`# TYPE callme_${name} gauge`);
    lines.push(`callme_${name} ${value}`);
  }
  for (const [name, values] of histograms) {
    const sorted = [...values].sort((a, b) => a - b);
    lines.push(`# TYPE callme_${name} summary`);
    lines.push(`callme_${name}{quantile="0.5"} ${quantile(sorted, 0.5)}`);
    lines.push(`callme_${name}{quantile="0.95"} ${quantile(sorted, 0.95)}`);
    lines.push(`callme_${name}{quantile="0.99"} ${quantile(sorted, 0.99)}`);
    lines.push(`callme_${name}_count ${sorted.length}`);
  }

  const relayed = counters.get("calls_relayed") ?? 0;
  const total = counters.get("calls_completed") ?? 0;
  lines.push(`# TYPE callme_relay_ratio gauge`);
  lines.push(`callme_relay_ratio ${total > 0 ? relayed / total : 0}`);

  return lines.join("\n") + "\n";
}
