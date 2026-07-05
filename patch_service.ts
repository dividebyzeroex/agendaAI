import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/services/chatbot.service.ts';
let code = fs.readFileSync(filePath, 'utf-8');

const subjectDeclarations = `
  private conversationsSubject = new BehaviorSubject<Conversation[]>([]);
  conversations$ = this.conversationsSubject.asObservable();

  private aiIntentsSubject = new BehaviorSubject<{ [conversationId: string]: string }>({});
  aiIntents$ = this.aiIntentsSubject.asObservable();
  
  private toastNotificationsSubject = new Subject<{ message: string, type: 'success' | 'info' }>();
  toastNotifications$ = this.toastNotificationsSubject.asObservable();
`;

code = code.replace(
  /private conversationsSubject = new BehaviorSubject<Conversation\[\]>\(\[\]\);\n\s*conversations\$ = this.conversationsSubject.asObservable\(\);/,
  subjectDeclarations
);

const broadcastHandler = `
      .on('broadcast', { event: 'new_message' }, payload => {
         console.log("Recebido broadcast do zernio:", payload);
         this.loadConversations();
         const activeId = this.activeConversationSubject.getValue()?.id;
         if (activeId && payload['payload']?.userPhone === activeId) {
            this.setActiveConversation(activeId);
         }
      })
      .on('broadcast', { event: 'ai_intent' }, payload => {
         console.log("Intent da IA recebido:", payload);
         const { userPhone, intent } = payload['payload'] || {};
         if (userPhone && intent) {
            const currentIntents = this.aiIntentsSubject.getValue();
            this.aiIntentsSubject.next({ ...currentIntents, [userPhone]: intent });
            
            if (intent.includes('Agendado') || intent.includes('Venda')) {
               this.toastNotificationsSubject.next({ message: \`🤖 IA detectou: \${intent}\`, type: 'success' });
               setTimeout(() => {
                  const intentsAfter = this.aiIntentsSubject.getValue();
                  const newIntents = { ...intentsAfter };
                  delete newIntents[userPhone];
                  this.aiIntentsSubject.next(newIntents);
               }, 5000);
            }
         }
      })
`;

code = code.replace(
  /\.on\('broadcast', { event: 'new_message' }[\s\S]*?(?=\.subscribe\(\))/m,
  broadcastHandler
);

fs.writeFileSync(filePath, code);
console.log("chatbot.service.ts patched.");
