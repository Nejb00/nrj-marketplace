// ═══════════════════════════════════════════════════════════════════════════
// 💰 NRJ Product Import OS — Universal pricing engine (PR #5)
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MAX_MARGIN_RATE = 0.95;
const TARGET_CURRENCY = "XAF";
const FORMULA_VERSION = "v1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function getJwtPayload(req) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function isAdmin(req) {
  const payload = getJwtPayload(req);
  if (!payload) return false;
  const metadata = payload.app_metadata;
  const role = metadata && typeof metadata === "object" ? metadata.role : null;
  return payload.role === "authenticated"
    && payload.is_anonymous !== true
    && role === "admin";
}

async function rest(path, init) {
  try {
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
      const message = parsed && typeof parsed === "object"
        ? (parsed.message || "Erreur Supabase")
        : "Erreur Supabase";
      return { data: null, error: message };
    }
    return { data: parsed, error: null };
  } catch (error) {
    return { data: null, error: String(error?.message || error) };
  }
}

async function updateImport(id, patch) {
  const result = await rest("product_imports?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  });
  if (result.error) throw new Error(result.error);
}

function finiteNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function validateConfig(config) {
  const fx = finiteNumber(config?.fx_rate_to_xaf);
  const logistics = finiteNumber(config?.logistics_xaf, 0);
  const dutyRate = finiteNumber(config?.duty_rate, 0);
  const feeRate = finiteNumber(config?.marketplace_fee_rate, 0);
  const marginRate = finiteNumber(config?.target_margin_rate, 0.30);
  const rounding = finiteNumber(config?.rounding_increment_xaf, 500);

  if (!(fx > 0)) throw new Error("fx_rate_required");
  if (logistics < 0) throw new Error("logistics_invalid");
  if (dutyRate < 0 || dutyRate > 1) throw new Error("duty_rate_invalid");
  if (feeRate < 0 || feeRate > 1) throw new Error("marketplace_fee_rate_invalid");
  if (marginRate < 0 || marginRate >= MAX_MARGIN_RATE) throw new Error("target_margin_rate_invalid");
  if (!(rounding >= 1)) throw new Error("rounding_increment_invalid");

  return { fx, logistics, dutyRate, feeRate, marginRate, rounding };
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase();
}

function buildPricingBreakdown({ supplierPrice, supplierCurrency, config }) {
  const { fx, logistics, dutyRate, feeRate, marginRate, rounding } = config;
  const supplierCostXaf = supplierPrice * fx;
  const dutyXaf = supplierCostXaf * dutyRate;
  const landedCostXaf = supplierCostXaf + logistics + dutyXaf;
  const marketplaceFeeXaf = landedCostXaf * feeRate;
  const costBeforeMarginXaf = landedCostXaf + marketplaceFeeXaf;

  // Target margin = profit / selling price.
  // Therefore sellingPrice = cost / (1 - margin).
  const rawPriceXaf = costBeforeMarginXaf / (1 - marginRate);
  const roundedPriceXaf = Math.max(
    rounding,
    Math.ceil(rawPriceXaf / rounding) * rounding
  );
  const targetProfitXaf = rawPriceXaf - costBeforeMarginXaf;
  const actualProfitXaf = roundedPriceXaf - costBeforeMarginXaf;

  return {
    supplier_price: supplierPrice,
    supplier_currency: supplierCurrency,
    target_currency: TARGET_CURRENCY,
    fx_rate_to_xaf: fx,
    supplier_cost_xaf: Number(supplierCostXaf.toFixed(2)),
    logistics_xaf: Number(logistics.toFixed(2)),
    duty_rate: dutyRate,
    duty_xaf: Number(dutyXaf.toFixed(2)),
    landed_cost_xaf: Number(landedCostXaf.toFixed(2)),
    marketplace_fee_rate: feeRate,
    marketplace_fee_xaf: Number(marketplaceFeeXaf.toFixed(2)),
    cost_before_margin_xaf: Number(costBeforeMarginXaf.toFixed(2)),
    target_margin_rate: marginRate,
    target_profit_xaf: Number(targetProfitXaf.toFixed(2)),
    raw_price_xaf: Number(rawPriceXaf.toFixed(2)),
    rounded_price_xaf: Number(roundedPriceXaf.toFixed(2)),
    actual_profit_xaf: Number(actualProfitXaf.toFixed(2)),
    rounding_increment_xaf: rounding,
    formula_version: FORMULA_VERSION,
    calculated_at: new Date().toISOString()
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: "admin_requis" }, 403);
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "supabase_server_config_missing" }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json_invalide" }, 400);
  }

  const importId = String(body?.importId || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId)) {
    return json({ ok: false, error: "import_id_invalide" }, 400);
  }

  try {
    const existing = await rest(
      "product_imports?id=eq." + encodeURIComponent(importId) +
      "&select=id,status,category_id,category_confidence,supplier_price,supplier_currency,overall_confidence,ai_analysis&limit=1"
    );
    if (existing.error) return json({ ok: false, error: "import_read_failed" }, 500);

    const row = existing.data?.[0];
    if (!row) return json({ ok: false, error: "import_introuvable" }, 404);
    if (row.status === "PUBLISHED" || row.status === "CANCELLED") {
      return json({ ok: false, error: "import_non_recalculable" }, 409);
    }

    const supplierPrice = finiteNumber(row.supplier_price);
    const supplierCurrency = normalizeCurrency(row.supplier_currency);
    if (!(supplierPrice > 0)) throw new Error("supplier_price_required");
    if (!supplierCurrency) throw new Error("supplier_currency_required");
    if (!row.category_id) throw new Error("category_required");
    if (finiteNumber(row.category_confidence, 0) < 0.70) {
      throw new Error("category_confidence_low");
    }

    const config = validateConfig(body?.pricing);
    if (supplierCurrency === TARGET_CURRENCY && Math.abs(config.fx - 1) > 0.000001) {
      throw new Error("xaf_fx_must_be_1");
    }

    const breakdown = buildPricingBreakdown({
      supplierPrice,
      supplierCurrency,
      config
    });

    const ai = row.ai_analysis && typeof row.ai_analysis === "object" ? row.ai_analysis : {};
    const mergedAiAnalysis = {
      ...ai,
      pricing: {
        ...breakdown,
        engine: "nrj-universal-pricing"
      }
    };

    await updateImport(importId, {
      calculated_price: breakdown.rounded_price_xaf,
      ai_analysis: mergedAiAnalysis,
      status: row.status === "CLASSIFIED" ? "PRICED" : row.status,
      error_code: null,
      error_message: null
    });

    return json({
      ok: true,
      importId,
      status: row.status === "CLASSIFIED" ? "PRICED" : row.status,
      pricing: breakdown
    });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    try {
      await updateImport(importId, {
        error_code: message.split(":")[0] || "pricing_failed",
        error_message: message
      });
    } catch {
      // keep primary error
    }
    const status = /_required|_invalid|_low|_must_be_1/.test(message) ? 400 : 500;
    return json({ ok: false, error: "pricing_failed", detail: message }, status);
  }
});
