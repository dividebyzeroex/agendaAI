export interface CsvClient {nome:string;telefone:string;email:string;observacoes:string;}
export interface CsvPreview {rows:CsvClient[];errors:string[];}
export function parseClientCsv(source:string):CsvPreview {
 if(source.length>2_000_000)return {rows:[],errors:['Arquivo maior que 2 MB. Divida a importação.']};
 const text=source.replace(/^\uFEFF/,'');const headerLine=text.split(/\r?\n/)[0]||'';
 const delimiter=(headerLine.match(/;/g)||[]).length>(headerLine.match(/,/g)||[]).length?';':',';
 const matrix:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
 else if(char===delimiter&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))matrix.push(row);row=[];cell='';}else cell+=char;}
 row.push(cell);if(row.some(x=>x.trim()))matrix.push(row);
 if(quoted)return {rows:[],errors:['Há aspas abertas sem fechamento. Confira o arquivo CSV.']};
 if(matrix.length<2)return {rows:[],errors:['Inclua um cabeçalho e ao menos um cliente.']};
 const normalize=(s:string)=>s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]/g,'');
 const headers=matrix[0].map(normalize);const find=(names:string[])=>headers.findIndex(h=>names.includes(h));
 const name=find(['nome','cliente','tutor','nomecompleto']);const phone=find(['telefone','celular','whatsapp']);const email=find(['email']);const notes=find(['observacoes','notas']);
 if(name<0||(phone<0&&email<0))return {rows:[],errors:['Use as colunas nome, telefone e/ou email. observacoes é opcional.']};
 if(matrix.length>501)return {rows:[],errors:['Limite de 500 clientes por arquivo. Divida em lotes.']};
 const errors:string[]=[];const rows:CsvClient[]=[];
 for(let i=1;i<matrix.length;i++){const r=matrix[i];const item={nome:r[name]?.trim()||'',telefone:(r[phone]||'').replace(/\D/g,''),email:r[email]?.trim().toLowerCase()||'',observacoes:r[notes]?.trim()||''};
 if(item.nome.length<2||item.nome.length>160||(!item.telefone&&!item.email)||(item.telefone&&(item.telefone.length<10||item.telefone.length>15))||(item.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email))){errors.push(`Linha ${i+1}: confira nome e pelo menos um contato válido.`);continue;}
 rows.push(item);}
 return {rows,errors};
}
