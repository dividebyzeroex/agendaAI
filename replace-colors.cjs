const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('./src', function(filePath) {
  if (filePath.endsWith('.css')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Replacements
    content = content.replace(/#0f172a/gi, 'var(--text-main)');
    content = content.replace(/#1e293b/gi, 'var(--text-main)');
    content = content.replace(/#64748b/gi, 'var(--text-muted)');
    content = content.replace(/#f8fafc/gi, 'var(--bg-color)');
    content = content.replace(/#f1f5f9/gi, 'var(--glass-border)');
    content = content.replace(/#e2e8f0/gi, 'var(--glass-border)');
    // Be careful with replacing 'white' as it might be used in text
    content = content.replace(/background:\s*white/gi, 'background: var(--glass-bg)');
    content = content.replace(/background-color:\s*white/gi, 'background-color: var(--glass-bg)');
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated: ' + filePath);
    }
  }
});
