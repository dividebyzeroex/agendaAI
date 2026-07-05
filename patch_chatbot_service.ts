import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/services/chatbot.service.ts';
let code = fs.readFileSync(filePath, 'utf-8');

// Replace local toast subject
code = code.replace(
  /private toastNotificationsSubject.*?\n.*toastNotifications\$.*?\n/,
  ''
);

// Add NotificationService import
code = code.replace(
  /import { SupabaseService } from '.\/supabase.service';/,
  "import { SupabaseService } from './supabase.service';\nimport { NotificationService } from './notification.service';"
);

// Inject NotificationService
code = code.replace(
  /private supabase = inject\(SupabaseService\);/,
  "private supabase = inject(SupabaseService);\n  private notifService = inject(NotificationService);"
);

// Replace broadcast intent logic
const oldBroadcastLogic = /if \(intent\.includes\('Agendado'\) \|\| intent\.includes\('Venda'\)\) \{[\s\S]*?\}, 5000\);\n\s*\}/;
const newBroadcastLogic = `if (intent.includes('Agendado') || intent.includes('Venda')) {
               this.notifService.showToast({
                  type: 'AI_INSIGHT',
                  title: 'Ação do Assistente',
                  message: \`🤖 IA detectou: \${intent}\`,
                  icon: 'pi pi-sparkles'
               });
               setTimeout(() => {
                  const intentsAfter = this.aiIntentsSubject.getValue();
                  const newIntents = { ...intentsAfter };
                  delete newIntents[userPhone];
                  this.aiIntentsSubject.next(newIntents);
               }, 5000);
            }`;

code = code.replace(oldBroadcastLogic, newBroadcastLogic);

fs.writeFileSync(filePath, code);
console.log("chatbot.service.ts patched.");
