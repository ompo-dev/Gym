import { photoScanRequestSchema, runFoodPhotoScan } from '@/core/enrich/food-photo-scan';
import { checkRateLimit } from '@/core/enrich/rateLimit';
import type { ProviderCredential } from '@/core/enrich/providers';

export async function POST(request: Request): Promise<Response> {
  const input = photoScanRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) {
    const limit = checkRateLimit(ip, Date.now());
    if (!limit.ok) return Response.json({ error: 'Rate limited' }, {
      status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) },
    });
  }
  const credential: ProviderCredential | undefined = [
    { provider: 'gemini' as const, key: process.env.GEMINI_API_KEY?.trim() ?? '' },
    { provider: 'openai' as const, key: process.env.OPENAI_API_KEY?.trim() ?? '' },
    { provider: 'anthropic' as const, key: process.env.ANTHROPIC_API_KEY?.trim() ?? '' },
  ].find((item) => item.key);
  if (!credential) return Response.json({ error: 'photoScan.unconfigured' }, { status: 503 });

  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 55_000);
  try {
    if (request.signal.aborted) controller.abort();
    return Response.json({ items: await runFoodPhotoScan(input.data, credential, controller.signal) });
  } catch {
    return Response.json({ error: 'photoScan.failed' }, { status: 502 });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', cancel);
  }
}
