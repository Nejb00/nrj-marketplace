// Admin-only cleanup for image uploads made during classic product creation.
// Supabase verifies the JWT before invocation because verify_jwt = true.
const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";
const PRODUCT_PUBLIC_ID_PATTERN = /^nrj-marketplace\/products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[1-6]$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function getJwtPayload(req: Request): Record<string, unknown> | null {
  const authorization = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(authorization.trim());
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

function isAdmin(req: Request): boolean {
  // The API gateway verifies signature, issuer and expiry; app_metadata is server-controlled.
  const payload = getJwtPayload(req);
  if (!payload || payload.role !== "authenticated" || payload.is_anonymous === true) return false;
  const metadata = payload.app_metadata;
  const role = metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).role
    : null;
  return role === "admin";
}

function encodeSignatureParams(params: Record<string, string | number>): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + "=" + String(value))
    .join("&");
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function destroyImage(publicId: string): Promise<{ public_id: string; ok: boolean; result: string }> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedParams = { public_id: publicId, timestamp };
  const signature = await sha1Hex(
    encodeSignatureParams(signedParams) + CLOUDINARY_API_SECRET
  );
  const form = new FormData();
  form.append("public_id", publicId);
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  try {
    const response = await fetch(
      "https://api.cloudinary.com/v1_1/" + CLOUDINARY_CLOUD_NAME + "/image/destroy",
      { method: "POST", body: form }
    );
    let payload: Record<string, unknown> | null = null;
    try {
      const value = await response.json();
      payload = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      payload = null;
    }
    if (!response.ok) return { public_id: publicId, ok: false, result: "failed" };
    const providerResult = payload?.result;
    const ok = providerResult === "ok" || providerResult === "not found";
    const result = providerResult === "ok"
      ? "deleted"
      : providerResult === "not found"
        ? "not_found"
        : "failed";
    return { public_id: publicId, ok, result };
  } catch {
    return { public_id: publicId, ok: false, result: "failed" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: "admin_requis" }, 403);
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    return json({ ok: false, error: "cloudinary_config_missing" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json_invalide" }, 400);
  }
  const publicIds = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).public_ids
    : undefined;
  if (!Array.isArray(publicIds) || publicIds.length < 1 || publicIds.length > 6) {
    return json({ ok: false, error: "public_ids_invalides" }, 400);
  }
  if (new Set(publicIds).size !== publicIds.length) {
    return json({ ok: false, error: "public_ids_invalides" }, 400);
  }
  if (!publicIds.every((publicId) =>
    typeof publicId === "string"
      && publicId === publicId.trim()
      && PRODUCT_PUBLIC_ID_PATTERN.test(publicId)
  )) {
    return json({ ok: false, error: "public_ids_invalides" }, 400);
  }

  const results = [];
  for (const publicId of publicIds as string[]) {
    results.push(await destroyImage(publicId));
  }
  return json({
    ok: results.every((result) => result.ok),
    results,
  });
});
