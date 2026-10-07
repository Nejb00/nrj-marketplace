const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const OPENPAY_API_KEY = Deno.env.get("OPENPAY_API_KEY") || "";
const OPENPAY_BASE_URL = "https://api.openpay-cg.com/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

type CallbackBody = {
  reference?: string;
  amount?: string | number;
  currency?: string;
  paymentPhoneNumber?: string;
  provider?: string;
  type?: string;
  status?: string;
  message?: string;
  customer?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};
type OpenPayStatusResponse = {
  reference?: string;
  amount?: string | number;
  currency?: string;
  paymentPhoneNumber?: string;
  provider?: string;
  type?: string;
  status?: string;
  message?: string;
  metadata?: Record<string, unknown> | null;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function supabase<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", SERVICE_KEY);
  headers.set("Authorization", "Bearer " + SERVICE_KEY);
  headers.set("Content-Type", "application/json");

  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers
  });

  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T
  };
}

async function openPay<T>(path: string) {
  const response = await fetch(OPENPAY_BASE_URL + path, {
    headers: {
      "XO-API-KEY": OPENPAY_API_KEY,
      Accept: "application/json"
    }
  });

  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T
  };
}

function mapStatus(status: unknown) {
  switch (String(status || "").toLowerCase()) {
    case "success": return "paid";
    case "failed": return "failed";
    case "cancelled": return "cancelled";
    case "processing": return "processing";
    default: return "pending";
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !OPENPAY_API_KEY) {
    return json({ ok: false, error: "backend_configuration_missing" }, 500);
  }

  let body: CallbackBody;

  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON invalide" }, 400);
  }

  const reference = String(body.reference || "").trim();
  if (!reference) return json({ ok: false, error: "reference_required" }, 400);

  const payment = await supabase<Array<{
    id: string;
    order_id: string;
    provider: string;
    payment_method: string;
    provider_reference: string | null;
    amount: number | string;
    currency: string;
    status: string;
  }>>(
    "payments?select=id,order_id,provider,payment_method,provider_reference,amount,currency,status&provider=eq.openpay&provider_reference=eq." +
      encodeURIComponent(reference) +
      "&limit=1"
  );

  let row = payment.data?.[0] || null;

  // ATTAQUE #18: if the browser lost the create-payment response, the
  // callback still carries the authoritative OpenPay reference + metadata.
  // Bind that reference to the single pending NRJ payment for this order.
  if (!row) {
    const orderId = String(
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as { order_id?: unknown }).order_id || ""
        : ""
    ).trim();

    if (orderId) {
      const recovery = await supabase<Array<{
        id: string;
        order_id: string;
        provider: string;
        payment_method: string;
        provider_reference: string | null;
        amount: number | string;
        currency: string;
        status: string;
      }>>(
        "payments?select=id,order_id,provider,payment_method,provider_reference,amount,currency,status&provider=eq.openpay&order_id=eq." +
          encodeURIComponent(orderId) +
          "&provider_reference=is.null&status=in.(pending,processing)&limit=1"
      );
      row = recovery.data?.[0] || null;
    }
  }

  if (!row) return json({ ok: false, error: "payment_not_found" }, 404);
  const remote = await openPay<OpenPayStatusResponse>(
    "/transaction/status/" + encodeURIComponent(reference)
  );

  if (!remote.ok || !remote.data) {
    return json({ ok: false, error: "provider_revalidation_failed" }, 502);
  }

  const remoteReference = String(remote.data.reference || "").trim();
  const remoteAmount = Number(remote.data.amount);
  const remoteCurrency = String(remote.data.currency || "").toUpperCase();

  if (!remoteReference ||
      remoteReference !== reference ||
      !Number.isFinite(remoteAmount) ||
      remoteAmount !== Number(row.amount) ||
      remoteCurrency !== String(row.currency).toUpperCase()) {
    return json({ ok: false, error: "payment_mismatch" }, 409);
  }

  const remoteMetadata =
    remote.data.metadata && typeof remote.data.metadata === "object"
      ? remote.data.metadata as { order_id?: unknown }
      : null;
  const callbackOrderId =
    body.metadata && typeof body.metadata === "object"
      ? String((body.metadata as { order_id?: unknown }).order_id || "").trim()
      : "";
  const remoteOrderId = String(remoteMetadata?.order_id || "").trim();

  if (
    !row.order_id ||
    (callbackOrderId && callbackOrderId !== row.order_id) ||
    (remoteOrderId && remoteOrderId !== row.order_id)
  ) {
    return json({ ok: false, error: "payment_order_mismatch" }, 409);
  }

  const expectedProvider =
    row.payment_method === "openpay_mtn"
      ? "MTN"
      : row.payment_method === "openpay_airtel"
        ? "AIRTEL"
        : null;
  const remoteProvider = String(remote.data.provider || "").trim().toUpperCase();

  if (expectedProvider && remoteProvider && remoteProvider !== expectedProvider) {
    return json({ ok: false, error: "payment_provider_mismatch" }, 409);
  }

  const type = String(remote.data.type || body.type || "").trim().toLowerCase();
  if (type && type !== "payment") {
    return json({ ok: false, error: "payment_type_mismatch" }, 409);
  }

  const status = mapStatus(remote.data.status);
  const providerEventId = [
    "openpay",
    reference,
    String(remote.data.status || "").trim().toLowerCase()
  ].join(":");

  const eventPayload = {
    callback: body,
    revalidated: remote.data
  };

  const applied = await supabase<Array<{
    processed: boolean;
    duplicate: boolean;
    payment_status: string;
  }>>(
    "rpc/apply_payment_provider_event",
    {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify({
        p_payment_id: row.id,
        p_provider: "openpay",
        p_provider_event_id: providerEventId,
        p_event_type: type || "payment",
        p_payload: eventPayload,
        p_provider_reference: reference,
        p_status: status
      })
    }
  );

  if (!applied.ok || !applied.data?.[0]) {
    return json({ ok: false, error: "payment_event_processing_failed" }, 502);
  }

  const result = applied.data[0];

  return json({
    ok: true,
    processed: result.processed,
    duplicate: result.duplicate,
    status: result.payment_status
  });
});
