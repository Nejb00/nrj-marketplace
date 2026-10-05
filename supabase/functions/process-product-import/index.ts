// ═══════════════════════════════════════════════════════════════════════════
// ⚙️ NRJ Product Import OS — Stateful pipeline orchestrator (PR #8)
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAX_INLINE_IMAGE_CHARS = 15 * 1024 * 1024;
const MAX_STAGE_RETRIES = 2;
const MAX_RECOVERY_RETRIES = 3;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function getAuthToken(req) {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function getJwtPayload(req) {
  const token = getAuthToken(req);
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
  const internalToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (SERVICE_KEY && internalToken === SERVICE_KEY) return true;
  const payload = getJwtPayload(req);
  if (!payload) return false;
  const metadata = payload.app_metadata;
  const role = metadata && typeof metadata === "object" ? metadata.role : null;
  return payload.role === "authenticated"
    && payload.is_anonymous !== true
    && role === "admin";
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
    const message = parsed && typeof parsed === "object"
      ? (parsed.message || parsed.hint || "Erreur Supabase")
      : "Erreur Supabase";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return parsed;
}

async function readImport(importId) {
  const rows = await rest(
    "product_imports?id=eq." + encodeURIComponent(importId) +
    "&select=id,status,error_code,error_message,product_name,description,supplier_price,supplier_currency,moq,variants,raw_text,overall_confidence,category_confidence,calculated_price,cloudinary_urls,ai_analysis,published_product_id&limit=1"
  );
  return rows?.[0] || null;
}

async function updatePipeline(importId, patch) {
  try {
    const row = await readImport(importId);
    const ai = row?.ai_analysis && typeof row.ai_analysis === "object" ? row.ai_analysis : {};
    const pipeline = ai.pipeline && typeof ai.pipeline === "object" ? ai.pipeline : {};
    await rest("product_imports?id=eq." + encodeURIComponent(importId), {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        ai_analysis: {
          ...ai,
          pipeline: { ...pipeline, ...patch, updated_at: new Date().toISOString() }
        }
      })
    });
  } catch {
    // Telemetry is best-effort and must never break the import pipeline.
  }
}

async function executeStage(importId, stage, token, body, label) {
  await updatePipeline(importId, {
    current_stage: label,
    stage_started_at: new Date().toISOString(),
    last_error: null
  });
  try {
    const result = await callStage(stage, token, body);
    await updatePipeline(importId, {
      current_stage: null,
      last_stage: label,
      last_attempts: result.attempts,
      last_success_at: new Date().toISOString(),
      last_error: null
    });
    return result;
  } catch (error) {
    await updatePipeline(importId, {
      current_stage: label,
      last_stage: label,
      last_attempts: Number(error?.attempts || MAX_STAGE_RETRIES),
      last_error: String(error?.message || error).slice(0, 500),
      failed_at: new Date().toISOString()
    });
    throw error;
  }
}

async function callStage(stage, token, body) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_STAGE_RETRIES; attempt++) {
    try {
      const response = await fetch(
        SUPABASE_URL + "/functions/v1/" + stage,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify(body)
        }
      );

      const raw = await response.text();
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }

      if (response.ok && parsed?.ok) {
        return { data: parsed, attempts: attempt };
      }

      const detail = parsed?.detail || parsed?.error || raw.slice(0, 500) || "stage_failed";
      const error = new Error(detail);
      error.status = response.status;
      error.attempts = attempt;

      // Retry uniquement les erreurs transitoires. Les validations restent définitives.
      if (response.status < 500 || attempt === MAX_STAGE_RETRIES) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      const transient = status === 0 || status >= 500;
      if (!transient || attempt === MAX_STAGE_RETRIES) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }

  throw lastError || new Error(stage + "_failed");
}

function validateImportId(importId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId);
}

