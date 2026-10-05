// ═══════════════════════════════════════════════════════════════════════════
// 🤖 NRJ Product Import OS — Background recovery worker (PR #10)
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const BATCH_SIZE = 8;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function isInternalWorker(req) {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const apiKey = (req.headers.get("apikey") || "").trim();
  return Boolean(SERVICE_KEY) && (bearer === SERVICE_KEY || apiKey === SERVICE_KEY);
}

async function rest(path, init) {
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...(init || {}),
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      ...((init && init.headers) || {})
    }
  });
  const body = await response.text();
  let parsed = null;
  if (body) {
    try { parsed = JSON.parse(body); } catch { parsed = body; }
  }
  if (!response.ok) {
    throw new Error(
      typeof parsed === "object" && parsed
        ? (parsed.message || parsed.hint || "Supabase error")
        : "Supabase error"
    );
  }
  return parsed;
}

function actionable(row) {
  if (!row || row.status === "CANCELLED" || row.status === "PUBLISHED") return false;

  if (row.status === "MEDIA_READY" || row.status === "READY") return true;

  if (row.status === "CLASSIFIED") {
    return Boolean(row.ai_analysis?.pipeline?.last_pricing);
  }

  if (row.status === "FAILED") {
    const code = String(row.error_code || "");
    if (code.startsWith("classification")) return true;
    if (code.startsWith("pricing")) {
      return Boolean(row.ai_analysis?.pipeline?.last_pricing);
    }
  }

  return false;
}

async function recoverOne(importId) {
  const response = await fetch(
    SUPABASE_URL + "/functions/v1/process-product-import",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + SERVICE_KEY
      },
      body: JSON.stringify({
        importId,
        imageDataUrl: null,
        pricing: null,
        approve: false,
        publish: true
      })
    }
  );

  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}

  return {
    ok: response.ok && parsed?.ok === true,
    status: parsed?.status || null,
    next_action: parsed?.next_action || null,
    recovery_exhausted: parsed?.recovery_exhausted === true,
    detail: null
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!isInternalWorker(req)) return json({ ok: false, error: "worker_auth_required" }, 403);
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "server_config_missing" }, 500);
  }

  try {
    const rows = await rest(
      "product_imports?select=id,status,error_code,ai_analysis,updated_at" +
      "&status=in.(FAILED,CLASSIFIED,MEDIA_READY,READY)" +
      "&order=updated_at.asc&limit=" + BATCH_SIZE
    );

    const candidates = (Array.isArray(rows) ? rows : []).filter(actionable);
    const results = [];

    for (const row of candidates) {
      try {
        const result = await recoverOne(row.id);
        results.push({
          importId: row.id,
          before: row.status,
          ...result
        });
      } catch (error) {
        results.push({
          importId: row.id,
          before: row.status,
          ok: false,
          error: "recovery_failed"
        });
      }
    }

    return json({
      ok: true,
      worker: "product-import-auto-recovery",
      scanned: Array.isArray(rows) ? rows.length : 0,
      candidates: candidates.length,
      results
    });
  } catch (error) {
    return json({
      ok: false,
      error: "worker_failed"
    }, 500);
  }
});
