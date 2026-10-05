const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLIC_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  "";
const OPENPAY_API_KEY = Deno.env.get("OPENPAY_API_KEY") || "";
const OPENPAY_PAYMENT_ENABLED = Deno.env.get("OPENPAY_PAYMENT_ENABLED") === "true";
const OPENPAY_ACTIVATION_MODE = (Deno.env.get("OPENPAY_ACTIVATION_MODE") || "disabled")
  .trim()
  .toLowerCase();
const OPENPAY_MAX_TRANSACTION_XAF = Number(
  Deno.env.get("OPENPAY_MAX_TRANSACTION_XAF") || "0"
);
const OPENPAY_CANARY_USER_IDS = new Set(
  (Deno.env.get("OPENPAY_CANARY_USER_IDS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
const OPENPAY_BASE_URL = "https://api.openpay-cg.com/v1";
const MAX_PERSIST_ATTEMPTS = 3;
const PERSIST_RETRY_DELAYS_MS = [0, 100, 250];

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

type ActivationDecision = {
  enabled: boolean;
  mode: "disabled" | "canary" | "live";
  reason: string;
};

function getActivationDecision(userId: string | null): ActivationDecision {
  const mode =
    OPENPAY_ACTIVATION_MODE === "canary" || OPENPAY_ACTIVATION_MODE === "live"
      ? OPENPAY_ACTIVATION_MODE
      : "disabled";

  if (!OPENPAY_PAYMENT_ENABLED) {
    return { enabled: false, mode, reason: "master_switch_disabled" };
  }

  if (mode === "disabled") {
    return { enabled: false, mode, reason: "activation_mode_disabled" };
  }

  if (!Number.isFinite(OPENPAY_MAX_TRANSACTION_XAF) || OPENPAY_MAX_TRANSACTION_XAF <= 0) {
    return { enabled: false, mode, reason: "max_transaction_not_configured" };
  }

  if (mode === "canary" && (!userId || !OPENPAY_CANARY_USER_IDS.has(userId))) {
    return { enabled: false, mode, reason: "user_not_in_canary_allowlist" };
  }

  return { enabled: true, mode, reason: "ok" };
}

function activationJson(decision: ActivationDecision, status = 503): Response {
  return json({
    ok: false,
    error: "openpay_activation_not_ready",
    activation_mode: decision.mode,
    reason: decision.reason
  }, status);
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
  action?: "create" | "status" | "reconcile";
  order_id?: string;
  currency?: string;
  payment_phone_number?: string;
  operator?: "MTN" | "AIRTEL";
  customer_name?: string | null;
  idempotency_key?: string | null;
  provider_reference?: string;
  payment_id?: string;
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

async function findLivePaymentForUser(userId: string): Promise<PaymentRow | null> {
  const result = await supabaseRest<PaymentRow[]>(
    "payments?select=id,order_id,provider,payment_method,provider_reference,idempotency_key,amount,currency,status&provider=eq.openpay&user_id=eq." +
      encodeURIComponent(userId) +
      "&status=in.(pending,processing,refund_pending)&limit=1"
  );
  return result.data?.[0] || null;
}

async function findLivePaymentForOrder(orderId: string): Promise<PaymentRow | null> {
  const result = await supabaseRest<PaymentRow[]>(
    "payments?select=id,order_id,provider,payment_method,provider_reference,idempotency_key,amount,currency,status&provider=eq.openpay&order_id=eq." +
      encodeURIComponent(orderId) +
      "&status=in.(pending,processing,paid,refund_pending,refunded)&limit=1"
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

async function findOwnedPaymentById(paymentId: string, token: string): Promise<PaymentRow | null> {
  const result = await supabaseRest<PaymentRow[]>(
    "payments?select=id,order_id,provider,payment_method,provider_reference,idempotency_key,amount,currency,status&provider=eq.openpay&id=eq." +
      encodeURIComponent(paymentId) +
      "&limit=1",
    {},
    token
  );
  return result.data?.[0] || null;
}

async function persistConfirmedPayment(
  paymentId: string,
  providerReference: string,
  status: InternalStatus,
  auditSource = "payment_api",
  auditReason: string | null = null
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_PERSIST_ATTEMPTS; attempt += 1) {
    const update = await supabaseRest<null>(
      "rpc/set_payment_status_with_audit",
      {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({
          p_payment_id: paymentId,
          p_status: status,
          p_provider_reference: providerReference || null,
          p_source: auditSource,
          p_reason: auditReason,
          p_metadata: {
            component: "payment-openpay"
          }
        })
      }
    );

    if (!update.error) {
      return true;
    }

    if (attempt + 1 < MAX_PERSIST_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, PERSIST_RETRY_DELAYS_MS[attempt + 1])
      );
    }
  }

  return false;
}

async function persistPaymentFailure(
  paymentId: string,
  failureReason: string
): Promise<boolean> {
  const failure = await supabaseRest<null>(
    "rpc/set_payment_status_with_audit",
    {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({
        p_payment_id: paymentId,
        p_status: "failed",
        p_source: "provider_error",
        p_reason: failureReason,
        p_metadata: {
          component: "payment-openpay"
        }
      })
    }
  );

  return !failure.error;
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

  if (action === "readiness") {
    const decision = getActivationDecision(null);
    return json({
      ok: true,
      provider: "openpay",
      enabled: decision.enabled,
      activation_mode: decision.mode,
      reason: decision.reason,
      max_transaction_xaf: decision.enabled ? OPENPAY_MAX_TRANSACTION_XAF : 0
    });
  }

  const baseDecision = getActivationDecision(null);
  if (!baseDecision.enabled && baseDecision.reason !== "user_not_in_canary_allowlist") {
    return activationJson(baseDecision);
  }

  if (action === "reconcile") {
    if (!body.order_id) {
      return json({ ok: false, error: "order_id_required" }, 400);
    }
    if (!body.payment_id) {
      return json({ ok: false, error: "payment_id_required" }, 400);
    }
    if (!body.provider_reference) {
      return json({ ok: false, error: "provider_reference_required" }, 400);
    }

    const order = await findOwnedOrder(body.order_id, token);
    if (!order) return json({ ok: false, error: "order_not_found_or_not_owned" }, 404);

    const activation = getActivationDecision(order.user_id);
    if (!activation.enabled) return activationJson(activation, 403);

    const payment = await findOwnedPaymentById(body.payment_id, token);
    if (!payment) return json({ ok: false, error: "payment_not_found" }, 404);
    if (payment.order_id !== order.id) {
      return json({ ok: false, error: "payment_order_conflict" }, 409);
    }
    if (payment.provider !== "openpay") {
      return json({ ok: false, error: "payment_provider_conflict" }, 409);
    }

    const providerReference = body.provider_reference.trim();
    const remote = await openPay<OpenPayPaymentResponse>(
      "/transaction/status/" + encodeURIComponent(providerReference),
      { method: "GET" }
    );

    if (remote.error || !remote.data) {
      return json({ ok: false, error: "openpay_status_failed" }, 502);
    }

    const remoteReference = String(remote.data.reference || "").trim();
    const amount = Number(remote.data.amount);
    const currency = String(remote.data.currency || "").toUpperCase();

    if (
      !remoteReference ||
      remoteReference !== providerReference ||
      !Number.isFinite(amount) ||
      amount !== Number(order.total) ||
      amount !== Number(payment.amount) ||
      currency !== "XAF"
    ) {
      return json({ ok: false, error: "payment_mismatch" }, 409);
    }

    const status = mapOpenPayStatus(remote.data.status);
    const persisted = await persistConfirmedPayment(
      payment.id,
      providerReference,
      status,
      "manual_reconciliation",
      "payment_reconcile"
    );

    if (!persisted) {
      return json({
        ok: false,
        error: "payment_reconciliation_persist_failed",
        payment_id: payment.id,
        provider_reference: providerReference,
        status
      }, 409);
    }

    return json({
      ok: true,
      reconciled: true,
      payment_id: payment.id,
      provider_reference: providerReference,
      status
    });
  }

  if (action === "status") {
    if (!body.provider_reference) {
      return json({ ok: false, error: "provider_reference_required" }, 400);
    }

    const payment = await findOwnedPayment(body.provider_reference, token);
    if (!payment) return json({ ok: false, error: "payment_not_found" }, 404);

    const paymentOrder = await findOwnedOrder(payment.order_id, token);
    if (!paymentOrder) return json({ ok: false, error: "order_not_found_or_not_owned" }, 404);

    const activation = getActivationDecision(paymentOrder.user_id);
    if (!activation.enabled) return activationJson(activation, 403);

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
      const persisted = await persistConfirmedPayment(
        payment.id,
        payment.provider_reference || "",
        status,
        "status_poll",
        "openpay_status_sync"
      );
      if (!persisted) {
        return json({
          ok: false,
          error: "payment_update_failed",
          payment_id: payment.id,
          provider_reference: payment.provider_reference,
          status
        }, 409);
      }
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

  const activation = getActivationDecision(order.user_id);
  if (!activation.enabled) return activationJson(activation, 403);

  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ ok: false, error: "order_total_invalid" }, 409);
  }

  if (amount > OPENPAY_MAX_TRANSACTION_XAF) {
    return json({
      ok: false,
      error: "openpay_transaction_limit_exceeded",
      max_transaction_xaf: OPENPAY_MAX_TRANSACTION_XAF
    }, 409);
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

    if (["failed", "cancelled", "refund_pending", "refunded"].includes(existing.status)) {
      return json({
        ok: false,
        error: "payment_attempt_terminal",
        payment_id: existing.id,
        status: existing.status
      }, 409);
    }

    if (!existing.provider_reference) {
      return json({
        ok: false,
        error: "payment_reconciliation_required",
        payment_id: existing.id,
        provider_reference: null,
        status: existing.status
      }, 409);
    }

    return json({
      ok: true,
      reused: true,
      payment_id: existing.id,
      provider_reference: existing.provider_reference,
      status: existing.status
    });
  }

  const liveUserPayment = await findLivePaymentForUser(order.user_id || "");
  if (liveUserPayment && liveUserPayment.order_id !== order.id) {
    return json({
      ok: false,
      error: "payment_active_elsewhere",
      payment_id: liveUserPayment.id,
      order_id: liveUserPayment.order_id,
      provider_reference: liveUserPayment.provider_reference,
      status: liveUserPayment.status
    }, 409);
  }

  const livePayment = await findLivePaymentForOrder(order.id);
  if (livePayment) {
    if (livePayment.payment_method !== expectedMethod) {
      return json({ ok: false, error: "payment_operator_conflict" }, 409);
    }
    if (!livePayment.provider_reference) {
      return json({
        ok: false,
        error: "payment_reconciliation_required",
        payment_id: livePayment.id,
        provider_reference: null,
        status: livePayment.status
      }, 409);
    }

    return json({
      ok: true,
      reused: true,
      concurrent_live: true,
      payment_id: livePayment.id,
      provider_reference: livePayment.provider_reference,
      status: livePayment.status
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
        user_id: order.user_id,
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
    const concurrentUserPayment = await findLivePaymentForUser(order.user_id || "");
    if (concurrentUserPayment && concurrentUserPayment.order_id !== order.id) {
      return json({
        ok: false,
        error: "payment_active_elsewhere",
        payment_id: concurrentUserPayment.id,
        order_id: concurrentUserPayment.order_id,
        provider_reference: concurrentUserPayment.provider_reference,
        status: concurrentUserPayment.status
      }, 409);
    }

    const concurrent = await findLivePaymentForOrder(order.id);
    if (concurrent) {
      if (concurrent.payment_method !== expectedMethod) {
        return json({ ok: false, error: "payment_operator_conflict" }, 409);
      }
      return json({
        ok: true,
        reused: true,
        concurrent_live: true,
        payment_id: concurrent.id,
        provider_reference: concurrent.provider_reference,
        status: concurrent.status
      });
    }
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
    const ambiguous =
      remote.status === 0 ||
      remote.status >= 500;

    if (ambiguous) {
      return json({
        ok: false,
        error: "payment_reconciliation_required",
        payment_id: localPayment.id,
        provider_reference: null,
        status: localPayment.status,
        reason: "provider_response_unknown"
      }, 409);
    }

    const persisted = await persistPaymentFailure(
      localPayment.id,
      remote.error || "openpay_payment_failed"
    );

    if (!persisted) {
      return json({
        ok: false,
        error: "openpay_payment_failed_persist_failed"
      }, 502);
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
    // A successful/ambiguous provider response without its reference is NOT
    // evidence of failure. Keep the local payment pending so no retry can
    // create a second provider transaction. Recovery is completed when the
    // provider callback brings back the authoritative reference.
    return json({
      ok: false,
      error: "payment_reconciliation_required",
      payment_id: localPayment.id,
      provider_reference: null,
      status: localPayment.status,
      reason: "provider_reference_missing"
    }, 409);
  }

  const status = mapOpenPayStatus(remote.data.status);

  const persisted = await persistConfirmedPayment(
    localPayment.id,
    providerReference,
    status,
    "payment_create",
    "openpay_create_success"
  );

  if (!persisted) {
    return json({
      ok: false,
      error: "payment_reconciliation_required",
      payment_id: localPayment.id,
      provider_reference: providerReference,
      status
    }, 409);
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
