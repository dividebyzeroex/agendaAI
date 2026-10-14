import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { ClienteService } from '../../services/cliente.service';
import { CsvPreview, parseClientCsv } from '../../utils/client-csv';
@Component({selector:'app-client-import',standalone:true,imports:[CommonModule],templateUrl:'./client-import.html',styleUrls:['./client-import.css']})
export class ClientImport {
 private db=inject(SupabaseService).client;private est=inject(EstabelecimentoService);private clients=inject(ClienteService);private cdr=inject(ChangeDetectorRef);
 open=false;busy=false;notice='';error='';filename='';preview:CsvPreview|null=null;
 async pick(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;this.error='';this.notice='';this.filename=file.name;this.preview=null;if(file.size>2_000_000){this.error='Limite de 2 MB por arquivo.';return;}try{this.preview=parseClientCsv(await file.text());}catch{this.error='Não foi possível ler o CSV. Exporte em UTF-8 e tente novamente.';}finally{this.cdr.markForCheck();}}
 async save(){if(this.busy||!this.preview?.rows.length||this.preview.errors.length)return;const id=this.est.estabelecimento$.value?.id;if(!id)return;this.busy=true;this.error='';try{const {data,error}=await this.db.rpc('import_clients_csv',{p_id:id,p_rows:this.preview.rows});if(error)throw error;this.notice=`${data.inserted} cliente(s) importado(s). ${data.skipped} duplicado(s) preservado(s), sem alterações.`;this.preview=null;await this.clients.fetchClientes();}catch{this.error='A importação não foi concluída. Nenhum lote parcial é gravado. Confira o arquivo e tente novamente.';}finally{this.busy=false;this.cdr.markForCheck();}}
}
