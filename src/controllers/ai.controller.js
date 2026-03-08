// src/controllers/ai.controller.js
const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Catálogo de cortes con descripción para el prompt
const HAIRCUT_CATALOG = [
  { id: "fade_bajo",       name: "Fade Bajo",          desc: "degradado suave desde la nuca" },
  { id: "fade_medio",      name: "Fade Medio",         desc: "degradado desde la mitad de la cabeza" },
  { id: "fade_alto",       name: "Fade Alto",          desc: "degradado alto con contraste marcado" },
  { id: "undercut",        name: "Undercut",           desc: "lados y nuca rapados, volumen arriba" },
  { id: "pompadour",       name: "Pompadour",          desc: "cabello peinado hacia atrás con volumen frontal" },
  { id: "texturizado",     name: "Texturizado",        desc: "capas con textura natural y movimiento" },
  { id: "clasico_lateral", name: "Clásico con Raya",   desc: "raya lateral, formal y elegante" },
  { id: "buzz_cut",        name: "Buzz Cut",           desc: "corte al ras uniforme muy corto" },
  { id: "corte_redondo",   name: "Corte Redondo",      desc: "forma redondeada que suaviza rasgos" },
  { id: "mohawk_suave",    name: "Mohawk Suave",       desc: "tira central con lados degradados" },
  { id: "flequillo",       name: "Con Flequillo",      desc: "flequillo frontal recto o lateral" },
  { id: "crop_frances",    name: "Crop Francés",       desc: "flequillo corto con textura superior" },
];

exports.analyzHaircut = async (req, res) => {
  try {
    const { image_base64, media_type = "image/jpeg" } = req.body;

    if (!image_base64) {
      return res.status(400).json({ ok: false, error: "Se requiere la imagen en base64" });
    }

    // Validar tamaño (max 5MB en base64 ≈ 6.7MB string)
    if (image_base64.length > 7_000_000) {
      return res.status(400).json({ ok: false, error: "La imagen es demasiado grande. Usa una foto menor a 5MB" });
    }

    const catalogText = HAIRCUT_CATALOG
      .map((c, i) => `${i + 1}. ${c.name}: ${c.desc}`)
      .join("\n");

    const prompt = `Eres un experto estilista y barbero profesional con 20 años de experiencia. 
Analiza la foto de esta persona y proporciona recomendaciones personalizadas de cortes de cabello.

CATÁLOGO DE CORTES DISPONIBLES:
${catalogText}

Analiza:
1. Forma del rostro (oval, redondo, cuadrado, rectangular, corazón, diamante)
2. Tipo y textura del cabello actual (liso, ondulado, rizado, grueso, fino)
3. Características faciales destacadas

Responde ÚNICAMENTE en formato JSON con esta estructura exacta, sin texto adicional:
{
  "face_shape": "nombre de la forma del rostro",
  "hair_type": "descripción del tipo de cabello",
  "top_picks": [
    {
      "id": "id_del_corte",
      "name": "nombre del corte",
      "score": 95,
      "reason": "explicación personalizada de por qué este corte le favorece (2-3 oraciones)",
      "tips": "consejo de mantenimiento o estilo específico para esta persona"
    }
  ],
  "avoid": ["corte que NO le favorece con razón breve"],
  "general_advice": "consejo general personalizado de 2-3 oraciones sobre su cabello"
}

Incluye exactamente 4 cortes en top_picks, ordenados de mayor a menor recomendación (score 0-100).
Los IDs deben ser exactamente los del catálogo.`;

    const response = await client.messages.create({
      model:      "claude-opus-4-5",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            {
              type:   "image",
              source: {
                type:       "base64",
                media_type: media_type,
                data:       image_base64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    });

    const rawText = response.content[0]?.text || "";

    // Extraer JSON de la respuesta
    let analysis;
    try {
      // Intentar parsear directo o extraer del bloque ```json
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) ||
                        rawText.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      analysis = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr, "Raw:", rawText);
      return res.status(500).json({
        ok: false,
        error: "No se pudo procesar el análisis. Intenta con otra foto.",
      });
    }

    // Enriquecer con info del catálogo
    if (analysis.top_picks) {
      analysis.top_picks = analysis.top_picks.map((pick: any) => {
        const catalog = HAIRCUT_CATALOG.find((c) => c.id === pick.id);
        return { ...pick, name: catalog?.name || pick.name };
      });
    }

    return res.json({ ok: true, data: analysis });
  } catch (err: any) {
    console.error("AI HAIRCUT ERROR:", err);
    if (err?.status === 401) {
      return res.status(500).json({ ok: false, error: "API key de Anthropic inválida" });
    }
    if (err?.status === 529 || err?.status === 503) {
      return res.status(503).json({ ok: false, error: "El servicio de IA está temporalmente ocupado. Intenta en unos segundos." });
    }
    return res.status(500).json({ ok: false, error: "Error en el análisis de IA" });
  }
};
