import { useSyncExternalStore } from 'react';

const TICK_INTERVAL_MS = 30_000;

type TickListener = () => void;

const listeners = new Set<TickListener>();
let tick = 0;
let timer: number | null = null;

export function useElapsedTicker(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: TickListener): () => void {
  listeners.add(listener);
  startTimer();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopTimer();
    }
  };
}

function getSnapshot(): number {
  return tick;
}

function startTimer(): void {
  if (timer !== null) {
    return;
  }

  timer = window.setInterval(() => {
    tick += 1;
    for (const listener of listeners) {
      listener();
    }
  }, TICK_INTERVAL_MS);
}

function stopTimer(): void {
  if (timer === null) {
    return;
  }

  window.clearInterval(timer);
  timer = null;
}
