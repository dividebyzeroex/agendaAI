import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/pages/admin-chatbots/admin-chatbots.html';
let code = fs.readFileSync(filePath, 'utf-8');

const typingHtml = `
            <!-- Typing Indicator -->
            <div class="typing-indicator-wrap" *ngIf="(chatbotService.typingStates$ | async)?.[conversation.id] as typingState">
               <div class="typing-bubble">
                 <span class="typing-name">{{ typingState.name }} está digitando</span>
                 <div class="typing-dots">
                   <span></span><span></span><span></span>
                 </div>
               </div>
            </div>
`;

// Insert the typing indicator right before the end of the scrollable conversation area
code = code.replace(
  /<\/div>\s*<!-- Composer -->/,
  `${typingHtml}\n          </div>\n          <!-- Composer -->`
);

fs.writeFileSync(filePath, code);
console.log("Chatbots HTML patched with typing indicators.");
