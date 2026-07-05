import * as fs from 'fs';

const htmlPath = '/Users/joaopaulo/Documents/agendaAI/src/app/pages/admin-chatbots/admin-chatbots.html';
let htmlCode = fs.readFileSync(htmlPath, 'utf-8');

// Remove local toast HTML
htmlCode = htmlCode.replace(
  /<!-- TOAST NOTIFICATION -->[\s\S]*?<\/div>\s*<\/div>/,
  ''
);
fs.writeFileSync(htmlPath, htmlCode);

const tsPath = '/Users/joaopaulo/Documents/agendaAI/src/app/pages/admin-chatbots/admin-chatbots.ts';
let tsCode = fs.readFileSync(tsPath, 'utf-8');

// Remove local toast properties
tsCode = tsCode.replace(
  /toastNotifications\$ = this\.chatService\.toastNotifications\$;\n/,
  ''
);
tsCode = tsCode.replace(
  /toastMessage: \{ message: string, type: string \} \| null = null;\n/,
  ''
);

// Remove local toast logic in ngOnInit
const toastLogic = `    // Listen to Toast Notifications
    this.toastNotifications$.subscribe(toast => {
      this.toastMessage = toast;
      setTimeout(() => {
        if (this.toastMessage === toast) {
          this.toastMessage = null;
        }
      }, 5000);
    });`;
tsCode = tsCode.replace(toastLogic, '');

fs.writeFileSync(tsPath, tsCode);

const cssPath = '/Users/joaopaulo/Documents/agendaAI/src/app/pages/admin-chatbots/admin-chatbots.css';
let cssCode = fs.readFileSync(cssPath, 'utf-8');
cssCode = cssCode.replace(/\/\* Toast Container \*\/[\s\S]*$/, '');
fs.writeFileSync(cssPath, cssCode);

console.log("admin-chatbots cleaned up.");
