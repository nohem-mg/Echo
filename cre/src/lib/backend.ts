const BASE_URL = process.env.BACKEND_BASE_URL ?? "http://localhost:8080";

/** Client HTTP minimal vers les endpoints backend (GAGEXCM). */
export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Backend ${path} -> ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
