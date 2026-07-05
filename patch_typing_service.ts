import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/services/chatbot.service.ts';
let code = fs.readFileSync(filePath, 'utf-8');

// Add typingStates$
const subjectsRegex = /private aiIntentsSubject[\s\S]*?aiIntents\$[\s\S]*?;/;
code = code.replace(
  subjectsRegex,
  `$&
  private typingStatesSubject = new BehaviorSubject<{ [conversationId: string]: { name: string, isTyping: boolean, timestamp: number } }>({});
  typingStates$ = this.typingStatesSubject.asObservable();`
);

// Listen to bot_typing
const listenBotTyping = `
      .on('broadcast', { event: 'bot_typing' }, payload => {
         const { userPhone, isTyping, name } = payload['payload'] || {};
         if (userPhone && isTyping) {
            const current = this.typingStatesSubject.getValue();
            this.typingStatesSubject.next({ ...current, [userPhone]: { name, isTyping, timestamp: Date.now() } });
            
            // Auto clear typing state after 8 seconds (safety net if webhook fails or doesn't reply)
            setTimeout(() => {
               const after = this.typingStatesSubject.getValue();
               if (after[userPhone] && (Date.now() - after[userPhone].timestamp) >= 7000) {
                  const newState = { ...after };
                  delete newState[userPhone];
                  this.typingStatesSubject.next(newState);
               }
            }, 8000);
         }
      })
      .on('broadcast', { event: 'team_typing' }, payload => {
         const { userPhone, isTyping, name } = payload['payload'] || {};
         if (userPhone && isTyping) {
            const current = this.typingStatesSubject.getValue();
            this.typingStatesSubject.next({ ...current, [userPhone]: { name, isTyping, timestamp: Date.now() } });
            setTimeout(() => {
               const after = this.typingStatesSubject.getValue();
               if (after[userPhone] && (Date.now() - after[userPhone].timestamp) >= 4000) {
                  const newState = { ...after };
                  delete newState[userPhone];
                  this.typingStatesSubject.next(newState);
               }
            }, 5000);
         }
      })
`;

code = code.replace(
  /\.on\('broadcast', \{ event: 'ai_intent' \}[\s\S]*?\}\)[\r\n]*\s*\.subscribe\(\)/,
  `$&${listenBotTyping}`
);

// Clear typing on new message
code = code.replace(
  /this\.loadConversations\(\);/,
  `this.loadConversations();
         const tState = this.typingStatesSubject.getValue();
         if (payload['payload']?.userPhone && tState[payload['payload']?.userPhone]) {
            const newState = { ...tState };
            delete newState[payload['payload']?.userPhone];
            this.typingStatesSubject.next(newState);
         }`
);

// Add broadcastTyping() method
code = code.replace(
  /async loadConversations\(\) \{/,
  `async broadcastTyping(conversationId: string, channelId: string, operatorName: string) {
    if (!this.messageSubscription) return;
    await this.supabase.client.channel('zernio_messages').send({
      type: 'broadcast', event: 'team_typing',
      payload: { channelId, userPhone: conversationId, isTyping: true, name: operatorName }
    });
  }

  async loadConversations() {`
);

fs.writeFileSync(filePath, code);
console.log("Chatbot service patched with typing indicators.");
