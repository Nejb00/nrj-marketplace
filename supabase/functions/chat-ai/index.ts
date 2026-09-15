// ═══════════════════════════════════════════════════════════════════════════
// 🤖 Assistant NRJ — Edge Function Supabase (Deno)
//
// Déclenchée par le chat du site quand le vendeur ne répond pas.
// 1. Vérifie les réglages (chat_settings) et la propriété de la session
// 2. Vérifie que le dernier message est bien un client sans réponse
// 3. Cherche les produits pertinents du catalogue
// 4. Appelle Gemini avec un prompt boutique
// 5. Insère la réponse en sender='bot' → temps réel côté client
//
// DÉPLOIEMENT (dashboard Supabase OU API Management) :
//   Secrets (Edge Functions → Secrets) : GEMINI_API_KEY
//   Optionnel : GEMINI_MODEL (défaut : gemini-flash-latest)
//   Garde « Verify JWT » ACTIVÉE (le client envoie son token de session).
//
// ⚙️ ZÉRO DÉPENDANCE EXTERNE : plus d'import esm.sh (source de pannes
// « Module not found » au démarrage à froid). Toutes les lectures/écritures
// passent par des appels REST natifs avec le rôle service
// (SUPABASE_SERVICE_ROLE_KEY, injecté par Supabase, contourne la RLS —
// c'est lui qui insère les messages 'bot', jamais le navigateur).
// ═══════════════════════════════════════════════════════════════════════════

const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
};

const SYSTEM_PROMPT = `Tu es « l'Assistant NRJ » 🤖, l'IA de la boutique NRJ Marketplace — importation Chine, France, Turquie vers Congo-Brazzaville.
STYLE : français, réponses TRÈS courtes (1 à 3 phrases), ton chaleureux et direct, style WhatsApp.
RÈGLES :
- Appuie-toi UNIQUEMENT sur l'extrait de catalogue fourni (prix en XAF/FCFA, tailles, couleurs, MOQ = quantité minimale).
- Ne promets JAMAIS un prix, une remise, un stock ou un délai qui n'est pas dans le catalogue.
- Négociation de prix, commande ferme, paiement, livraison, réclamation → réponds très brièvement que le vendeur (humain) prend le relais dans cette même conversation.
- Ne demande jamais d'adresse, d'email ni de données personnelles.`;

interface ChatMsg {
    id: string;
    session_id: string;
    sender: string;
    content: string;
    metadata: { product?: { id: number; name: string; price?: number } } | null;
    created_at: string;
}

interface ProductRow {
    id: number;
    name: string;
    price: number | string;
    description?: string | null;
    moq?: string | number | null;
    tailles?: string | null;
    couleurs?: string | null;
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), { status, headers: CORS });
}

function jwtSub(token: string): string {
    // Décode le payload du JWT (le gateway Supabase l'a déjà vérifié si
    // « Verify JWT » est actif). sub = uuid de l'appelant.
    try {
        const payload = token.replace(/^Bearer\s+/i, "").split(".")[1] || "";
        const b = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))).sub || "";
    } catch {
        return "";
    }
}

// ── Couche REST native (remplace supabase-js / esm.sh) ──────────────────────
interface RestResult<T> {
    data: T | null;
    error: string | null;
}

