const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const MAX_ITEMS = 50;
const MAX_QUANTITY = 1000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function getJwtPayload(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
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

function getUserId(req: Request): string | null {
  const payload = getJwtPayload(req);
  if (!payload || typeof payload.sub !== "string" || !payload.sub.trim()) return null;
  if (payload.role !== "authenticated") return null;
  return payload.sub.trim();
}

function normalizeText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validPhone(value: unknown): value is string {
  return typeof value === "string" && /^242\d{9}$/.test(value.trim());
}

function normalizeQuantity(value: unknown): number | null {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null;
  return quantity;
}

async function rest<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T | null; status: number; error: string | null }> {
  try {
    const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      ...init,
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });

    const raw = await response.text();
    let data: unknown = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!response.ok) {
      const message = typeof data === "object" && data !== null
        ? String((data as { message?: unknown }).message || "Supabase error")
        : "Supabase error";
      return { data: null, status: response.status, error: message };
    }

    return { data: data as T, status: response.status, error: null };
  } catch (error) {
    return {
      data: null,
      status: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

interface ItemInput {
  product_id?: number | string;
  quantity?: number | string;
  couleur?: string | null;
  taille?: string | null;
}

interface ProductRow {
  id: number;
  name: string | null;
  price: number | string | null;
  category: string | null;
  category_id: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "backend_configuration_missing" }, 500);
  }

  const userId = getUserId(req);
  if (!userId) return json({ ok: false, error: "authentication_required" }, 401);

  let body: {
    items?: ItemInput[];
    customer_name?: string;
    phone?: string;
    delivery_address?: string;
    operator?: "MTN" | "AIRTEL";
  };

  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json_invalide" }, 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
    return json({ ok: false, error: "items_invalid" }, 400);
  }

  const customerName = normalizeText(body.customer_name, 120);
  const phone = normalizeText(body.phone, 20);
  const deliveryAddress = normalizeText(body.delivery_address, 500);

  if (!customerName) return json({ ok: false, error: "customer_name_required" }, 400);
  if (!validPhone(phone)) return json({ ok: false, error: "phone_invalid" }, 400);
  if (!deliveryAddress) return json({ ok: false, error: "delivery_address_required" }, 400);
  if (body.operator !== "MTN" && body.operator !== "AIRTEL") {
    return json({ ok: false, error: "operator_invalid" }, 400);
  }

  const normalizedItems = body.items.map((item) => {
    const productId = Number(item?.product_id);
    const quantity = normalizeQuantity(item?.quantity);

    if (!Number.isInteger(productId) || productId <= 0 || quantity === null) return null;

    return {
      productId,
      quantity,
      couleur: normalizeText(item?.couleur, 100) || null,
      taille: normalizeText(item?.taille, 100) || null
    };
  });

  if (normalizedItems.some((item) => item === null)) {
    return json({ ok: false, error: "item_invalid" }, 400);
  }

  const items = normalizedItems as Array<{
    productId: number;
    quantity: number;
    couleur: string | null;
    taille: string | null;
  }>;

  const productIds = [...new Set(items.map((item) => item.productId))];
  const productsRes = await rest<ProductRow[]>(
    "products?select=id,name,price,category,category_id&id=in.(" +
      encodeURIComponent(productIds.join(",")) +
      ")&limit=" +
      String(productIds.length)
  );

  if (productsRes.error) {
    return json({ ok: false, error: "products_read_failed" }, 500);
  }

  const productMap = new Map(
    (productsRes.data || []).map((product) => [Number(product.id), product])
  );

  if (productMap.size !== productIds.length) {
    return json({ ok: false, error: "product_not_found" }, 404);
  }

  try {
    let total = 0;

    const orderItems = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new Error("product_not_found");

      const unitPrice = Number(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new Error("product_price_invalid");
      }

      const lineTotal = Math.round(unitPrice * item.quantity);
      total += lineTotal;

      return {
        product_id: Number(product.id),
        name: normalizeText(product.name, 300),
        unit_price: unitPrice,
        quantity: item.quantity,
        variant: [item.couleur, item.taille].filter(Boolean).join(", ") || null,
        category_id: product.category_id || null,
        category: product.category || null
      };
    });

    if (!Number.isSafeInteger(total) || total <= 0) {
      return json({ ok: false, error: "order_total_invalid" }, 422);
    }

    const orderRes = await rest<Array<{ id: string; total: number | string; status: string }>>(
      "orders",
      {
        method: "POST",
        headers: { "Prefer": "return=representation" },
        body: JSON.stringify({
          user_id: userId,
          items: orderItems,
          total,
          status: "pending",
          payment_method: "openpay_" + body.operator.toLowerCase(),
          phone,
          delivery_address: deliveryAddress,
          payment_reference: null
        })
      }
    );

    if (orderRes.error) {
      return json({ ok: false, error: "order_create_failed" }, 500);
    }

    const order = orderRes.data?.[0];
    if (!order?.id) return json({ ok: false, error: "order_create_failed" }, 500);

    return json({
      ok: true,
      order_id: order.id,
      total: Number(order.total),
      currency: "XAF",
      payment_method: "openpay_" + body.operator.toLowerCase()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "product_price_invalid") {
      return json({ ok: false, error: "product_price_invalid" }, 422);
    }
    return json({ ok: false, error: "order_create_failed" }, 500);
  }
});
