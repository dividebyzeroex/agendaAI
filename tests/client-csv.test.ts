import {expect,it} from 'vitest';
import {parseClientCsv} from '../src/app/utils/client-csv';
it('reads Excel-style UTF-8 CSV, quoted separators and multiline notes',()=>{const p=parseClientCsv('\uFEFFnome;telefone;e-mail;observações\r\n"Ana; Maria";"(11) 99999-8888";ANA@example.test;"Prefere manhã\nRetorno em 30 dias"');expect(p.errors).toEqual([]);expect(p.rows[0]).toEqual({nome:'Ana; Maria',telefone:'11999998888',email:'ana@example.test',observacoes:'Prefere manhã\nRetorno em 30 dias'});});
it('reports malformed contacts and unfinished quotes without an importable batch',()=>{expect(parseClientCsv('nome,email\nAna,invalid').errors).toHaveLength(1);expect(parseClientCsv('nome,telefone\n"Ana,11999998888').rows).toHaveLength(0);});
it('requires contact columns and bounds batch size',()=>{expect(parseClientCsv('nome,idade\nAna,21').errors.length).toBe(1);expect(parseClientCsv('nome,email\n'+Array.from({length:501},()=> 'Ana,ana@example.test').join('\n')).rows).toHaveLength(0);});
