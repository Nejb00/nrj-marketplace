// ═══════════════════════════════════════════════════════════════════════════
// 🚀 NRJ Product Import OS — Safe staging → products publisher (PR #7)
// ═══════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const AUTO_THRESHOLD = 0.90;
const MIN_REVIEW_THRESHOLD = 0.70;
const MAX_NAME_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 5000;

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
        ? (parsed.message || parsed.hint || "Erreur Supabase")
        : "Erreur Supabase";
      return { data: null, error: message };
    }
    return { data: parsed, error: null };
  } catch (error) {
    return { data: null, error: "supabase_request_failed" };
  }
}

async function updateImport(id, patch) {
  const result = await rest("product_imports?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (result.error) throw new Error(result.error);
  return result.data?.[0] || null;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function toVariantText(value) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(", ")
    .slice(0, 1000);
}

function normalizeMediaUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.length > 2000 || !/^https?:\\/\\//i.test(url)) return "";
  return url;
}

function normalizeVariantItems(rawVariants) {
  const source = rawVariants && typeof rawVariants === "object"
    ? rawVariants
    : {};
  const items = Array.isArray(source.items) ? source.items : [];

  const byKey = new Map();

  for (const raw of items.slice(0, 100)) {
    if (!raw || typeof raw !== "object") continue;

    const variantKey = cleanText(
      raw.variant_key || raw.variantKey || raw.key || raw.sku || raw.label,
      160
    );
    if (!variantKey || byKey.has(variantKey)) continue;

    const mediaSource = Array.isArray(raw.media)
      ? raw.media
      : Array.isArray(raw.images)
        ? raw.images
        : [];

    const media = mediaSource
      .map((item) => {
        if (typeof item === "string") return normalizeMediaUrl(item);
        if (!item || typeof item !== "object") return "";
        return normalizeMediaUrl(
          item.url || item.delivery_url || item.secure_url
        );
      })
      .filter(Boolean)
      .slice(0, 100);

    const price = raw.price == null ? null : Number(raw.price);
    const safePrice = Number.isFinite(price) && price > 0 ? price : null;

    const attributes = raw.attributes && typeof raw.attributes === "object"
      ? raw.attributes
      : {};

    byKey.set(variantKey, {
      variant_key: variantKey,
      label: cleanText(raw.label, 300) || variantKey,
      color: cleanText(raw.color || raw.colour, 100) || null,
      size: cleanText(raw.size || raw.taille, 100) || null,
      sku: cleanText(raw.sku, 120) || null,
      price: safePrice,
      moq: raw.moq == null ? null : cleanText(raw.moq, 50) || null,
      active: raw.active !== false,
      sort_order: Number.isSafeInteger(Number(raw.sort_order))
        ? Number(raw.sort_order)
        : byKey.size,
      attributes,
      media
    });
  }

  return [...byKey.values()];
}

function collectVariantMedia(variantItems) {
  return variantItems.flatMap((variant) =>
    variant.media.map((url, index) => ({
      variant_key: variant.variant_key,
      url,
      sort_order: index
    }))
  );
}

async function publishVariantGraph(productId, variantItems) {
  if (!variantItems.length) return { variants: 0, media: 0 };

  const insertedVariants = await rest("product_variants?select=id,variant_key", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(
      variantItems.map((variant) => ({
        product_id: productId,
        variant_key: variant.variant_key,
        label: variant.label,
        color: variant.color,
        size: variant.size,
        sku: variant.sku,
        price: variant.price,
        moq: variant.moq,
        active: variant.active,
        sort_order: variant.sort_order,
        attributes: variant.attributes
      }))
    )
  });

  if (insertedVariants.error || !Array.isArray(insertedVariants.data)) {
    throw new Error("variant_insert_failed");
  }

  const variantMap = new Map(
    insertedVariants.data.map((variant) => [
      String(variant.variant_key),
      String(variant.id)
    ])
  );

  const variantMedia = collectVariantMedia(variantItems)
    .map((media) => ({
      product_id: productId,
      variant_id: variantMap.get(media.variant_key) || null,
      url: media.url,
      media_type: "image",
      alt_text: "",
      sort_order: media.sort_order,
      metadata: {}
    }))
    .filter((media) => media.variant_id);

  if (variantMedia.length) {
    const insertedMedia = await rest("product_media", {
      method: "POST",
      body: JSON.stringify(variantMedia)
    });
    if (insertedMedia.error) {
      throw new Error("variant_media_insert_failed");
    }
  }

  return {
    variants: insertedVariants.data.length,
    media: variantMedia.length
  };
}

