import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/pages/admin-chatbots/admin-chatbots.ts';
let code = fs.readFileSync(filePath, 'utf-8');

const observables = `
  aiIntents$ = this.chatService.aiIntents$;
  toastNotifications$ = this.chatService.toastNotifications$;
  aiActiveConversationsCount = 0;
  toastMessage: { message: string, type: string } | null = null;
`;

code = code.replace(
  /connectedChannels\$ = this\.chatService\.connectedChannels\$;/,
  "connectedChannels$ = this.chatService.connectedChannels$;\n" + observables
);

const onInitLogic = `
    // Listen to Intents to calculate active count
    this.aiIntents$.subscribe(intents => {
      this.aiActiveConversationsCount = Object.keys(intents).length;
    });

    // Listen to Toast Notifications
    this.toastNotifications$.subscribe(toast => {
      this.toastMessage = toast;
      setTimeout(() => {
        if (this.toastMessage === toast) {
          this.toastMessage = null;
        }
      }, 5000);
    });
`;

code = code.replace(
  /this\.chatService\.loadConnectedChannels\(\);/,
  "this.chatService.loadConnectedChannels();\n" + onInitLogic
);

fs.writeFileSync(filePath, code);
console.log("admin-chatbots.ts patched.");
