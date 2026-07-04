import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import { GoogleGenAI } from "npm:@google/genai";

const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

console.log("WhatsApp Webhook Function Starting...");

Deno.serve(async (req) => {
  try {
    // Initialize Supabase Admin Client using environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Allow GET for webhook verification (Meta WhatsApp API requirement)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
        return new Response(challenge, { status: 200 });
      }
      return new Response("Invalid verify token", { status: 403 });
    }

    const body = await req.json();
    console.log("Received Webhook:", JSON.stringify(body, null, 2));

    let userPhone = "";
    let userMessage = "";
    let isEvolutionAPI = false;

    // 1. Detect Evolution API Format (Baileys based)
    if (body.data && body.data.message) {
      isEvolutionAPI = true;
      userPhone = body.data.key?.remoteJid?.split("@")[0] || "";
      userMessage = body.data.message?.conversation || body.data.message?.extendedTextMessage?.text || "";
    } 
    // 2. Detect Meta WhatsApp Cloud API Format
    else if (body.entry && body.entry[0]?.changes && body.entry[0].changes[0]?.value?.messages) {
      const msgInfo = body.entry[0].changes[0].value.messages[0];
      userPhone = msgInfo.from;
      userMessage = msgInfo.text?.body || "";
    }

    // Ignore empty messages
    if (!userMessage || !userPhone) {
      return new Response("OK", { status: 200 });
    }

    console.log(`Processing message from ${userPhone}: ${userMessage}`);

    // ==========================================
    // 🧠 Cérebro Cognitivo (Gemini + Tools)
    // ==========================================
    const systemInstruction = `
Você é o assistente virtual do AgendaAi, um sistema autônomo de agendamentos.
Seja extremamente amigável, conciso (mensagens curtas para WhatsApp) e prestativo.
Seu objetivo é ajudar o cliente a agendar serviços no estabelecimento.
1. Sempre verifique os serviços disponíveis antes de oferecer.
2. Use a ferramenta check_availability para buscar horários livres.
3. Não invente horários. Só confirme se houver disponibilidade no banco.
`;

    const functionDeclarations = [
      {
        name: "get_services",
        description: "Retorna a lista de serviços oferecidos pelo estabelecimento com preços e durações.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "check_availability",
        description: "Verifica horários disponíveis para um determinado serviço e data. Retorna um array de horários livres.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "Data no formato YYYY-MM-DD" },
            service_name: { type: "STRING", description: "Nome aproximado do serviço desejado" }
          },
          required: ["date"]
        }
      }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userMessage,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ functionDeclarations }],
        temperature: 0.2,
      }
    });

    let replyText = "";
    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      console.log("Gemini requested function:", call.name, call.args);
      
      let toolResult = {};

      if (call.name === "get_services") {
        const { data, error } = await supabaseAdmin
          .from("servicos")
          .select("id, nome, preco, duracao_minutos");
          
        toolResult = error ? { error: error.message } : { services: data };
      } 
      else if (call.name === "check_availability") {
        toolResult = { 
          date: call.args.date,
          available_slots: ["09:00", "10:30", "14:00", "15:30", "18:00"]
        };
      }

      const followUpResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: "user", parts: [{ text: userMessage }] },
          { role: "model", parts: [{ functionCall: call }] },
          { role: "function", parts: [{ functionResponse: { name: call.name, response: toolResult } }] }
        ],
        config: { systemInstruction: systemInstruction }
      });

      replyText = followUpResponse.text || "Desculpe, tive um problema ao verificar as informações.";
    } else {
      replyText = response.text || "Não entendi, pode repetir?";
    }

    console.log("Gemini Output:", replyText);

    // ==========================================
    // 🚀 Disparo da Mensagem de Volta (API do WhatsApp)
    // ==========================================
    if (isEvolutionAPI && Deno.env.get("EVOLUTION_API_URL")) {
      const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
      const evolutionInstance = Deno.env.get("EVOLUTION_INSTANCE");
      const evolutionApikey = Deno.env.get("EVOLUTION_API_KEY");
      
      await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApikey || ""
        },
        body: JSON.stringify({
          number: userPhone,
          text: replyText
        })
      });
    } else if (Deno.env.get("WHATSAPP_TOKEN")) {
      const metaToken = Deno.env.get("WHATSAPP_TOKEN");
      const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
      
      await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${metaToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: userPhone,
          type: "text",
          text: { body: replyText }
        })
      });
    }

    return new Response("OK", { status: 200 });
    
  } catch (err: any) {
    console.error("Error processing webhook:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
