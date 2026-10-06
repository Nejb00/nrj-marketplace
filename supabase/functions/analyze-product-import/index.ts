// ═══════════════════════════════════════════════════════════════════════════
// 🧠 NRJ Product Import OS — Vision + extraction structurée (PR #3)
// ═══════════════════════════════════════════════════════════════════════════

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const MAX_INLINE_IMAGE_CHARS = 15 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    product_name: { type: ["string", "null"], description: "Nom commercial probable du produit." },
    description: { type: ["string", "null"], description: "Description courte et factuelle." },
    supplier_price: { type: ["number", "null"], description: "Prix fournisseur explicitement visible ou indiqué. Ne devine jamais." },
    supplier_currency: { type: ["string", "null"], description: "Devise explicitement identifiable, par exemple CNY ou USD." },
    moq: { type: ["string", "null"], description: "Quantité minimale de commande visible ou indiquée." },
    variants: {
      type: ["object", "null"],
      properties: {
        colors: { type: "array", items: { type: "string" } },
        sizes: { type: "array", items: { type: "string" } },
        other: { type: "array", items: { type: "string" } }
      },
      required: ["colors", "sizes", "other"]
    },
    visual_category_hint: { type: ["string", "null"], description: "Catégorie descriptive libre; aucun identifiant de catégorie." },
    overall_confidence: { type: "number", minimum: 0, maximum: 1, description: "Confiance globale entre 0 et 1." },
    evidence: { type: "array", items: { type: "string" }, description: "Indices observables utilisés." }
  },
  required: [
    "product_name",
    "description",
    "supplier_price",
    "supplier_currency",
    "moq",
    "variants",
    "visual_category_hint",
    "overall_confidence",
    "evidence"
  ]
};

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

function parseImageDataUrl(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length > MAX_INLINE_IMAGE_CHARS) throw new Error("image_trop_volumineuse");
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (!match) throw new Error("image_data_url_invalide");
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) throw new Error("format_image_non_supporte");
  return { mimeType, data: match[2] };
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
    return { data: null, error: "supabase_request_failed" };
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

function normalizeAnalysis(value) {
  const source = value && typeof value === "object" ? value : {};
  const confidence = Number(source.overall_confidence);
  const safeConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0;
  const variantsSource = source.variants && typeof source.variants === "object" ? source.variants : {};
  const toStringArray = (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 30)
    : [];

  return {
    product_name: typeof source.product_name === "string" ? source.product_name.slice(0, 300) : null,
    description: typeof source.description === "string" ? source.description.slice(0, 2000) : null,
    supplier_price: typeof source.supplier_price === "number" && Number.isFinite(source.supplier_price)
      ? source.supplier_price
      : null,
    supplier_currency: typeof source.supplier_currency === "string" ? source.supplier_currency.slice(0, 20) : null,
    moq: typeof source.moq === "string" ? source.moq.slice(0, 100) : null,
    variants: {
      colors: toStringArray(variantsSource.colors),
      sizes: toStringArray(variantsSource.sizes),
      other: toStringArray(variantsSource.other)
    },
    visual_category_hint: typeof source.visual_category_hint === "string"
      ? source.visual_category_hint.slice(0, 200)
      : null,
    overall_confidence: safeConfidence,
    evidence: toStringArray(source.evidence)
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: "admin_requis" }, 403);
  if (!GEMINI_KEY) return json({ ok: false, error: "gemini_key_missing" }, 500);
  if (!SERVICE_KEY || !SUPABASE_URL) return json({ ok: false, error: "supabase_server_config_missing" }, 500);

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

  const rawText = typeof body?.rawText === "string"
    ? body.rawText.trim().slice(0, 12000)
    : "";

  let image;
  try {
    image = parseImageDataUrl(body?.imageDataUrl);
  } catch (error) {
    return json({ ok: false, error: "image_data_url_invalide" }, 400);
  }

  if (!image) return json({ ok: false, error: "image_requise" }, 400);

  try {
    const existing = await rest(
      "product_imports?id=eq." + encodeURIComponent(importId) + "&select=id,status&limit=1"
    );
    if (existing.error) return json({ ok: false, error: "import_read_failed" }, 500);
    if (!existing.data?.[0]) return json({ ok: false, error: "import_introuvable" }, 404);

    await updateImport(importId, {
      status: "ANALYZING",
      error_code: null,
      error_message: null
    });

    const prompt = [
      "Tu es le moteur de compréhension produit de NRJ Marketplace.",
      "Extrais uniquement des informations observables dans la capture et/ou le texte Alibaba fourni.",
      "Ne devine jamais un prix, une devise, un MOQ ou une variante absente.",
      "La catégorie produite est une suggestion descriptive libre. Ne fabrique aucun identifiant de catégorie.",
      "Conserve les unités et devises telles qu'observées.",
      "Écris une description commerciale factuelle, sans promesse de stock ou de délai.",
      rawText ? "TEXTE FOURNI:\n" + rawText : "AUCUN TEXTE FOURNI."
    ].join("\n");

    const geminiBody = {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_KEY
        },
        body: JSON.stringify(geminiBody)
      }
    );

    if (!response.ok) {
      throw new Error("gemini_request_failed");
    }

    const result = await response.json();
    const outputText = ((result?.candidates?.[0]?.content?.parts) || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!outputText) throw new Error("reponse_gemini_vide");

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("json_gemini_invalide");
    }

    const analysis = normalizeAnalysis(parsed);
    const nextStatus = Number(analysis.overall_confidence) < 0.7
      ? "LOW_CONFIDENCE"
      : "CLASSIFIED";

    await updateImport(importId, {
      ai_analysis: {
        ...analysis,
        engine: "gemini-vision",
        model: MODEL,
        analyzed_at: new Date().toISOString()
      },
      product_name: analysis.product_name,
      description: analysis.description,
      supplier_price: analysis.supplier_price,
      supplier_currency: analysis.supplier_currency,
      moq: analysis.moq,
      variants: analysis.variants,
      overall_confidence: analysis.overall_confidence,
      status: nextStatus,
      error_code: null,
      error_message: null
    });

    return json({ ok: true, importId, status: nextStatus, analysis });
  } catch (error) {
    const message = "analysis_failed";
    try {
      await updateImport(importId, {
        status: "FAILED",
        error_code: message,
        error_message: "Analyse impossible. Réessayer ou intervention admin requise."
      });
    } catch {
      // keep the primary error
    }
    return json({ ok: false, error: "analysis_failed" }, 500);
  }
});
