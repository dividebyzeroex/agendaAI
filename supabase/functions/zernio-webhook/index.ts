import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import { GoogleGenAI } from "npm:@google/genai";

const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const zernioApiKey = Deno.env.get("ZERNIO_API_KEY") || "MOCK_ZERNIO_API_KEY";

console.log("Zernio Webhook Function Starting...");

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log("Received Zernio Webhook:", JSON.stringify(body, null, 2));

    if (body.event !== "message.received" || !body.data) {
       return new Response("Event ignored", { status: 200 });
    }

    const channelId = body.data.channel_id; // Identificador da subconta/canal no Zernio
    const userPhone = body.data.contact?.id; // ID do contato no whatsapp/insta
    const userMessage = body.data.message?.text;

    if (!userMessage || !userPhone || !channelId) {
      return new Response("Missing required fields", { status: 200 });
    }

    // Identificar Estabelecimento usando o channelId do Zernio
    const { data: integrations } = await supabaseAdmin
      .from("chatbot_integrations")
      .select("estabelecimento_id, channel, config")
      .eq("status", "active")
      .contains("config", { zernio_channel_id: channelId });

    let estabelecimentoId = null;
    let integrationChannel = "whatsapp";

    if (integrations && integrations.length > 0) {
      estabelecimentoId = integrations[0].estabelecimento_id;
      integrationChannel = integrations[0].channel;
    } else {
      console.log(\`Nenhuma integração encontrada para Zernio Channel ID: \${channelId}\`);
      // Fallback para dev local se n achar
      const { data: all } = await supabaseAdmin.from("chatbot_integrations").select("estabelecimento_id, channel").limit(1);
      if (all && all.length > 0) {
         estabelecimentoId = all[0].estabelecimento_id;
         integrationChannel = all[0].channel;
         console.log("Usando fallback de fallback", estabelecimentoId);
      } else {
         return new Response("OK", { status: 200 });
      }
    }

    // Carregar a Persona (Alma do Robô)
    const { data: robots } = await supabaseAdmin
      .from("chatbot_robots")
      .select("*")
      .eq("estabelecimento_id", estabelecimentoId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    const robot = (robots && robots.length > 0) ? robots[0] : null;
    const robotName = robot ? robot.name : "Assistente";
    const robotTone = robot ? robot.tone : "Amigável e profissional";
    const robotRole = robot ? robot.role : "Agendador";

    // Salvar Mensagem do Usuário na Memória
    await supabaseAdmin.from("chatbot_messages").insert({
      estabelecimento_id: estabelecimentoId,
      customer_phone: userPhone,
      sender: "user",
      message: userMessage,
      channel: integrationChannel
    });

    // Carregar Histórico de Conversa
    const { data: history } = await supabaseAdmin
      .from("chatbot_messages")
      .select("*")
      .eq("estabelecimento_id", estabelecimentoId)
      .eq("customer_phone", userPhone)
      .order("created_at", { ascending: true })
      .limit(15); 

    const geminiHistory = (history || []).map((msg: any) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.message }]
    }));
    
    const currentMessage = geminiHistory.pop() || { role: "user", parts: [{ text: userMessage }] };

    // Configurar o Gemini
    const systemInstruction = \`
Você é \${robotName}, atuando como \${robotRole}.
Seu tom de voz é: \${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços. Responda de forma concisa e natural.
    \`;

    const functionDeclarations = [
      { name: "get_services", description: "Retorna a lista de serviços oferecidos.", parameters: { type: "OBJECT", properties: {} } },
      { name: "check_availability", description: "Verifica horários disponíveis.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "Data YYYY-MM-DD" } }, required: ["date"] } },
      { name: "create_appointment", description: "Agenda o serviço.", parameters: { type: "OBJECT", properties: { date: { type: "STRING" }, time: { type: "STRING" }, service_id: { type: "STRING" }, client_name: { type: "STRING" }, client_phone: { type: "STRING" } }, required: ["date", "time", "service_id", "client_name"] } }
    ];

    console.log("Chamando Gemini API...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [...geminiHistory, currentMessage],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
        tools: [{ functionDeclarations }],
      }
    });

    let botResponseText = "";
    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      console.log("Gemini chamou a function:", call.name, call.args);
      let functionResult = {};

      if (call.name === "get_services") {
         functionResult = { services: [{ id: "1", name: "Corte de Cabelo", price: 35 }, { id: "2", name: "Barba", price: 25 }] };
      } else if (call.name === "check_availability") {
         functionResult = { date: call.args.date, available_times: ["09:00", "10:30", "14:00", "16:00"] };
      } else if (call.name === "create_appointment") {
         const { data: serv } = await supabaseAdmin.from("agenda_events").insert({
            title: \`Agendamento - \${call.args.client_name}\`,
            date: call.args.date,
            time: call.args.time,
            type: "service",
            status: "scheduled",
            estabelecimento_id: estabelecimentoId
         }).select();
         functionResult = { success: true, event: serv ? serv[0] : null };
      }

      const followupResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...geminiHistory,
          currentMessage,
          { role: 'model', parts: [{ functionCall: call }] },
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: functionResult } }] }
        ],
        config: { systemInstruction, temperature: 0.2, tools: [{ functionDeclarations }] }
      });

      botResponseText = followupResponse.text || "Entendido.";
    } else {
      botResponseText = response.text || "Desculpe, não entendi.";
    }

    console.log("Gemini Response:", botResponseText);

    // Salvar Resposta do Bot
    await supabaseAdmin.from("chatbot_messages").insert({
      estabelecimento_id: estabelecimentoId,
      customer_phone: userPhone,
      sender: "bot",
      message: botResponseText,
      channel: integrationChannel
    });

    // Enviar mensagem via Zernio API (Usando Master Key)
    console.log("Enviando mensagem de volta via Zernio API...");
    try {
      const zernioReq = await fetch('https://zernio.com/api/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': \`Bearer \${zernioApiKey}\`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel_id: channelId,
          to: userPhone,
          message: { text: botResponseText }
        })
      });
      const zRes = await zernioReq.json().catch(() => ({}));
      console.log("Zernio Response:", zRes);
    } catch(err) {
      console.error("Erro chamando Zernio:", err);
    }

    return new Response("OK", { status: 200 });

  } catch (err: any) {
    console.error("Webhook Zernio Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
