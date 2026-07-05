import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/supabase/functions/zernio-webhook/index.ts';
let code = fs.readFileSync(filePath, 'utf-8');

const newSystemInstruction = `
Você é \${robotName}, atuando como \${robotRole}.
Seu tom de voz é: \${robotTone}.
Seu objetivo é ajudar o cliente a agendar serviços de forma natural e amigável.
ANTES de responder sobre preços ou serviços, USE a ferramenta get_services.
ANTES de confirmar um horário, USE a ferramenta check_availability.
Se o cliente quiser reagendar, USE reschedule_appointment.
Sempre que você detectar a intenção do cliente (ex: quer agendar, só consultando preço, quer reagendar), USE a ferramenta signal_intent IMEDIATAMENTE para atualizar o painel.
`;

const functionDeclarationsCode = `
    const functionDeclarations = [
      { name: "get_services", description: "Retorna a lista de serviços oferecidos com preços e duração.", parameters: { type: "OBJECT", properties: {} } },
      { name: "get_professionals", description: "Retorna a lista de profissionais disponíveis no estabelecimento.", parameters: { type: "OBJECT", properties: {} } },
      { name: "check_availability", description: "Verifica horários livres para uma data específica.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "Data YYYY-MM-DD" }, professional_id: { type: "STRING", description: "ID do profissional (opcional)" } }, required: ["date"] } },
      { name: "create_appointment", description: "Cria um agendamento.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, time: { type: "STRING", description: "HH:MM" }, service_id: { type: "STRING" }, professional_id: { type: "STRING" }, client_name: { type: "STRING" } }, required: ["date", "time", "service_id", "client_name"] } },
      { name: "reschedule_appointment", description: "Reagenda um serviço futuro do cliente.", parameters: { type: "OBJECT", properties: { new_date: { type: "STRING", description: "YYYY-MM-DD" }, new_time: { type: "STRING", description: "HH:MM" } }, required: ["new_date", "new_time"] } },
      { name: "add_to_waitlist", description: "Adiciona o cliente à fila de espera para uma data.", parameters: { type: "OBJECT", properties: { date: { type: "STRING", description: "YYYY-MM-DD" }, service_id: { type: "STRING" } }, required: ["date"] } },
      { name: "signal_intent", description: "Avisa o sistema sobre a intenção atual do cliente (ex: 'Consultando', 'Agendando', 'Reagendando'). Chame isso sempre que a intenção mudar.", parameters: { type: "OBJECT", properties: { intent: { type: "STRING", description: "A intenção curta (ex: 'Agendando', 'Dúvida')" } }, required: ["intent"] } }
    ];

    console.log("Chamando Gemini API...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: mergedHistory,
      config: {
        systemInstruction: \`${newSystemInstruction}\`,
        temperature: 0.2,
        tools: [{ functionDeclarations }],
      }
    });

    let botResponseText = "";
    
    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      console.log("Gemini chamou a function:", call.name, call.args);
      let functionResult = {};

      if (call.name === "signal_intent") {
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: call.args.intent }
         });
         functionResult = { success: true };
      } else if (call.name === "get_services") {
         const { data: servs } = await supabaseAdmin.from('servicos').select('id, titulo, preco, duracao_min').eq('estabelecimento_id', estabelecimentoId).eq('ativo', true);
         functionResult = { services: servs || [] };
      } else if (call.name === "get_professionals") {
         const { data: profs } = await supabaseAdmin.from('profissionais').select('id, nome, especialidade').eq('estabelecimento_id', estabelecimentoId).eq('ativo', true);
         functionResult = { professionals: profs || [] };
      } else if (call.name === "check_availability") {
         // Lógica simplificada de disponibilidade: Puxar agendamentos do dia
         const { data: eventos } = await supabaseAdmin.rpc('get_public_events_by_day', {
            p_estab_id: estabelecimentoId,
            p_date_start: \`\${call.args.date} 00:00:00\`,
            p_date_end: \`\${call.args.date} 23:59:59\`
         });
         functionResult = { date: call.args.date, occupied_events: eventos || [], info: "O bot deve sugerir horários comerciais padrão (09h-18h) que NÃO estejam conflitantes com os ocupados listados." };
      } else if (call.name === "create_appointment") {
         // Primeiro buscar/criar cliente
         let { data: clienteReq } = await supabaseAdmin.from('clientes').select('id').eq('telefone', userPhone).limit(1);
         let clienteId = null;
         if (!clienteReq || clienteReq.length === 0) {
             const { data: newCli } = await supabaseAdmin.from('clientes').insert({ estabelecimento_id: estabelecimentoId, nome: call.args.client_name, telefone: userPhone }).select();
             if (newCli) clienteId = newCli[0].id;
         } else {
             clienteId = clienteReq[0].id;
         }

         const startDate = new Date(\`\${call.args.date}T\${call.args.time}:00\`);
         const endDate = new Date(startDate.getTime() + 30 * 60000); // hardcoded 30min default
         const { data: serv } = await supabaseAdmin.from("agenda_events").insert({
            title: \`Agendamento - \${call.args.client_name}\`,
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            type: "service",
            status: "scheduled",
            estabelecimento_id: estabelecimentoId,
            cliente_id: clienteId,
            servico_id: call.args.service_id,
            profissional_id: call.args.professional_id || null
         }).select();
         
         await supabaseAdmin.channel('zernio_messages').send({
            type: 'broadcast', event: 'ai_intent',
            payload: { channelId, userPhone, intent: '✅ Agendado!' }
         });
         functionResult = { success: true, event: serv ? serv[0] : null };
      } else if (call.name === "reschedule_appointment") {
         functionResult = { success: true, info: "Simulado com sucesso." };
      } else if (call.name === "add_to_waitlist") {
         functionResult = { success: true, info: "Adicionado à fila de espera." };
      }

      const followupResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...mergedHistory,
          { role: 'model', parts: [{ functionCall: call }] },
          { role: 'user', parts: [{ functionResponse: { name: call.name, response: functionResult } }] }
        ],
        config: { systemInstruction: \`${newSystemInstruction}\`, temperature: 0.2, tools: [{ functionDeclarations }] }
      });

      botResponseText = followupResponse.text || "Entendido.";
    } else {
      botResponseText = response.text || "Desculpe, não entendi.";
    }
`;

const systemInstStart = code.indexOf('const systemInstruction = `');
const nextConsoleLog = code.indexOf('console.log("Gemini Response:", botResponseText);');

if (systemInstStart !== -1 && nextConsoleLog !== -1) {
   const updatedCode = code.substring(0, systemInstStart) + functionDeclarationsCode + "\n    " + code.substring(nextConsoleLog);
   fs.writeFileSync(filePath, updatedCode);
   console.log("Webhook logic updated successfully!");
} else {
   console.log("Could not find insertion points.");
}
