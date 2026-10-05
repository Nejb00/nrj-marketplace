// ═══════════════════════════════════════════════════════════════════════════
// ☁️ NRJ Product Import OS — Persistent Cloudinary media pipeline (PR #6)
// ═══════════════════════════════════════════════════════════════════════════

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MAX_IMAGE_BYTES = 9_500_000;
const FOLDER = "nrj-marketplace/imports";
const TARGET_TRANSFORM = "c_limit,w_1200/f_auto/q_auto";

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

function parseImageDataUrl(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("image_data_url_invalide");
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (!match) throw new Error("format_image_non_supporte");

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];
  const decodedBytes = Math.floor(base64.length * 3 / 4);
  if (decodedBytes > MAX_IMAGE_BYTES) throw new Error("image_cloudinary_trop_volumineuse");

  return { mimeType, dataUrl: value };
}

function encodeSignatureParams(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + String(value))
    .join("&");
}

async function sha1Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildDeliveryUrl(publicId, version = null) {
  const versionSegment = Number.isFinite(Number(version)) ? "v" + Number(version) + "/" : "";
  return "https://res.cloudinary.com/" + CLOUD_NAME
    + "/image/upload/" + TARGET_TRANSFORM + "/" + versionSegment + publicId;
}

function normalizeMedia(upload) {
  const publicId = String(upload?.public_id || "");
  if (!publicId || !upload?.secure_url) throw new Error("cloudinary_reponse_invalide");

  return {
    provider: "cloudinary",
    folder: FOLDER,
    images: [{
      asset_id: upload.asset_id || null,
      public_id: publicId,
      secure_url: upload.secure_url,
      delivery_url: buildDeliveryUrl(publicId, upload.version),
      version: upload.version || null,
      format: upload.format || null,
      bytes: Number(upload.bytes) || null,
      width: Number(upload.width) || null,
      height: Number(upload.height) || null
    }],
    uploaded_at: new Date().toISOString()
  };
}

async function uploadToCloudinary(imageDataUrl, importId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = FOLDER + "/" + importId + "/source";
  const signedParams = {
    overwrite: "true",
    public_id: publicId,
    timestamp
  };
  const signature = await sha1Hex(
    encodeSignatureParams(signedParams) + CLOUDINARY_API_SECRET
  );

  const form = new FormData();
  form.append("file", imageDataUrl);
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("overwrite", "true");
  form.append("signature", signature);

  const response = await fetch(
    "https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/image/upload",
    { method: "POST", body: form }
  );

  const body = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { parsed = null; }

  if (!response.ok) {
    const detail = parsed?.error?.message || body.slice(0, 500);
    throw new Error("cloudinary_" + response.status + ":" + detail);
  }

  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: "admin_requis" }, 403);

  if (!CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return json({ ok: false, error: "cloudinary_config_missing" }, 500);
  }
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
      "&select=id,status,category_id,category_confidence,calculated_price,cloudinary_urls&limit=1"
    );
    if (existing.error) return json({ ok: false, error: "import_read_failed" }, 500);

    const row = existing.data?.[0];
    if (!row) return json({ ok: false, error: "import_introuvable" }, 404);
    if (!row.category_id || Number(row.category_confidence) < 0.70) {
      return json({ ok: false, error: "category_confidence_low" }, 400);
    }
    if (row.calculated_price == null || Number(row.calculated_price) <= 0) {
      return json({ ok: false, error: "price_required" }, 400);
    }

    // Idempotence : une image déjà persistée n'est pas réuploadée.
    if (row.status === "MEDIA_READY" && row.cloudinary_urls?.images?.length) {
      return json({
        ok: true,
        importId,
        status: "MEDIA_READY",
        media: row.cloudinary_urls
      });
    }

    if (row.status !== "PRICED") {
      return json({ ok: false, error: "pricing_required" }, 409);
    }

    const image = parseImageDataUrl(body?.imageDataUrl);

    await updateImport(importId, {
      error_code: null,
      error_message: null
    });

    const uploaded = await uploadToCloudinary(image.dataUrl, importId);
    const media = normalizeMedia(uploaded);

    await updateImport(importId, {
      cloudinary_urls: media,
      status: "MEDIA_READY",
      error_code: null,
      error_message: null
    });

    return json({
      ok: true,
      importId,
      status: "MEDIA_READY",
      media
    });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 500);
    try {
      await updateImport(importId, {
        error_code: message.split(":")[0] || "media_failed",
        error_message: message
      });
    } catch {
      // keep primary error
    }
    return json({ ok: false, error: "media_failed", detail: message }, 500);
  }
});
