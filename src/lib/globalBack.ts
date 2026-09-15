// name=src/lib/globalBack.ts
type Handler = () => boolean;

const handlers: Handler[] = [];

export function pushBackHandler(h: Handler): () => void {
  handlers.push(h);
  return () => {
    const i = handlers.indexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export function runTopBackHandler(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true;
  }
  return false;
}