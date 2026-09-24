// name=src/lib/fetchWithTimeout.ts

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 20000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("网络慢，点下方「重试」再试一次");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}