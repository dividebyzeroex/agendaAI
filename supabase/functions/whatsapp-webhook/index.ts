import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.40.0";
import { GoogleGenAI } from "npm:@google/genai";

const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

console.log("WhatsApp Webhook Function Starting...");

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verificação Meta Webhook
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
    let targetPhoneId = ""; 
    let channel = "whatsapp";

    // Detect Meta WhatsApp Cloud API Format
    if (body.entry && body.entry[0]?.changes && body.entry[0].changes[0]?.value?.messages) {
      const msgInfo = body.entry[0].changes[0].value.messages[0];
      userPhone = msgInfo.from;
      userMessage = msgInfo.text?.body || "";
      targetPhoneId = body.entry[0].changes[0].value.metadata?.phone_number_id || "";
    }

    if (!userMessage || !userPhone || !targetPhoneId) {
      return new Response("OK", { status: 200 }); // Ignora status e erros
    }

    // 2. Identificar Estabelecimento pela Integração
    const { data: integrations } = await supabaseAdmin
      .from("chatbot_integrations")
      .select("estabelecimento_id, config")
      .eq("channel", "whatsapp")
      .eq("status", "active");

    let estabelecimentoId = null;
    if (integrations) {
      for (const intg of integrations) {
        if (intg.config && intg.config.phoneId === targetPhoneId) {
          estabelecimentoId = intg.estabelecimento_id;
          break;
        }
      }
    }

    if (!estabelecimentoId && integrations && integrations.length > 0) {
      estabelecimentoId = integrations[0].estabelecimento_id;
      console.log("Fallback: usando a primeira integração encontrada");
    }

    if (!estabelecimentoId) {
      console.log("Nenhum estabelecimento ativo encontrado para este webhook.");
      return new Response("OK", { status: 200 });
    }

    // 3. Carregar a Persona (Alma do Robô)
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

    // 4. Salvar Mensagem do Usuário na Memória
    await supabaseAdmin.from("chatbot_messages").insert({
      estabelecimento_id: estabelecimentoId,
      customer_phone: userPhone,
      sender: "user",
      message: userMessage,
      channel: channel
    });

    // 5. Carregar Histórico de Conversa (Memória de Curto Prazo)
    const { data: history } = await supabaseAdmin
      .from("chatbot_messages")
      .select("*")
      .eq("estabelecimento_id", estabelecimentoId)
      .eq("customer_phone", userPhone)
      .order("created_at", { ascending: true })
      .limit(15); 

    const geminiHistory = (history || []).map(msg => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.message }]
    }));
    
    const currentMessage = geminiHistory.pop() || { role: "user", parts: [{ text: userMessage }] };

    // 6. Configurar o Gemini com Tools
    const systemInstruction = `
Você é ${robotName}, atuando como ${robotRole}.
Seu tom de voz é: ${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços no estabelecimento.
Regras Cruciais (Opção B - Confirmação Obrigatória):
1. Sempre verifique os serviços disponíveis (get_services) antes de oferecer.
2. Verifique horários livres (check_availability).
3. ANTES de criar o agendamento no sistema, você DEVE mostrar um "Resumo" para o cliente confirmar.
   Exemplo: "Fica então Corte de Cabelo para amanhã às 15h, certo?"
4. APENAS se o cliente responder "Sim", "Certo", "Confirmo", aí sim você chama a ferramenta create_appointment.
5. Seja conciso, responda em mensagens curtas ideais para WhatsApp.
`;

    const functionDeclarations = [
      {
        name: "get_services",
        description: "Retorna a lista de serviços oferecidos pelo estabelecimento.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "check_availability",
        description: "Verifica horários disponíveis para uma data.",
        parameters: {
          type: "OBJECT",
          properties: { date: { type: "STRING", description: "Data no formato YYYY-MM-DD" } },
          required: ["date"]
        }
      },
      {
        name: "create_appointment",
        description: "Agenda o serviço DEFINITIVAMENTE. Só chame APÓS o cliente confirmar o resumo.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: { type: "STRING", description: "Data YYYY-MM-DD" },
            time: { type: "STRING", description: "Horário HH:MM" },
            service_name: { type: "STRING", description: "Nome do serviço" },
            customer_name: { type: "STRING", description: "Nome do cliente (pergunte se não souber)" }
          },
          required: ["date", "time", "service_name", "customer_name"]
        }
      }
    ];

    let chat = null;
    let response = null;

    try {
      chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        history: geminiHistory,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations }],
          temperature: 0.2,
        }
      });
      response = await chat.sendMessage({ parts: currentMessage.parts });
    } catch(e) {
       console.log("Erro ao iniciar chat com gemini", e);
       response = await ai.models.generateContent({
         model: 'gemini-2.5-flash',
         contents: userMessage,
         config: { systemInstruction, tools: [{ functionDeclarations }] }
       });
    }

    let replyText = "";
    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      console.log("Gemini requested function:", call.name, call.args);
      let toolResult = {};

      if (call.name === "get_services") {
        const { data, error } = await supabaseAdmin.from("servicos").select("nome, preco").eq("estabelecimento_id", estabelecimentoId);
        toolResult = error ? { error: error.message } : { services: data };
      } 
      else if (call.name === "check_availability") {
        toolResult = { date: call.args.date, available_slots: ["09:00", "10:00", "14:30", "16:00"] };
      }
      else if (call.name === "create_appointment") {
        const { data: srvs } = await supabaseAdmin.from("servicos").select("id").eq("estabelecimento_id", estabelecimentoId).ilike("nome", `%${call.args.service_name}%`).limit(1);
        const srvId = (srvs && srvs.length > 0) ? srvs[0].id : null;

        const { data, error } = await supabaseAdmin.from("agenda_events").insert({
          estabelecimento_id: estabelecimentoId,
          start_time: `${call.args.date}T${call.args.time}:00`,
          end_time: `${call.args.date}T${call.args.time}:00`,
          title: `Agendamento via IA - ${call.args.customer_name}`,
          status: 'confirmado',
          servico_id: srvId
        });
        toolResult = error ? { success: false, error: error.message } : { success: true, message: "Agendado no banco de dados com sucesso!" };
      }

      const followUpResponse = await chat!.sendMessage({
         parts: [{ functionResponse: { name: call.name, response: toolResult } }]
      });
      replyText = followUpResponse.text || "Desculpe, tive um problema ao verificar as informações.";
    } else {
      replyText = response.text || "Não entendi, pode repetir?";
    }

    console.log("Gemini Output:", replyText);

    // 7. Salvar Mensagem da IA na Memória
    await supabaseAdmin.from("chatbot_messages").insert({
      estabelecimento_id: estabelecimentoId,
      customer_phone: userPhone,
      sender: "bot",
      message: replyText,
      channel: channel
    });

    // 8. Disparo da Mensagem de Volta via WhatsApp
    if (Deno.env.get("WHATSAPP_TOKEN")) {
      const metaToken = Deno.env.get("WHATSAPP_TOKEN");
      const phoneId = targetPhoneId || Deno.env.get("WHATSAPP_PHONE_ID"); 
      
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
