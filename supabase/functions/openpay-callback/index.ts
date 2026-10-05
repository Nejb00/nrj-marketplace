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

type CallbackBody = { reference?: string };
type OpenPayStatusResponse = {
  reference?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
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
    provider: string;
    provider_reference: string | null;
    amount: number | string;
    currency: string;
    status: string;
  }>>(
    "payments?select=id,provider,provider_reference,amount,currency,status&provider=eq.openpay&provider_reference=eq." +
      encodeURIComponent(reference) +
      "&limit=1"
  );

  const row = payment.data?.[0];
  if (!row) return json({ ok: false, error: "payment_not_found" }, 404);

  const remote = await openPay<OpenPayStatusResponse>(
    "/transaction/status/" + encodeURIComponent(reference)
  );

  if (!remote.ok || !remote.data) {
    return json({ ok: false, error: "provider_revalidation_failed" }, 502);
  }

  const remoteAmount = Number(remote.data.amount);
  const remoteCurrency = String(remote.data.currency || "").toUpperCase();

  if (!Number.isFinite(remoteAmount) ||
      remoteAmount !== Number(row.amount) ||
      remoteCurrency !== String(row.currency).toUpperCase()) {
    return json({ ok: false, error: "payment_mismatch" }, 409);
  }

  const status = mapStatus(remote.data.status);

  if (status === row.status) {
    return json({ ok: true, unchanged: true, status });
  }

  const update = await supabase<null>(
    "payments?id=eq." + encodeURIComponent(row.id),
    {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      body: JSON.stringify({ status })
    }
  );

  if (!update.ok) return json({ ok: false, error: "payment_update_failed" }, 409);
  return json({ ok: true, status });
});
