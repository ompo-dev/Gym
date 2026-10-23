export interface AiHttpRequest {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}

export interface AiHttpResponse {
  ok: boolean;
  status: number;
  body: string;
}

export async function requestAiText(url: string, init: AiHttpRequest): Promise<AiHttpResponse> {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status, body: await response.text() };
}
