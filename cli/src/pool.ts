export async function runPool<T>(items: readonly T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("Pool concurrency must be a positive integer");
  }

  let nextIndex = 0;
  let failed = false;
  let failure: unknown;
  const worker = async () => {
    while (!failed && nextIndex < items.length) {
      const item = items[nextIndex++]!;
      try {
        await fn(item);
      } catch (cause) {
        failed = true;
        failure = cause;
      }
    }
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw failure;
}
