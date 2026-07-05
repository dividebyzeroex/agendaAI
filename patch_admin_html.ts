import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/pages/admin-chatbots/admin-chatbots.html';
let code = fs.readFileSync(filePath, 'utf-8');

const toastHtml = `
  <!-- TOAST NOTIFICATION -->
  <div class="toast-container" *ngIf="toastMessage">
    <div class="toast-glass" [ngClass]="toastMessage.type">
      {{ toastMessage.message }}
    </div>
  </div>
`;

code = code.replace(
  /<div class="ag-page elite chatbots">/,
  '<div class="ag-page elite chatbots">\n' + toastHtml
);

const headerAiCounter = `
      <div class="stat-card" *ngIf="aiActiveConversationsCount > 0">
        <div class="stat-value" style="color: #6366f1">
          🤖 {{ aiActiveConversationsCount }} Conversas com IA
        </div>
        <div class="stat-label">A inteligência artificial está operando ativamente.</div>
      </div>
`;

code = code.replace(
  /<div class="stat-card" \*ngIf="connectedChannels\$ \| async as channels">/,
  headerAiCounter + '\n      <div class="stat-card" *ngIf="connectedChannels$ | async as channels">'
);

const intentBadge = `
            <div class="ai-intent-badge" *ngIf="(aiIntents$ | async)?.[conv.id]">
              {{ (aiIntents$ | async)?.[conv.id] }}
            </div>
`;

code = code.replace(
  /<span class="time">{{ conv\.lastUpdate \| date:'HH:mm' }}<\/span>/,
  '<span class="time">{{ conv.lastUpdate | date:\'HH:mm\' }}</span>\n' + intentBadge
);

fs.writeFileSync(filePath, code);
console.log("admin-chatbots.html patched.");
