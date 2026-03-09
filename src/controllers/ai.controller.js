// src/controllers/ai.controller.js
// OpenRouter con router automatico de modelos gratuitos

const HAIRCUT_CATALOG = [
  { id: "fade_bajo",       name: "Fade Bajo",        desc: "degradado suave desde la nuca" },
  { id: "fade_medio",      name: "Fade Medio",       desc: "degradado desde la mitad de la cabeza" },
  { id: "fade_alto",       name: "Fade Alto",        desc: "degradado alto con contraste marcado" },
  { id: "undercut",        name: "Undercut",         desc: "lados y nuca rapados, volumen arriba" },
  { id: "pompadour",       name: "Pompadour",        desc: "cabello peinado hacia atras con volumen frontal" },
  { id: "texturizado",     name: "Texturizado",      desc: "capas con textura natural y movimiento" },
  { id: "clasico_lateral", name: "Clasico con Raya", desc: "raya lateral, formal y elegante" },
  { id: "buzz_cut",        name: "Buzz Cut",         desc: "corte al ras uniforme muy corto" },
  { id: "corte_redondo",   name: "Corte Redondo",    desc: "forma redondeada que suaviza rasgos" },
  { id: "mohawk_suave",    name: "Mohawk Suave",     desc: "tira central con lados degradados" },
  { id: "flequillo",       name: "Con Flequillo",    desc: "flequillo frontal recto o lateral" },
  { id: "crop_frances",    name: "Crop Frances",     desc: "flequillo corto con textura superior" },
];

const buildPrompt = (catalogText) =>
`Eres un experto estilista y barbero profesional. Analiza la foto y recomienda cortes de cabello.

CATALOGO:
${catalogText}

Responde SOLO en JSON sin markdown:
{
  "face_shape": "forma del rostro",
  "hair_type": "tipo de cabello",
  "top_picks": [
    {"id": "id_corte", "name": "nombre", "score": 95, "reason": "por que le favorece", "tips": "consejo"}
  ],
  "avoid": ["corte que no le favorece"],
  "general_advice": "consejo general"
}

Exactamente 4 cortes en top_picks. IDs exactos del catalogo.`;

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return JSON.parse(fenced[1]);
  const obj = text.match(/(\{[\s\S]*\})/);
  if (obj) return JSON.parse(obj[1]);
  return JSON.parse(text);
}

// ── OpenRouter — usa router automatico de modelos gratis con vision ────────
async function callOpenRouter(image_base64, media_type, catalogText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY no configurada");

  // Modelos gratuitos con vision disponibles en marzo 2026
  // openrouter/free selecciona automaticamente el mejor disponible
  const models = [
    "openrouter/free",                              // router automatico (elige el mejor gratis con vision)
    "google/gemma-3-12b-it:free",                   // Gemma 3 con vision, gratuito
    "google/gemma-3-27b-it:free",                   // Gemma 3 27B con vision
    "mistralai/mistral-small-3.1-24b-instruct:free",// Mistral con vision
  ];

  let lastError;
  for (const model of models) {
    try {
      console.log(`AI: intentando OpenRouter modelo ${model}`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://styleapp.co",
          "X-Title": "StyleApp Haircut AI",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${media_type};base64,${image_base64}` } },
              { type: "text", text: buildPrompt(catalogText) },
            ],
          }],
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const msg = data.error?.message || `HTTP ${response.status}`;
        throw new Error(`OpenRouter ${model}: ${msg}`);
      }

      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error(`OpenRouter ${model} sin texto en respuesta`);

      console.log(`AI: OpenRouter OK con ${model}`);
      return text;
    } catch (err) {
      console.warn(`OpenRouter ${model} fallo:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error("Todos los modelos OpenRouter fallaron");
}

// ── Gemini fallback ────────────────────────────────────────────────────────
async function callGemini(image_base64, media_type, catalogText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: media_type, data: image_base64 } },
        { text: buildPrompt(catalogText) },
      ]}],
      generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini error ${response.status}: ${err}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini sin texto");
  return text;
}

// ── Anthropic fallback ─────────────────────────────────────────────────────
async function callAnthropic(image_base64, media_type, catalogText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic.Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1200,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type, data: image_base64 } },
      { type: "text", text: buildPrompt(catalogText) },
    ]}],
  });
  return response.content[0]?.text || "";
}

// ── Controller ─────────────────────────────────────────────────────────────
exports.analyzHaircut = async (req, res) => {
  try {
    const { image_base64, media_type = "image/jpeg" } = req.body;

    if (!image_base64)
      return res.status(400).json({ ok: false, error: "Se requiere la imagen en base64" });

    if (image_base64.length > 7_000_000)
      return res.status(400).json({ ok: false, error: "Imagen demasiado grande. Usa foto menor a 5MB" });

    const catalogText = HAIRCUT_CATALOG.map((c, i) => `${i + 1}. ${c.name}: ${c.desc}`).join("\n");

    const providers = [];
    if (process.env.OPENROUTER_API_KEY) providers.push({ name: "openrouter", fn: callOpenRouter });
    if (process.env.GEMINI_API_KEY)     providers.push({ name: "gemini",     fn: callGemini     });
    if (process.env.ANTHROPIC_API_KEY)  providers.push({ name: "anthropic",  fn: callAnthropic  });

    if (providers.length === 0)
      return res.status(500).json({ ok: false, error: "No hay proveedor de IA configurado" });

    let rawText, providerUsed, lastError;

    for (const p of providers) {
      try {
        rawText = await p.fn(image_base64, media_type, catalogText);
        providerUsed = p.name;
        break;
      } catch (err) {
        console.warn(`${p.name} fallo:`, err.message);
        lastError = err;
      }
    }

    if (!rawText) {
      console.error("Todos los proveedores fallaron:", lastError?.message);
      return res.status(503).json({ ok: false, error: "Servicio de IA no disponible. Intenta mas tarde." });
    }

    let analysis;
    try {
      analysis = extractJSON(rawText);
    } catch (e) {
      console.error("JSON parse error:", e.message, "| Raw:", rawText.substring(0, 300));
      return res.status(500).json({ ok: false, error: "No se pudo procesar el analisis. Intenta con otra foto." });
    }

    if (analysis.top_picks) {
      analysis.top_picks = analysis.top_picks.map((pick) => {
        const cat = HAIRCUT_CATALOG.find((c) => c.id === pick.id);
        return { ...pick, name: cat?.name || pick.name };
      });
    }

    return res.json({ ok: true, data: analysis, provider: providerUsed });

  } catch (err) {
    console.error("AI HAIRCUT ERROR:", err);
    return res.status(500).json({ ok: false, error: "Error inesperado en el analisis de IA" });
  }
};
