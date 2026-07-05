import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/supabase/functions/zernio-webhook/index.ts';
let code = fs.readFileSync(filePath, 'utf-8');

const typingEventCode = `
    // Broadcast bot is typing
    await supabaseAdmin.channel('zernio_messages').send({
      type: 'broadcast', event: 'bot_typing',
      payload: { channelId, userPhone, isTyping: true, name: robotName }
    });
`;

code = code.replace(
  /console\.log\("Chamando Gemini API\.\.\."\);/,
  `console.log("Chamando Gemini API...");\n${typingEventCode}`
);

fs.writeFileSync(filePath, code);
console.log("Webhook patched with bot_typing event.");
