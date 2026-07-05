import * as fs from 'fs';

const filePath = '/Users/joaopaulo/Documents/agendaAI/src/app/layouts/admin-layout/admin-layout.css';
let code = fs.readFileSync(filePath, 'utf-8');

// Update .ag-sidebar background
code = code.replace(
  /\.ag-sidebar \{[\s\S]*?background:[\s\S]*?\}/,
  `.ag-sidebar {
  width: var(--sidebar-width);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  border-right: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 40;
}`
);

// Topbar is already using var(--glass-bg), which is now rgba(255, 255, 255, 0.85) from light.css, so it should be fine.

fs.writeFileSync(filePath, code);
console.log("Admin layout CSS patched.");
