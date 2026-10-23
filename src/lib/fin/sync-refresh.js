// Refresh only between edits. A pending request never overlaps another poll.
export function startStateRefresh({ refresh, canRefresh, intervalMs = 10_000, target = window, page = document }) {
  let running = false;
  let stopped = false;
  const run = async () => {
    if (stopped || running || page.visibilityState === 'hidden' || !canRefresh()) return;
    running = true;
    try { await refresh(canRefresh); } catch { /* Retry when the connection returns. */ }
    finally { running = false; }
  };
  target.addEventListener('focus', run);
  target.addEventListener('online', run);
  page.addEventListener('visibilitychange', run);
  const timer = target.setInterval(run, intervalMs);
  return () => {
    stopped = true;
    target.clearInterval(timer);
    target.removeEventListener('focus', run);
    target.removeEventListener('online', run);
    page.removeEventListener('visibilitychange', run);
  };
}
