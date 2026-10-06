// NRJ Marketplace — secure payment webhook boundary

// External providers must authenticate with an HMAC signature.
// This function is intentionally provider-agnostic: adapters/providers
// must normalize provider-specific payloads to the contract below.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PAYMENT_WEBHOOK_SECRET = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";
const MAX_SKEW_SECONDS = 300;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-nrj-signature, x-nrj-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type PaymentStatus =
  | "pending" | "processing" | "paid" | "failed"
  | "cancelled" | "refund_pending" | "refunded";

interface WebhookPayload {
  provider: string;
  event_id: string;
  event_type: string;
  provider_reference: string;
  status: PaymentStatus;
  amount: number | string;
  currency: string;
  metadata?: Record<string, unknown>;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function decodeHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifySignature(secret: string, timestamp: string, rawBody: string, signature: string): Promise<boolean> {
  const epoch = Number(timestamp);
  if (!Number.isInteger(epoch)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - epoch) > MAX_SKEW_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp + "." + rawBody),
  ));
  const expected = decodeHex(signature.replace(/^sha256=/i, ""));
  return expected ? timingSafeEqual(digest, expected) : false;
}

async function rest<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      ...init,
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    if (!response.ok) {
      const error = typeof parsed === "object" && parsed !== null
        ? ((parsed as { message?: string }).message || ("HTTP " + response.status))
        : ("HTTP " + response.status);
      return { data: null, error, status: response.status };
    }
    return { data: parsed as T, error: null, status: response.status };
  } catch (error) {
    return { data: null, error: String((error as Error)?.message || error), status: 0 };
  }
}

function validPayload(body: unknown): body is WebhookPayload {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return typeof value.provider === "string" && value.provider.length > 0
    && typeof value.event_id === "string" && value.event_id.length > 0
    && typeof value.event_type === "string" && value.event_type.length > 0
    && typeof value.provider_reference === "string" && value.provider_reference.length > 0
    && typeof value.currency === "string"
    && typeof value.amount === "number" || typeof value.amount === "string";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "Supabase backend configuration missing" }, 500);
  if (!PAYMENT_WEBHOOK_SECRET) return json({ ok: false, error: "PAYMENT_WEBHOOK_SECRET missing" }, 500);

  const timestamp = req.headers.get("x-nrj-timestamp") || "";
  const signature = req.headers.get("x-nrj-signature") || "";
  const rawBody = await req.text();

  if (!timestamp || !signature || !(await verifySignature(PAYMENT_WEBHOOK_SECRET, timestamp, rawBody, signature))) {
    return json({ ok: false, error: "signature_invalid" }, 401);
  }

  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return json({ ok: false, error: "JSON invalide" }, 400); }
  if (!validPayload(body)) return json({ ok: false, error: "payload_invalid" }, 400);

  const payload = body as WebhookPayload;
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ ok: false, error: "amount_invalid" }, 400);
  const currency = payload.currency.toUpperCase();
  if (currency !== "XAF") return json({ ok: false, error: "currency_unsupported" }, 400);

  // Resolve the payment by provider + reference. The client never supplies
  // the order id used for authorization.
  const paymentRes = await rest<Array<{ id: string; order_id: string; amount: number | string; currency: string; status: PaymentStatus }>>(
    "payments?select=id,order_id,amount,currency,status&provider=eq." + encodeURIComponent(payload.provider) + "&provider_reference=eq." + encodeURIComponent(payload.provider_reference) + "&limit=1",
  );
  const payment = paymentRes.data?.[0];
  if (!payment) return json({ ok: false, error: "payment_not_found" }, 404);

  if (Number(payment.amount) !== amount || String(payment.currency).toUpperCase() !== currency) {
    return json({ ok: false, error: "payment_mismatch" }, 409);
  }

  // Insert-first gives us a database-enforced idempotency barrier.
  const eventRes = await rest<Array<{ id: string; payment_id: string; processed_at: string | null; processing_error: string | null }>>(
    "payment_events",
    {
      method: "POST",
      headers: { "Prefer": "return=representation,resolution=ignore-duplicates" },
      body: JSON.stringify({
        payment_id: payment.id,
        provider: payload.provider,
        provider_event_id: payload.event_id,
        event_type: payload.event_type,
        payload,
      }),
    },
  );

  if (eventRes.error) return json({ ok: false, error: "event_store_failed" }, 500);
  const event = eventRes.data?.[0];
  if (event?.processed_at) return json({ ok: true, duplicate: true });

  // The database trigger enforces the legal status transition.
  // We additionally only update the payment row selected above.
  const updateRes = await rest<null>(
    "payments?id=eq." + encodeURIComponent(payment.id),
    { method: "PATCH", headers: { "Prefer": "return=minimal" }, body: JSON.stringify({ status: payload.status }) },
  );

  if (updateRes.error) {
    await rest<null>("payment_events?id=eq." + encodeURIComponent(event?.id || "invalid"), {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ processing_error: updateRes.error }),
    });
    return json({ ok: false, error: "payment_update_failed" }, 409);
  }

  if (event?.id) {
    await rest<null>("payment_events?id=eq." + encodeURIComponent(event.id), {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ processed_at: new Date().toISOString(), processing_error: null }),
    });
  }

  return json({ ok: true, payment_id: payment.id, status: payload.status });
});
