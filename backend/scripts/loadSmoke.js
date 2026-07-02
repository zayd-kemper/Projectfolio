const baseUrl = process.env.LOAD_BASE_URL || 'http://localhost:5000';
const concurrency = Math.max(1, Number(process.env.LOAD_CONCURRENCY) || 20);
const requests = Math.max(concurrency, Number(process.env.LOAD_REQUESTS) || 200);
const path = process.env.LOAD_PATH || '/health/live';

const timings = [];
let next = 0;
let failures = 0;

const runRequest = async () => {
  while (next < requests) {
    next += 1;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`);
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      timings.push(performance.now() - started);
    }
  }
};

const started = performance.now();
Promise.all(Array.from({ length: concurrency }, runRequest)).then(() => {
  timings.sort((a, b) => a - b);
  const percentile = (value) => timings[Math.min(timings.length - 1, Math.floor(timings.length * value))];
  const seconds = (performance.now() - started) / 1000;
  const report = {
    requests, concurrency, failures,
    error_rate: failures / requests,
    requests_per_second: Number((requests / seconds).toFixed(1)),
    p50_ms: Number(percentile(0.5).toFixed(1)),
    p95_ms: Number(percentile(0.95).toFixed(1)),
    p99_ms: Number(percentile(0.99).toFixed(1)),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.error_rate > 0.01 || report.p95_ms > Number(process.env.LOAD_P95_LIMIT_MS || 1000)) process.exitCode = 1;
});