async function rest<T>(path: string, init?: RequestInit): Promise<RestResult<T>> {
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
            ...init,
            headers: {
                "apikey": SERVICE_KEY,
                "Authorization": `Bearer ${SERVICE_KEY}`,
                "Content-Type": "application/json",
                ...(init?.headers as Record<string, string> | undefined),
            },
        });
        const txt = await r.text();
        let parsed: unknown = null;
        if (txt) {
            try {
                parsed = JSON.parse(txt);
            } catch {
                parsed = txt;
            }
        }
        if (!r.ok) {
            const msg = parsed && typeof parsed === "object"
                ? ((parsed as { message?: string }).message || `HTTP ${r.status}`)
                : `HTTP ${r.status}`;
            return { data: null, error: msg };
        }
        return { data: parsed as T, error: null };
    } catch (e) {
        return { data: null, error: String((e as Error)?.message || e) };
    }
}

Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);

    try {
        if (!GEMINI_KEY) return json({ ok: false, error: "GEMINI_API_KEY manquant (secrets Supabase)" }, 500);

        let body: { sessionId?: string };
        try {
            body = await req.json();
        } catch {
            return json({ error: "JSON invalide" }, 400);
        }
        const sessionId = (body.sessionId || "").trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
            return json({ error: "sessionId invalide" }, 400);
        }

        // Propriété : le token de l'appelant doit correspondre à la session
        const sub = jwtSub(req.headers.get("Authorization") || "");
        if (sub && sub !== sessionId) return json({ error: "session non autorisée" }, 403);

        // ── 1. Réglages IA ────────────────────────────────────────────────
        const settingsRes = await rest<Array<Record<string, unknown>>>(
            "chat_settings?select=*&limit=1",
        );
        const settings = settingsRes.data?.[0] || null;
        if (settings && settings.ai_enabled === false) {
            return json({ ok: true, skipped: "ai_disabled" });
        }
        const away = settings?.admin_away === true;
        // Si le vendeur est présent, on laisse au minimum 45 s au humain
        const minDelaySec = away ? 0 : 45;

        // ── 2. Derniers messages + gardes ─────────────────────────────────
        const msgsRes = await rest<ChatMsg[]>(
            `chat_messages?select=id,session_id,sender,content,metadata,created_at` +
                `&session_id=eq.${sessionId}&order=created_at.desc&limit=12`,
        );
        const msgs = msgsRes.data;
        if (!msgs || msgs.length === 0) return json({ ok: true, skipped: "no_messages" });

        const last = msgs[0];
        if (last.sender !== "client") return json({ ok: true, skipped: "already_answered" });

        const ageSec = (Date.now() - new Date(last.created_at).getTime()) / 1000;
        if (ageSec < minDelaySec) return json({ ok: true, skipped: "too_early" });
        if (ageSec > 1800) return json({ ok: true, skipped: "too_late" });

        // Anti-spam : 1 réponse IA max toutes les 30 s, 40 max par conversation
        const botRes = await rest<Array<{ created_at: string }>>(
            `chat_messages?select=created_at&session_id=eq.${sessionId}&sender=eq.bot`,
        );
        const botMsgs = botRes.data;
        if (botMsgs && botMsgs.length > 0) {
            if (botMsgs.length >= 40) return json({ ok: true, skipped: "bot_limit" });
            const lastBot = Math.max(...botMsgs.map((m) => new Date(m.created_at).getTime()));
            if (Date.now() - lastBot < 30000) return json({ ok: true, skipped: "rate_limited" });
        }

        // ── 3. Catalogue pertinent ────────────────────────────────────────
        const history = msgs.slice().reverse(); // chronologique
        const clientTexts = history.filter((m) => m.sender === "client")
            .map((m) => m.content || "").join(" \n ").toLowerCase();
        const contextProduct = history.filter((m) => m.sender === "client")
            .map((m) => m.metadata?.product).filter(Boolean).pop();

        const productsRes = await rest<ProductRow[]>(
            "products?select=id,name,price,description,moq,tailles,couleurs&limit=500",
        );

        const scored = (productsRes.data || []).map((p) => {
            const hay = `${p.name} ${p.description || ""} ${p.couleurs || ""}`.toLowerCase();
            let score = 0;
            for (const w of clientTexts.split(/[^a-zà-ÿ0-9]+/)) {
                if (w.length > 2 && hay.includes(w)) score += w.length;
            }
            if (contextProduct && p.id === contextProduct.id) score += 1000;
            return { p, score };
        })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        const catalogue: Array<Record<string, unknown>> = scored.map((x) => x.p as unknown as Record<string, unknown>);
        if (contextProduct && !catalogue.some((p) => p.id === contextProduct.id)) {
            catalogue.unshift(contextProduct as unknown as Record<string, unknown>);
        }

        const catalogueTxt = catalogue.length > 0
            ? catalogue.slice(0, 5).map((p) => {
                const prix = Number(p.price).toLocaleString("fr-FR");
                const moq = p.moq ? ` — MOQ ${p.moq}` : "";
                const desc = p.description ? ` — ${p.description}` : "";
                const cols = p.couleurs ? ` — couleurs : ${p.couleurs}` : "";
                return `- [ID ${p.id}] ${p.name} — ${prix} XAF${moq}${cols}${desc}`;
            }).join("\n")
            : "(aucun produit pertinent trouvé : ne cite aucun article précis)";

        const transcript = history.map((m) =>
            m.sender === "client"
                ? `Client : ${m.content}`
                : m.sender === "admin"
                ? `Vendeur (humain) : ${m.content}`
                : `Assistant IA : ${m.content}`
        ).join("\n");

        // ── 4. Appel Gemini ───────────────────────────────────────────────
        const geminiBody = {
            systemInstruction: {
                parts: [{ text: SYSTEM_PROMPT + "\n\nEXTRAIT DU CATALOGUE :\n" + catalogueTxt }],
            },
            contents: [{
                role: "user",
                parts: [{ text: transcript + "\n\nRéponds uniquement au dernier message du Client." }],
            }],
            // thinkingBudget:0 → le modèle « thinking » (2.5-flash) ne doit pas
            // consumer les tokens de sortie en raisonnement (réponses tronquées).
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 500,
                thinkingConfig: { thinkingBudget: 0 },
            },
        };

        const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
                body: JSON.stringify(geminiBody),
            },
        );
        if (!r.ok) {
            const err = (await r.text()).slice(0, 300);
            return json({ ok: false, error: "gemini_" + r.status, detail: err }, 502);
        }
        const g = await r.json();
        const reply = ((g?.candidates?.[0]?.content?.parts) || [])
            .map((p: { text?: string }) => p.text || "")
            .join("").trim();
        if (!reply) return json({ ok: false, error: "reponse_gemini_vide" }, 502);

        // ── 5. Insertion message bot + aperçu session ─────────────────────
        const insRes = await rest<null>("chat_messages", {
            method: "POST",
            headers: { "Prefer": "return=minimal" },
            body: JSON.stringify({
                session_id: sessionId,
                sender: "bot",
                content: reply,
                metadata: { model: MODEL },
                read_by_customer: false,
                read_by_admin: true, // l'IA « sait » ce qu'elle a écrit
            }),
        });
        if (insRes.error) return json({ ok: false, error: insRes.error }, 500);

        // Aperçu de conversation (best effort, silencieux si échec)
        await rest<null>(`chat_sessions?id=eq.${sessionId}`, {
            method: "PATCH",
            headers: { "Prefer": "return=minimal" },
            body: JSON.stringify({
                last_message_preview: reply.slice(0, 90),
                last_message_at: new Date().toISOString(),
            }),
        });

        return json({ ok: true, reply });
    } catch (e) {
        return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
    }
});
