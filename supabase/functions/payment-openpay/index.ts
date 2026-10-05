const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLIC_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  "";
const OPENPAY_API_KEY = Deno.env.get("OPENPAY_API_KEY") || "";
const OPENPAY_PAYMENT_ENABLED = Deno.env.get("OPENPAY_PAYMENT_ENABLED") === "true";
const OPENPAY_BASE_URL = "https://api.openpay-cg.com/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

type InternalStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled"
  | "refund_pending"
  | "refunded";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function getBearerToken(req: Request): string | null {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function validOperator(value: unknown): value is "MTN" | "AIRTEL" {
  return value === "MTN" || value === "AIRTEL";
}

function validPhone(value: unknown): value is string {
  return typeof value === "string" && /^242\d{9}$/.test(value);
}

function mapOpenPayStatus(status: unknown): InternalStatus {
  switch (String(status || "").toLowerCase()) {
    case "success": return "paid";
    case "failed": return "failed";
    case "cancelled": return "cancelled";
    case "processing": return "processing";
    case "refunded": return "refunded";
    case "refund_pending": return "refund_pending";
    case "pending":
    default: return "pending";
  }
}

async function supabaseRest<T>(
  path: string,
  init: RequestInit = {},
  token: string | null = null
): Promise<{ data: T | null; status: number; error: string | null }> {
  try {
    const headers = new Headers(init.headers || {});
    headers.set("apikey", token ? PUBLIC_KEY : SERVICE_KEY);
    headers.set(
      "Authorization",
      token ? "Bearer " + token : "Bearer " + SERVICE_KEY
    );
    headers.set("Content-Type", "application/json");

    const response = await fetch(
      SUPABASE_URL + "/rest/v1/" + path,
      { ...init, headers }
    );
    const bodyText = await response.text();

    let body: unknown = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText;
    }

    if (!response.ok) {
      return {
        data: null,
        status: response.status,
        error: typeof body === "object" && body !== null
          ? String((body as { message?: unknown }).message || "HTTP " + response.status)
          : "HTTP " + response.status
      };
    }

    return { data: body as T, status: response.status, error: null };
  } catch (error) {
    return {
      data: null,
      status: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function openPay<T>(path: string, init: RequestInit = {}) {
  if (!OPENPAY_API_KEY) {
    return {
      data: null as T | null,
      status: 500,
      error: "OPENPAY_API_KEY missing"
    };
  }

  const headers = new Headers(init.headers || {});
  headers.set("XO-API-KEY", OPENPAY_API_KEY);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");

  try {
    const response = await fetch(OPENPAY_BASE_URL + path, { ...init, headers });
    const bodyText = await response.text();
    let body: unknown = null;

    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = bodyText;
    }

    if (!response.ok) {
      return {
        data: null as T | null,
        status: response.status,
        error: typeof body === "object" && body !== null
          ? String((body as { error?: unknown }).error || "HTTP " + response.status)
          : "HTTP " + response.status
      };
    }

    return { data: body as T, status: response.status, error: null };
  } catch (error) {
    return {
      data: null as T | null,
      status: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

interface OrderRow {
  id: string;
  user_id: string | null;
  total: number | string;
  status: string;
}

interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  payment_method: string;
  provider_reference: string | null;
  idempotency_key: string;
  amount: number | string;
  currency: string;
  status: InternalStatus;
}

interface OpenPayPaymentResponse {
  reference?: string;
  amount?: string | number;
  currency?: string;
  provider?: string;
  status?: string;
  message?: string;
}

interface RequestBody {
  action?: "create" | "status";
  order_id?: string;
  currency?: string;
  payment_phone_number?: string;
  operator?: "MTN" | "AIRTEL";
  customer_name?: string | null;
  idempotency_key?: string | null;
  provider_reference?: string;
}

async function findOwnedOrder(orderId: string, token: string): Promise<OrderRow | null> {
  const result = await supabaseRest<OrderRow[]>(
    "orders?select=id,user_id,total,status&id=eq." +
      encodeURIComponent(orderId) +
      "&limit=1",
    {},
    token
  );
  return result.data?.[0] || null;
}

async function findPaymentByIdempotency(key: string): Promise<PaymentRow | null> {
  const result = await supabaseRest<PaymentRow[]>(
    "payments?select=id,order_id,provider,payment_method,provider_reference,idempotency_key,amount,currency,status&provider=eq.openpay&idempotency_key=eq." +
      encodeURIComponent(key) +
      "&limit=1"
  );
  return result.data?.[0] || null;
}

async function findOwnedPayment(reference: string, token: string): Promise<PaymentRow | null> {
  const result = await supabaseRest<PaymentRow[]>(
    "payments?select=id,order_id,provider,payment_method,provider_reference,idempotency_key,amount,currency,status&provider=eq.openpay&provider_reference=eq." +
      encodeURIComponent(reference) +
      "&limit=1",
    {},
    token
  );
  return result.data?.[0] || null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY) {
    return json({ ok: false, error: "Supabase backend configuration missing" }, 500);
  }

  const token = getBearerToken(req);
  if (!token) return json({ ok: false, error: "authentication_required" }, 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "JSON invalide" }, 400);
  }

  const action = body.action || "create";

  if (!OPENPAY_PAYMENT_ENABLED) {
    return json({ ok: false, error: "openpay_payment_disabled" }, 503);
  }

  if (action === "status") {
    if (!body.provider_reference) {
      return json({ ok: false, error: "provider_reference_required" }, 400);
    }

    const payment = await findOwnedPayment(body.provider_reference, token);
    if (!payment) return json({ ok: false, error: "payment_not_found" }, 404);

    const remote = await openPay<OpenPayPaymentResponse>(
      "/transaction/status/" + encodeURIComponent(payment.provider_reference || ""),
      { method: "GET" }
    );

    if (remote.error || !remote.data) {
      return json({ ok: false, error: "openpay_status_failed" }, 502);
    }

    const amount = Number(remote.data.amount);
    const currency = String(remote.data.currency || "").toUpperCase();

    if (!Number.isFinite(amount) || amount !== Number(payment.amount) || currency !== "XAF") {
      return json({ ok: false, error: "payment_mismatch" }, 409);
    }

    const status = mapOpenPayStatus(remote.data.status);

    if (status !== payment.status) {
      const update = await supabaseRest<null>(
        "payments?id=eq." + encodeURIComponent(payment.id),
        {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify({ status })
        }
      );
      if (update.error) return json({ ok: false, error: "payment_update_failed" }, 409);
    }

    return json({
      ok: true,
      provider_reference: payment.provider_reference,
      status
    });
  }

  if (action !== "create") {
    return json({ ok: false, error: "action_invalid" }, 400);
  }

  if (!body.order_id) return json({ ok: false, error: "order_id_required" }, 400);
  if (!validPhone(body.payment_phone_number)) {
    return json({ ok: false, error: "payment_phone_number_invalid" }, 400);
  }
  if (!validOperator(body.operator)) {
    return json({ ok: false, error: "operator_invalid" }, 400);
  }
  if (String(body.currency || "XAF").toUpperCase() !== "XAF") {
    return json({ ok: false, error: "currency_unsupported" }, 400);
  }

  const order = await findOwnedOrder(body.order_id, token);
  if (!order) return json({ ok: false, error: "order_not_found_or_not_owned" }, 404);

  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ ok: false, error: "order_total_invalid" }, 409);
  }

  const idempotencyKey = String(
    body.idempotency_key || "order:" + order.id
  ).trim();

  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return json({ ok: false, error: "idempotency_key_invalid" }, 400);
  }

  const expectedMethod = "openpay_" + body.operator.toLowerCase();
  const existing = await findPaymentByIdempotency(idempotencyKey);

  if (existing) {
    if (existing.order_id !== order.id) {
      return json({ ok: false, error: "idempotency_key_conflict" }, 409);
    }
    if (existing.payment_method !== expectedMethod) {
      return json({ ok: false, error: "payment_operator_conflict" }, 409);
    }

    return json({
      ok: true,
      reused: true,
      payment_id: existing.id,
      provider_reference: existing.provider_reference,
      status: existing.status
    });
  }

  const insert = await supabaseRest<PaymentRow[]>(
    "payments",
    {
      method: "POST",
      headers: {
        "Prefer": "return=representation,resolution=ignore-duplicates"
      },
      body: JSON.stringify({
        order_id: order.id,
        provider: "openpay",
        payment_method: expectedMethod,
        provider_reference: null,
        idempotency_key: idempotencyKey,
        amount,
        currency: "XAF",
        status: "pending"
      })
    }
  );

  if (insert.error) {
    return json({ ok: false, error: "payment_persistence_failed" }, 500);
  }

  const localPayment = insert.data?.[0];

  if (!localPayment) {
    const concurrent = await findPaymentByIdempotency(idempotencyKey);
    if (!concurrent) {
      return json({ ok: false, error: "payment_persistence_failed" }, 500);
    }
    if (concurrent.order_id !== order.id) {
      return json({ ok: false, error: "idempotency_key_conflict" }, 409);
    }
    if (concurrent.payment_method !== expectedMethod) {
      return json({ ok: false, error: "payment_operator_conflict" }, 409);
    }

    return json({
      ok: true,
      reused: true,
      payment_id: concurrent.id,
      provider_reference: concurrent.provider_reference,
      status: concurrent.status
    });
  }

  const remote = await openPay<OpenPayPaymentResponse>(
    "/transaction/payment",
    {
      method: "POST",
      body: JSON.stringify({
        amount,
        payment_phone_number: body.payment_phone_number,
        provider: body.operator,
        customer_external_id: order.id,
        customer: {
          name: body.customer_name || "Client NRJ",
          phone: body.payment_phone_number
        },
        metadata: { order_id: order.id }
      })
    }
  );

  if (remote.error || !remote.data) {
    const failure = await supabaseRest<null>(
      "payments?id=eq." + encodeURIComponent(localPayment.id),
      {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({
          status: "failed",
          failure_reason: remote.error || "openpay_payment_failed"
        })
      }
    );

    if (failure.error) {
      return json({ ok: false, error: "openpay_payment_failed_persist_failed" }, 502);
    }
    return json({ ok: false, error: "openpay_payment_failed" }, 502);
  }

  const remoteAmount = Number(remote.data.amount || amount);
  const remoteCurrency = String(remote.data.currency || "XAF").toUpperCase();

  if (!Number.isFinite(remoteAmount) || remoteAmount !== amount || remoteCurrency !== "XAF") {
    await supabaseRest<null>(
      "payments?id=eq." + encodeURIComponent(localPayment.id),
      {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({
          status: "failed",
          failure_reason: "openpay_response_mismatch"
        })
      }
    );
    return json({ ok: false, error: "openpay_response_mismatch" }, 502);
  }

  const providerReference = String(remote.data.reference || "").trim();

  if (!providerReference) {
    await supabaseRest<null>(
      "payments?id=eq." + encodeURIComponent(localPayment.id),
      {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({
          status: "failed",
          failure_reason: "openpay_reference_missing"
        })
      }
    );
    return json({ ok: false, error: "openpay_reference_missing" }, 502);
  }

  const status = mapOpenPayStatus(remote.data.status);

  const update = await supabaseRest<null>(
    "payments?id=eq." + encodeURIComponent(localPayment.id),
    {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({
        provider_reference: providerReference,
        status
      })
    }
  );

  if (update.error) {
    return json({ ok: false, error: "payment_update_failed" }, 409);
  }

  return json({
    ok: true,
    reused: false,
    payment_id: localPayment.id,
    provider_reference: providerReference,
    status,
    checkout_url: null
  });
});
