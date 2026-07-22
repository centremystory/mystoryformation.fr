// MYSTORY — helper de requête fiable.
// Lève une vraie erreur (avec le message serveur) si la requête échoue,
// pour qu'aucune action ne puisse « réussir en silence ».
// Usage : await apiFetch("/api/...", { method: "PATCH", body: JSON.stringify({...}) })

export class ApiError extends Error {
  status: number;
  recap?: string[];
  constructor(message: string, status: number, recap?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.recap = recap;
  }
}

export async function apiFetch<T = any>(url: string, init?: RequestInit): Promise<T> {
  // On ne force le Content-Type JSON que si le corps est une chaîne (JSON).
  // Les FormData/uploads gardent leur propre boundary.
  const isStringBody = typeof init?.body === "string";
  const headers: Record<string, string> = {
    ...(isStringBody ? { "Content-Type": "application/json" } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(url, { cache: "no-store", ...init, headers });

  const raw = await res.text();
  let data: any = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  const jsonKo = data && typeof data === "object" && data.ok === false;
  if (!res.ok || jsonKo) {
    const recap: string[] | undefined =
      data && Array.isArray(data.recap) ? data.recap : undefined;
    const msg =
      (data && typeof data === "object"
        ? data.erreur || data.message || recap?.join(" ")
        : typeof data === "string"
          ? data
          : null) || `Erreur ${res.status}`;
    throw new ApiError(msg, res.status, recap);
  }

  return data as T;
}
