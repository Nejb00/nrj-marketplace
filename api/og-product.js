// =============================================================================
// api/og-product.js
// Vercel Edge Function — sert les meta tags OpenGraph dynamiques pour un
// produit partagé (WhatsApp, Facebook, Twitter, etc.), et redirige les
// visiteurs humains vers la PWA (index.html) avec le produit ouvert.
//
// Appelée via /p/:id grâce au rewrite défini dans vercel.json.
// =============================================================================

export const config = { runtime: "edge" };

// Mêmes valeurs que src/js/config.js — clé publique (publishable), déjà
// exposée côté navigateur dans le bundle client, donc sans risque ici.
const SUPABASE_URL = "https://peojyqliwrtghomyukwn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Fy-Q_BAginf2p6UdUtxDMA_V1hP8Slt";

// User-agents des principaux crawlers de réseaux sociaux / messageries.
const BOT_UA_PATTERNS = [
  /facebookexternalhit/i,
  /Facebot/i,
  /Twitterbot/i,
  /WhatsApp/i,
  /LinkedInBot/i,
  /TelegramBot/i,
  /Slackbot/i,
  /Discordbot/i,
  /vkShare/i,
  /redditbot/i,
  /Pinterest/i,
  /SkypeUriPreview/i,
  /Applebot/i,
  /Google-InspectionTool/i,
];

function isBot(userAgent) {
  if (!userAgent) return false;
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(price) {
  const n = Number(price);
  if (Number.isNaN(n)) return String(price);
  return `${n.toLocaleString("fr-FR")} FCFA`;
}

async function fetchProduct(id) {
  const url = `${SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(
    id
  )}&select=id,name,price,image,description`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

function buildOgHtml(product, siteUrl, id) {
  const title = escapeHtml(product.name || "FLUO");
  const price = formatPrice(product.price);
  const description = escapeHtml(
    product.description
      ? `${product.description} — ${price}`
      : `Importation directe — ${price} — Commander via WhatsApp`
  );
  const image = product.image
    ? escapeHtml(product.image)
    : `${siteUrl}/icon-192.png`;
  const pageUrl = `${siteUrl}/p/${id}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${title} — FLUO</title>
<meta property="og:type" content="product">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${pageUrl}">
<meta property="og:site_name" content="FLUO">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0; url=${pageUrl.replace(
    "/p/",
    "/?id="
  )}">
</head>
<body></body>
</html>`;
}

export default async function handler(req) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const siteUrl = `${url.protocol}//${url.host}`;
  const userAgent = req.headers.get("user-agent") || "";

  if (!id) {
    return Response.redirect(siteUrl, 302);
  }

  // Visiteur humain -> redirection directe vers la PWA, pas besoin
  // d'interroger Supabase, on gagne en rapidité.
  // Note : ?id= est le paramètre déjà géré nativement par src/js/main.js
  // pour ouvrir automatiquement la modal du produit au chargement.
  if (!isBot(userAgent)) {
    return Response.redirect(`${siteUrl}/?id=${encodeURIComponent(id)}`, 302);
  }

  // Bot -> on va chercher le produit pour générer les meta tags.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Response.redirect(`${siteUrl}/?id=${encodeURIComponent(id)}`, 302);
  }

  const product = await fetchProduct(id);

  if (!product) {
    return Response.redirect(`${siteUrl}/?id=${encodeURIComponent(id)}`, 302);
  }

  const html = buildOgHtml(product, siteUrl, id);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Cache court côté CDN Vercel : évite de spammer Supabase à chaque
      // partage, tout en laissant les mises à jour de prix/photo remonter
      // assez vite (5 min, aligné sur la fréquence de la synchro Drive).
      "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