function getPublishEligibility(row) {
  const ai = row.ai_analysis && typeof row.ai_analysis === "object" ? row.ai_analysis : {};
  const classification = ai.classification && typeof ai.classification === "object"
    ? ai.classification
    : {};

  const overall = Number(row.overall_confidence);
  const safeOverall = Number.isFinite(overall) ? Math.max(0, Math.min(1, overall)) : 0;
  const category = Number(row.category_confidence);
  const safeCategory = Number.isFinite(category) ? Math.max(0, Math.min(1, category)) : 0;

  return {
    overall_confidence: safeOverall,
    category_confidence: safeCategory,
    auto_publish_eligible:
      safeOverall >= AUTO_THRESHOLD &&
      safeCategory >= AUTO_THRESHOLD &&
      classification.auto_publish_eligible === true
  };
}

function extractMedia(row) {
  const media = row.cloudinary_urls && typeof row.cloudinary_urls === "object"
    ? row.cloudinary_urls
    : {};
  const images = Array.isArray(media.images) ? media.images : [];
  return images
    .map((item) => normalizeMediaUrl(
      item?.delivery_url || item?.secure_url || item?.url
    ))
    .filter(Boolean)
    .slice(0, 6);
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
  const approve = body?.approve === true;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId)) {
    return json({ ok: false, error: "import_id_invalide" }, 400);
  }

  try {
    const existing = await rest(
      "product_imports?id=eq." + encodeURIComponent(importId) +
      "&select=id,status,product_name,description,moq,variants,category_id,category_confidence,calculated_price,cloudinary_urls,overall_confidence,ai_analysis,published_product_id&limit=1"
    );
    if (existing.error) return json({ ok: false, error: "import_read_failed" }, 500);

    const row = existing.data?.[0];
    if (!row) return json({ ok: false, error: "import_introuvable" }, 404);

    if (row.status === "PUBLISHED" && row.published_product_id) {
      return json({
        ok: true,
        alreadyPublished: true,
        importId,
        status: "PUBLISHED",
        productId: row.published_product_id
      });
    }

    if (row.status === "CANCELLED") {
      return json({ ok: false, error: "import_annule" }, 409);
    }

    const eligibility = getPublishEligibility(row);
    const images = extractMedia(row);

    if (!row.category_id || eligibility.category_confidence < MIN_REVIEW_THRESHOLD) {
      return json({ ok: false, error: "category_review_required" }, 409);
    }
    if (row.calculated_price == null || Number(row.calculated_price) <= 0) {
      return json({ ok: false, error: "price_required" }, 409);
    }
    if (!images.length) {
      return json({ ok: false, error: "media_required" }, 409);
    }
    if (eligibility.overall_confidence < MIN_REVIEW_THRESHOLD) {
      return json({ ok: false, error: "confidence_too_low" }, 409);
    }

    const autoEligible =
      row.status === "MEDIA_READY" &&
      eligibility.auto_publish_eligible;

    if (!autoEligible && !approve && row.status !== "READY") {
      return json({
        ok: false,
        error: "human_approval_required",
        review_required: true,
        confidence: eligibility
      }, 409);
    }

    if (approve && row.status === "MEDIA_READY") {
      await updateImport(importId, {
        status: "READY",
        error_code: null,
        error_message: null
      });
    } else if (!autoEligible && row.status !== "READY") {
      return json({ ok: false, error: "ready_status_required" }, 409);
    }

    const refreshed = await rest(
      "product_imports?id=eq." + encodeURIComponent(importId) +
      "&select=id,status,category_id,calculated_price,cloudinary_urls,overall_confidence,category_confidence,published_product_id&limit=1"
    );
    if (refreshed.error) throw new Error("import_refresh_failed");
    const current = refreshed.data?.[0];
    if (!current) throw new Error("import_disparu");

    if (current.published_product_id) {
      return json({
        ok: true,
        alreadyPublished: true,
        importId,
        status: "PUBLISHED",
        productId: current.published_product_id
      });
    }

    const categoryResult = await rest(
      "categories?id=eq." + encodeURIComponent(current.category_id) +
      "&select=id,name&limit=1"
    );
    if (categoryResult.error) throw new Error("category_read_failed");
    const category = categoryResult.data?.[0];
    if (!category) throw new Error("category_introuvable");

    const payloadResult = await rest(
      "product_imports?id=eq." + encodeURIComponent(importId) +
      "&select=product_name,description,moq,variants,calculated_price,cloudinary_urls,category_id&limit=1"
    );
    if (payloadResult.error) throw new Error("import_payload_failed");
    const payload = payloadResult.data?.[0];
    if (!payload) throw new Error("import_payload_missing");

    const mediaImages = extractMedia(payload);
    if (!mediaImages.length) throw new Error("media_required");

    const variants = payload.variants && typeof payload.variants === "object"
      ? payload.variants
      : {};
    const variantItems = normalizeVariantItems(variants);

    let publishImages = mediaImages;
    if (!publishImages.length) {
      publishImages = variantItems
        .flatMap((variant) => variant.media)
        .filter(Boolean)
        .slice(0, 6);
    }

    if (!publishImages.length) throw new Error("media_required");

    const product = {
      name: cleanText(payload.product_name, MAX_NAME_LENGTH) || "Produit importé NRJ",
      category_id: category.id,
      category: cleanText(category.name, 200),
      price: Number(payload.calculated_price),
      image: publishImages[0] || null,
      image2: publishImages[1] || null,
      image3: publishImages[2] || null,
      image4: publishImages[3] || null,
      image5: publishImages[4] || null,
      image6: publishImages[5] || null,
      tailles: toVariantText(variants.sizes),
      couleurs: toVariantText(variants.colors),
      moq: cleanText(payload.moq, 50) || "1",
      description: cleanText(payload.description, MAX_DESCRIPTION_LENGTH)
    };

    const inserted = await rest(
      "products?select=id,name,price,category_id,image,image2,image3,image4,image5,image6,moq,description",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(product)
      }
    );
    if (inserted.error) throw new Error("product_insert_failed:" + inserted.error);

    const published = inserted.data?.[0];
    if (!published?.id) throw new Error("product_insert_missing_id");

    if (variantItems.length) {
      try {
        await publishVariantGraph(published.id, variantItems);
      } catch (variantError) {
        await rest(
          "products?id=eq." + encodeURIComponent(published.id),
          { method: "DELETE" }
        );
        throw variantError;
      }
    }

    await updateImport(importId, {
      published_product_id: published.id,
      status: "PUBLISHED",
      error_code: null,
      error_message: null
    });

    return json({
      ok: true,
      importId,
      status: "PUBLISHED",
      productId: published.id,
      product: published,
      mode: autoEligible ? "AUTO" : "HUMAN_APPROVED"
    });
  } catch (error) {
    const message = "publish_failed";
    try {
      await updateImport(importId, {
        error_code: message,
        error_message: "Publication impossible. Réessayer ou intervention admin requise."
      });
    } catch {
      // keep primary error
    }
    return json({ ok: false, error: "publish_failed" }, 500);
  }
});
