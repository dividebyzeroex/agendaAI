import * as fs from 'fs';

const htmlPath = '/Users/joaopaulo/Documents/agendaAI/src/app/layouts/admin-layout/admin-layout.html';
let htmlCode = fs.readFileSync(htmlPath, 'utf-8');

// Remove the theme-selector-wrap block
const themeSelectorRegex = /<!-- Theme Switcher -->[\s\S]*?<\/div>\s*<!-- LIVE CREW/;
htmlCode = htmlCode.replace(themeSelectorRegex, '<!-- LIVE CREW');
fs.writeFileSync(htmlPath, htmlCode);

const tsPath = '/Users/joaopaulo/Documents/agendaAI/src/app/layouts/admin-layout/admin-layout.ts';
let tsCode = fs.readFileSync(tsPath, 'utf-8');

// Remove ThemeService injection and methods
tsCode = tsCode.replace(/import \{ ThemeService \} from '..\/..\/services\/theme.service';\n/, '');
tsCode = tsCode.replace(/public theme = inject\(ThemeService\);\n/, '');
tsCode = tsCode.replace(/setTheme\(mode: string\) \{\n\s*this.theme.setTheme\(mode\);\n\s*\}\n/, '');

fs.writeFileSync(tsPath, tsCode);
console.log("Admin layout patched.");
