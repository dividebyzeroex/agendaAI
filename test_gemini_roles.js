const history = [
  { role: 'user', text: 'Oi' },
  { role: 'user', text: 'Tudo bem?' },
  { role: 'model', text: 'Olá' },
  { role: 'model', text: 'Como posso ajudar?' },
  { role: 'user', text: 'Sim' }
];

const merged = [];
for (const msg of history) {
  if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
    merged[merged.length - 1].text += "\n" + msg.text;
  } else {
    merged.push({ role: msg.role, text: msg.text });
  }
}
console.log(merged);
