const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// AUDIT FIX: Use 'unknown' type and type guard instead of 'any'
export const isRetryableError = (err: unknown): boolean => {
  let message = '';
  if (err instanceof Error) {
    message = err.message.toLowerCase();
  } else if (typeof err === 'string') {
    message = err.toLowerCase();
  } else if (err && typeof err === 'object' && 'message' in err) {
    message = String((err as { message: unknown }).message).toLowerCase();
  }
  return (
    message.includes('blockhash not found') ||
    message.includes('node is behind') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('transaction was not confirmed')
  );
};

// AUDIT FIX: Use 'unknown' type instead of 'any'
export const retryRpc = async <T,>(fn: () => Promise<T>, attempts = 2): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      if (attempt >= attempts || !isRetryableError(err)) {
        throw err;
      }
      await sleep(750 * (attempt + 1));
    }
  }
  throw lastError;
};
