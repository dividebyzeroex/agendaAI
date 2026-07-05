import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/layouts/admin-layout/admin-layout.ts';
let code = fs.readFileSync(filePath, 'utf-8');

// Add import if not present
if (!code.includes('ChatbotService')) {
  code = code.replace(
    /import \{ NotificationService \} from '..\/..\/services\/notification.service';/,
    "import { NotificationService } from '../../services/notification.service';\nimport { ChatbotService } from '../../services/chatbot.service';"
  );
  
  // Add injection
  code = code.replace(
    /notifService = inject\(NotificationService\);/,
    "notifService = inject(NotificationService);\n  chatbotService = inject(ChatbotService);"
  );
  
  fs.writeFileSync(filePath, code);
  console.log("AdminLayout patched with ChatbotService.");
} else {
  console.log("ChatbotService already injected.");
}
