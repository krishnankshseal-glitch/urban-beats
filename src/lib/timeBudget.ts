/**
 * Waits for `work`, but never longer than `budgetMs`: if it hasn't finished by
 * then, resolves with `onTimeout()` and lets the work carry on (or be picked up
 * later by the scheduled reconcile job). Used so a slow Google call can't make
 * a save request hang past the serverless time limit. The timer is always
 * cleared so it can't keep the function alive after the answer is ready.
 */
export async function raceWithBudget<T>(work: Promise<T>, budgetMs: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), budgetMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
