export async function readApiErrorBody(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => "");
  if (!raw.trim()) {
    return { error: response.statusText || "Empty error response" };
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { error: raw.trim().slice(0, 240) };
  }
}

export function formatApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const apiError = body as { error?: string; details?: unknown };

  if (typeof apiError.details === "string") {
    return `${apiError.error ?? fallback}: ${apiError.details}`;
  }

  if (apiError.details && typeof apiError.details === "object") {
    return `${apiError.error ?? fallback}: ${JSON.stringify(apiError.details)}`;
  }

  return apiError.error ?? fallback;
}
