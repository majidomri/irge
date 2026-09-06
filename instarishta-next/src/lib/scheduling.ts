/**
 * Main-thread scheduling helpers.
 *
 * INP measures the whole interaction — the input delay before a listener runs,
 * the listener itself, and the presentation delay before the browser paints the
 * result. Work a listener does synchronously sits in the middle of that, so a
 * handler that updates state *and* does something expensive pays for both in
 * one number.
 *
 * The fix is nearly always ordering rather than optimisation: paint the thing
 * the person asked for, then do the expensive part.
 */

type SchedulerWithYield = {
  yield?: () => Promise<void>;
};

/**
 * Hand the main thread back so queued input can be processed, then continue.
 *
 * Prefers `scheduler.yield()`, which resumes ahead of other pending tasks
 * instead of going to the back of the queue the way `setTimeout` does. Falls
 * back where it is not available (everything outside recent Chromium).
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;

  if (typeof scheduler?.yield === 'function') {
    return scheduler.yield();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Run `callback` after the browser has painted the current frame.
 *
 * requestAnimationFrame fires *before* paint, so the setTimeout inside it is
 * what pushes the work past it. Anything the person is not waiting to see —
 * a view count, an image export, a cache write — belongs in here rather than
 * inline in the event handler.
 */
export function afterNextPaint(callback: () => void): void {
  requestAnimationFrame(() => {
    setTimeout(callback, 0);
  });
}

/**
 * Walk `items` in chunks, yielding between them.
 *
 * For work that has to happen on the main thread but does not have to happen
 * all at once. Passing an AbortSignal lets a newer interaction cancel the
 * work an older one started, so a run only lasts as long as it is still wanted.
 */
export async function processInChunks<T>(
  items: readonly T[],
  handle: (item: T, index: number) => void,
  { chunkSize = 50, signal }: { chunkSize?: number; signal?: AbortSignal } = {},
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) return;

    handle(items[i], i);

    if ((i + 1) % chunkSize === 0) {
      await yieldToMain();
    }
  }
}
