export function formatSessionState(state: string): string {
  return state.replaceAll('_', ' ');
}

export function formatElapsed(iso: string): string {
  const start = Date.parse(iso);
  if (!Number.isFinite(start)) {
    return 'just now';
  }

  const diff = Date.now() - start;
  if (diff < 60_000) {
    return 'just now';
  }

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
}