function validateImageDataUrl(value) {
  if (typeof value !== "string" || !value) return false;
  if (value.length > MAX_INLINE_IMAGE_CHARS) return false;
  return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function normalizePricing(value) {
  if (!value || typeof value !== "object") return null;
  return {
    fx_rate_to_xaf: value.fx_rate_to_xaf,
    logistics_xaf: value.logistics_xaf,
    duty_rate: value.duty_rate,
    marketplace_fee_rate: value.marketplace_fee_rate,
    target_margin_rate: value.target_margin_rate,
    rounding_increment_xaf: value.rounding_increment_xaf
  };
}

function recoveryCount(row) {
  const value = Number(row?.ai_analysis?.pipeline?.retry_count);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function recoveryAllowed(row) {
  return recoveryCount(row) < MAX_RECOVERY_RETRIES;
}

function shouldRetryAnalysis(row) {
  return row.status === "RECEIVED"
    || row.status === "ANALYZING"
    || (row.status === "FAILED" && String(row.error_code || "").startsWith("analysis"));
}

function shouldRetryClassification(row) {
  return row.status === "CLASSIFIED"
    ? false
    : row.status === "FAILED" && String(row.error_code || "").startsWith("classification");
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
  if (!validateImportId(importId)) {
    return json({ ok: false, error: "import_id_invalide" }, 400);
  }

  const token = getAuthToken(req);
  const imageDataUrl = body?.imageDataUrl || null;
  const pricing = normalizePricing(body?.pricing);
  const publish = body?.publish !== false;
  const approve = body?.approve === true;
  const steps = [];

  if (imageDataUrl && !validateImageDataUrl(imageDataUrl)) {
    return json({ ok: false, error: "image_data_url_invalide" }, 400);
  }

  try {
    let row = await readImport(importId);
    if (!row) return json({ ok: false, error: "import_introuvable" }, 404);

    if (row.status === "PUBLISHED" && row.published_product_id) {
      return json({
        ok: true,
        status: "PUBLISHED",
        importId,
        productId: row.published_product_id,
        steps
      });
    }

    if (row.status === "CANCELLED") {
      return json({ ok: false, error: "import_annule" }, 409);
    }

    // A) Vision : reprise sûre d'un import reçu/en cours d'analyse.
    if (shouldRetryAnalysis(row)) {
      if (!recoveryAllowed(row)) {
        return json({ ok: true, importId, status: row.status, next_action: "manual_review", recovery_exhausted: true, steps });
      }
      if (row.status === "FAILED") {
        await updatePipeline(importId, {
          retry_count: Math.min(MAX_RECOVERY_RETRIES, recoveryCount(row) + 1)
        });
      }
      if (!imageDataUrl) {
        return json({ ok: false, error: "image_requise_pour_analyse", status: row.status }, 409);
      }
      const stage = await executeStage(importId, "analyze-product-import", token, {
        importId,
        imageDataUrl,
        rawText: typeof body?.rawText === "string" && body.rawText.trim()
          ? body.rawText.slice(0, 12000)
          : String(row.raw_text || "").slice(0, 12000)
      }, "analysis");
      steps.push({ stage: "ANALYZING", attempts: stage.attempts });
      row = await readImport(importId);
    }

    // B) Classification : l'extraction doit exister avant de relancer le classement.
    if (row?.status === "CLASSIFIED" && !row.category_confidence) {
      // Continue through the normal classifier when extraction was successful but classification is absent.
    }

    const classificationNeeded =
      (row?.status === "CLASSIFIED" && !row.category_confidence)
      || shouldRetryClassification(row);

    if (classificationNeeded) {
      if (!recoveryAllowed(row)) {
        return json({ ok: true, importId, status: row.status, next_action: "manual_review", recovery_exhausted: true, steps });
      }
      if (row.status === "FAILED") {
        await updatePipeline(importId, {
          retry_count: Math.min(MAX_RECOVERY_RETRIES, recoveryCount(row) + 1)
        });
      }
      const stage = await executeStage(importId, "classify-product-import", token, { importId }, "classification");
      steps.push({ stage: "CLASSIFIED", attempts: stage.attempts });
      row = await readImport(importId);
    }

    if (row?.status === "LOW_CONFIDENCE") {
      return json({
        ok: true,
        importId,
        status: "LOW_CONFIDENCE",
        review_required: false,
        blocked: true,
        steps
      });
    }

    // C) Pricing : cette étape reste pilotée par les paramètres commerciaux admin.
    if (row?.status === "FAILED" && String(row.error_code || "").startsWith("pricing")) {
      if (!recoveryAllowed(row)) {
        return json({ ok: true, importId, status: row.status, next_action: "manual_review", recovery_exhausted: true, steps });
      }
      const savedPricing = row.ai_analysis?.pipeline?.last_pricing || null;
      const retryPricing = pricing || savedPricing;
      if (!retryPricing) {
        return json({
          ok: true,
          importId,
          status: "FAILED",
          next_action: "pricing_required",
          steps
        });
      }
      await updatePipeline(importId, {
        last_pricing: retryPricing,
        retry_count: Math.min(MAX_RECOVERY_RETRIES, Number(row.ai_analysis?.pipeline?.retry_count || 0) + 1)
      });
      const stage = await executeStage(importId, "price-product-import", token, { importId, pricing: retryPricing }, "pricing");
      steps.push({ stage: "PRICED", attempts: stage.attempts, retry: true });
      row = await readImport(importId);
    }

    if (row?.status === "CLASSIFIED") {
      if (!pricing) {
        return json({
          ok: true,
          importId,
          status: "CLASSIFIED",
          next_action: "pricing_required",
          steps
        });
      }

      await updatePipeline(importId, {
        last_pricing: pricing,
        retry_count: Number(row.ai_analysis?.pipeline?.retry_count || 0)
      });
      const stage = await executeStage(importId, "price-product-import", token, {
        importId,
        pricing
      }, "pricing");
      steps.push({ stage: "PRICED", attempts: stage.attempts });
      row = await readImport(importId);
    }

    // D) Média : reprise possible avec la même image temporaire conservée côté admin.
    if (row?.status === "PRICED") {
      if (!imageDataUrl) {
        return json({
          ok: true,
          importId,
          status: "PRICED",
          next_action: "media_required",
          steps
        });
      }

      const stage = await executeStage(importId, "upload-product-import-media", token, {
        importId,
        imageDataUrl
      }, "media");
      steps.push({ stage: "MEDIA_READY", attempts: stage.attempts });
      row = await readImport(importId);
    }

    // E) Publication : automatique seulement lorsque le classifier l'a explicitement autorisée.
    if (row?.status === "MEDIA_READY") {
      if (!publish) {
        return json({
          ok: true,
          importId,
          status: "MEDIA_READY",
          media: row.cloudinary_urls || null,
          pricing: row.ai_analysis?.pricing || null,
          next_action: "publish",
          steps
        });
      }

      const classification = row.ai_analysis?.classification;
      const autoEligible =
        Number(row.overall_confidence) >= 0.90 &&
        Number(row.category_confidence) >= 0.90 &&
        classification?.auto_publish_eligible === true;

      if (!autoEligible && !approve) {
        return json({
          ok: true,
          importId,
          status: "MEDIA_READY",
          media: row.cloudinary_urls || null,
          pricing: row.ai_analysis?.pricing || null,
          review_required: true,
          next_action: "human_approval",
          steps
        });
      }

      const stage = await executeStage(importId, "publish-product-import", token, {
        importId,
        approve
      }, "publish");
      steps.push({ stage: "PUBLISHED", attempts: stage.attempts, mode: stage.data?.mode || null });
      row = await readImport(importId);
    }

    if (row?.status === "READY") {
      const stage = await executeStage(importId, "publish-product-import", token, {
        importId,
        approve: true
      }, "publish");
      steps.push({ stage: "PUBLISHED", attempts: stage.attempts, mode: stage.data?.mode || "HUMAN_APPROVED" });
      row = await readImport(importId);
    }

    const ai = row?.ai_analysis && typeof row.ai_analysis === "object" ? row.ai_analysis : {};
    const classification = ai.classification && typeof ai.classification === "object"
      ? ai.classification
      : null;
    return json({
      ok: true,
      importId,
      status: row?.status || "UNKNOWN",
      productId: row?.published_product_id || null,
      classification,
      category: row?.category_id ? {
        id: row.category_id,
        name: classification?.category_name || null,
        parent_name: classification?.parent_name || null
      } : null,
      analysis: {
        product_name: row?.product_name || null,
        description: row?.description || null,
        supplier_price: row?.supplier_price ?? null,
        supplier_currency: row?.supplier_currency || null,
        moq: row?.moq || null,
        variants: row?.variants || { colors: [], sizes: [], other: [] },
        visual_category_hint: ai.visual_category_hint || null,
        overall_confidence: Number(row?.overall_confidence || 0),
        evidence: Array.isArray(ai.evidence) ? ai.evidence : []
      },
      pricing: ai.pricing || null,
      media: row?.cloudinary_urls || null,
      review_required: row?.status === "MEDIA_READY",
      steps
    });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    return json({
      ok: false,
      error: "orchestrator_failed",
      detail: message,
      importId,
      steps,
      retryable: Number(error?.status || 0) === 0 || Number(error?.status || 0) >= 500
    }, 500);
  }
});
