import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { SecurityService } from './security.service';
import { AgendaEventService, AgendaEvent } from './agenda-event.service';
import { ServiceChoice, buildServiceSlots } from '../core/multi-service';
import { EstabelecimentoService } from './estabelecimento.service';

export interface GroupedService {
  id:string;
  servico_id:string;
  profissional_id:string;
  start:string;
  end:string;
  title:string;
  name:string;
  price:number;
  status?:string;
  isExtra:boolean;
}
@Injectable({providedIn:'root'})
export class MultiServiceService {
  private db = inject(SupabaseService).client;
  private security = inject(SecurityService);
  private agenda = inject(AgendaEventService);
  private est = inject(EstabelecimentoService);
  private tenant():string {
    const id = this.est.estabelecimento$.value?.id;
    if (!id) throw Error('Estabelecimento não selecionado.');
    return id;
  }
  async createBooking(
    customerId:string, customerName:string, baseStart:string, choices:ServiceChoice[],
    professionals:{id:string;nome:string}[], status:'pendente'|'confirmado',
    requestId:string
  ):Promise<AgendaEvent[]> {
    const catalog = this.est.servicos$.value;
    const slots = buildServiceSlots(baseStart,choices,catalog.map(s=>({
      id:s.id!,duracao_min:s.duracao_min || 30
    })));
    const items = await Promise.all(slots.map(async slot => {
      const svc = catalog.find(s=>s.id===slot.servicoId)!;
      const pro = professionals.find(p=>p.id===slot.profissionalId);
      if (!pro) throw Error('Profissional não cadastrado no estabelecimento.');
      return {
        servico_id:slot.servicoId,profissional_id:slot.profissionalId,
        start:slot.start,end:slot.end,status,
        title:await this.security.encryptData(
          (svc.emoji || '✂️')+' '+customerName+' — '+svc.titulo
        ),
        profissional_nome:await this.security.encryptData(pro.nome)
      };
    }));
    const {data,error}=await this.db.rpc('create_multi_service_booking',{
      p_tenant:this.tenant(),p_customer:customerId,p_items:items,p_key:requestId
    });
    if (error) throw Error(error.message);
    const rows = (data || []) as AgendaEvent[];
    await this.agenda.reload();
    return rows;
  }

  /** Scheduled add-ons are real agenda slots; they appear on each employee's calendar. */
  async addService(rootId:string, serviceId:string, proId:string, start:string,
    mode:'paralelo'|'sequencial', clientName:string, professionalName:string,
    requestId:string):Promise<void> {
    const catalog=this.est.servicos$.value;
    const service=catalog.find(s=>s.id===serviceId);
    if (!service) throw Error('Serviço indisponível.');
    const title=await this.security.encryptData(
      (service.emoji || '✂️')+' '+clientName+' — '+service.titulo
    );
    const proName=await this.security.encryptData(professionalName);
    const {error}=await this.db.rpc('add_attendance_service',{
      p_tenant:this.tenant(),p_root:rootId,p_service:serviceId,
      p_professional:proId,p_start:start,p_mode:mode,p_title:title,
      p_professional_name:proName,p_key:requestId
    });
    if(error)throw Error(error.message);
    await this.agenda.reload();
  }
  async removeService(rootId:string,childId:string):Promise<void>{
    const {error}=await this.db.rpc('remove_attendance_service',{
      p_tenant:this.tenant(),p_root:rootId,p_child:childId
    });
    if(error)throw Error(error.message);
    await this.agenda.reload();
  }
  async loadChildren(rootId:string):Promise<AgendaEvent[]> {
    const {data,error}=await this.db.from('agenda_events').select('*')
      .eq('estabelecimento_id',this.tenant())
      .contains('metadata',{parent_event_id:rootId})
      .neq('status','cancelado')
      .order('start',{ascending:true});
    if(error) throw Error(error.message);
    return Promise.all((data || []).map(row=>
      this.security.decryptObject(row,['title','observacoes','profissional_nome'])
    ));
  }
  async priceOf(serviceId:string,proId:string):Promise<number>{
    const service=this.est.servicos$.value.find(s=>s.id===serviceId);
    if(!service) throw Error('Serviço não encontrado no catálogo.');
    const {data,error}=await this.db.from('profissional_servicos')
      .select('valor_proprio').eq('estabelecimento_id',this.tenant())
      .eq('profissional_id',proId).eq('servico_id',serviceId).maybeSingle();
    if(error)throw Error('Não foi possível conferir o preço do profissional.');
    return data?.valor_proprio == null ? Number(service.preco) : Number(data.valor_proprio);
  }
}
