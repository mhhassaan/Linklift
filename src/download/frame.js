/** Coalesce layout work and make pending work cancellable on navigation.
 * @param {{requestAnimationFrame?: (callback: FrameRequestCallback) => number, cancelAnimationFrame?: (id: number) => void, setTimeout: (callback: () => void, delay: number) => number, clearTimeout: (id: number) => void}} clock
 * @param {() => void} work
 */
export function createFrameTask(clock, work) {
  /** @type {number | null} */
  let pending = null;
  const request =
    clock.requestAnimationFrame?.bind(clock) ||
    ((callback) => clock.setTimeout(() => callback(0), 16));
  const cancel = clock.cancelAnimationFrame?.bind(clock) || clock.clearTimeout.bind(clock);
  return {
    schedule() {
      if (pending === null)
        pending = request(() => {
          pending = null;
          work();
        });
    },
    cancel() {
      if (pending !== null) cancel(pending);
      pending = null;
    },
  };
}
