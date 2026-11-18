// Cloudinary signing for NRJ classic product creation.
// Supabase verifies the JWT before invocation because verify_jwt = true.
const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";
const UPLOAD_PRESET = Deno.env.get("CLOUDINARY_PRODUCT_UPLOAD_PRESET")?.trim() || "";
const PRODUCT_PREFIX = "nrj-marketplace/products/";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!isAdmin(req)) return json({ ok: false, error: "admin_requis" }, 403);

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET || !UPLOAD_PRESET) {
    return json({ ok: false, error: "cloudinary_config_missing" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json_invalide" }, 400);
  }
  const count = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).count
    : undefined;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 6) {
    return json({ ok: false, error: "nombre_images_invalide" }, 400);
  }

  const batchId = crypto.randomUUID();
  const uploads = [];
  for (let slot = 1; slot <= count; slot += 1) {
    const publicId = PRODUCT_PREFIX + batchId + "/" + slot;
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = {
      overwrite: "false",
      public_id: publicId,
      timestamp,
      upload_preset: UPLOAD_PRESET,
    };
    const signature = await sha1Hex(
      encodeSignatureParams(signedParams) + CLOUDINARY_API_SECRET
    );
    uploads.push({ slot, timestamp, public_id: publicId, overwrite: "false" as const, signature });
  }

  return json({
    ok: true,
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    batch_id: batchId,
    upload_preset: UPLOAD_PRESET,
    uploads,
  });
});
