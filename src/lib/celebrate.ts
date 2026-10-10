// A tiny pub/sub for the rare moment worth celebrating (a savings goal fully
// funded). Same shape as toast.ts, for the same reason: whatever notices the
// moment shouldn't need to be inside the component that draws it.

export type Celebration = { id: number; title: string; text: string };

type Listener = (c: Celebration) => void;

const listeners = new Set<Listener>();
let nextId = 1;

export function celebrate(title: string, text: string): void {
  const c: Celebration = { id: nextId++, title, text };
  listeners.forEach((listen) => listen(c));
}

export function subscribeToCelebrations(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
