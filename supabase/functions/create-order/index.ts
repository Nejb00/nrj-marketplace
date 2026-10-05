const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUBLIC_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const PHONE_PATTERN = /^242\\d{9}$/;
const ALLOWED_PAYMENT_METHODS = new Set([
  "whatsapp",
  "openpay_mtn",
  "openpay_airtel"
]);

type CartItemInput = {
  productId?: number | string;
  quantity?: number | string;
  taille?: string | null;
  couleur?: string | null;
};

type RequestBody = {
  items?: CartItemInput[];
  phone?: string;
  payment_method?: string;
};

type ProductRow = {
  id: number;
  name: string | null;
  price: number | string | null;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function getBearerToken(req: Request): string | null {
  const value = req.headers.get("authorization") || "";
  const match = value.match(/^Bearer\\s+(.+)$/i);
  return match?.[1] || null;
}

async function getUserId(token: string): Promise<string | null> {
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      apikey: PUBLIC_KEY,
      Authorization: "Bearer " + token
    }
  });

  if (!response.ok) return null;

  const body = await response.json().catch(() => null);
  return typeof body?.id === "string" ? body.id : null;
}

async function supabaseRest<T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T | null; status: number; error: string | null }> {
  try {
    const headers = new Headers(init.headers || {});
    headers.set("apikey", SERVICE_KEY);
    headers.set("Authorization", "Bearer " + SERVICE_KEY);
    headers.set("Content-Type", "application/json");

    const response = await fetch(
      SUPABASE_URL + "/rest/v1/" + path,
      { ...init, headers }
    );

    const text = await response.text();
    let data: unknown = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return {
        data: null,
        status: response.status,
        error: typeof data === "object" && data !== null
          ? String((data as { message?: unknown }).message || "HTTP " + response.status)
          : "HTTP " + response.status
      };
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

function normalizeItems(items: CartItemInput[] | undefined) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    throw new TypeError("items_invalid");
  }

  const map = new Map<
    string,
    {
      productId: number;
      quantity: number;
      taille: string | null;
      couleur: string | null;
    }
  >();

  for (const raw of items) {
    const productId = Number(raw.productId);
    const quantity = Number(raw.quantity);

    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new TypeError("product_id_invalid");
    }

    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1000) {
      throw new TypeError("quantity_invalid");
    }

    const taille = raw.taille ? String(raw.taille).slice(0, 100) : null;
    const couleur = raw.couleur ? String(raw.couleur).slice(0, 100) : null;
    const key = [productId, couleur || "", taille || ""].join("\\u001f");
    const existing = map.get(key);

    if (existing) {
      existing.quantity += quantity;
    } else {
      map.set(key, {
        productId,
        quantity,
        taille,
        couleur
      });
    }
  }

  return [...map.values()];
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST uniquement" }, 405);

  if (!SUPABASE_URL || !SERVICE_KEY || !PUBLIC_KEY) {
    return json({ ok: false, error: "backend_configuration_missing" }, 500);
  }

  const token = getBearerToken(req);
  if (!token) return json({ ok: false, error: "authentication_required" }, 401);

  const userId = await getUserId(token);
  if (!userId) return json({ ok: false, error: "authentication_invalid" }, 401);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "json_invalid" }, 400);
  }

  const phone = String(body.phone || "").trim();
  if (!PHONE_PATTERN.test(phone)) {
    return json({ ok: false, error: "phone_invalid" }, 400);
  }

  const paymentMethod = String(body.payment_method || "whatsapp").trim().toLowerCase();
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
    return json({ ok: false, error: "payment_method_invalid" }, 400);
  }

  let items: ReturnType<typeof normalizeItems>;
  try {
    items = normalizeItems(body.items);
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof TypeError ? error.message : "items_invalid"
    }, 400);
  }

  const ids = [...new Set(items.map(item => item.productId))];
  const productResult = await supabaseRest<ProductRow[]>(
    "products?select=id,name,price&id=in.(" +
      ids.map(encodeURIComponent).join(",") +
      ")"
  );

  if (productResult.error) {
    return json({ ok: false, error: "products_lookup_failed" }, 502);
  }

  const products = new Map(
    (productResult.data || []).map(product => [Number(product.id), product])
  );

  if (products.size !== ids.length) {
    return json({ ok: false, error: "product_not_found" }, 409);
  }

  let total = 0;
  const orderItems = [];

  for (const item of items) {
    const product = products.get(item.productId);
    const unitPrice = Number(product?.price);

    if (!product || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      return json({ ok: false, error: "product_price_invalid" }, 409);
    }

    total += unitPrice * item.quantity;

    orderItems.push({
      productId: item.productId,
      name: product.name || "Produit",
      price: unitPrice,
      qty: item.quantity,
      variant: [item.couleur, item.taille].filter(Boolean).join(", ") || null
    });
  }

  const insert = await supabaseRest<Array<{
    id: string;
    user_id: string;
    total: number | string;
    status: string;
    payment_method: string;
    phone: string | null;
  }>>(
    "orders",
    {
      method: "POST",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify({
        user_id: userId,
        items: orderItems,
        total,
        status: "pending",
        payment_method: paymentMethod,
        phone
      })
    }
  );

  if (insert.error || !insert.data?.[0]) {
    return json({ ok: false, error: "order_creation_failed" }, 500);
  }

  const order = insert.data[0];

  return json({
    ok: true,
    order_id: order.id,
    total,
    payment_method: order.payment_method
  }, 201);
});
