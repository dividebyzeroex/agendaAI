import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
@Component({selector:'app-owner-control',standalone:true,imports:[CommonModule,FormsModule,RouterLink],templateUrl:'./owner-control.html',styleUrls:['./owner-control.css']})
export class OwnerControl implements OnInit {
 private db=inject(SupabaseService).client;private cdr=inject(ChangeDetectorRef);
 data:any=null; tickets:any[]=[]; errors:any[]=[];payments:any[]=[];
 busy=false;error='';selected='';ticketStatus='';category='';search='';draft='';reply='';editing:any=null;replyStatus='em_analise';notice='';
 async ngOnInit(){await this.refresh();}
 async refresh(){this.busy=true;this.error='';try{
 const [s,t,e,p]=await Promise.all([this.db.rpc('owner_control_snapshot'),this.db.from('support_messages').select('*').order('created_at',{ascending:false}).limit(200),this.db.from('app_error_events').select('id,user_id,page_path,error_code,created_at').gte('created_at',new Date(Date.now()-7*86400000).toISOString()).order('created_at',{ascending:false}).limit(1000),this.db.from('commercial_payments').select('id,estabelecimento_id,amount_cents,currency,status,paid_at,created_at').eq('livemode',true).order('created_at',{ascending:false}).limit(1000)]);
 for(const r of [s,t,e,p])if(r.error)throw r.error;
 this.data=s.data;this.tickets=t.data||[];this.errors=e.data||[];this.payments=p.data||[];
 }catch{this.error='Não foi possível atualizar a central. Dados anteriores foram preservados.';}finally{this.busy=false;this.cdr.markForCheck();}}
 get tenants(){return (this.data?.usage||[]).map((u:any)=>({...u,...this.data.tenants.find((t:any)=>t.id===u.id)}));}
 active(items:any[]){return items.filter(x=>x.ativo).length;}
 paid(t:any){return t.livemode===true&&t.subscription_status==='active'&&this.payments.some(p=>p.estabelecimento_id===t.id&&p.status==='paid'&&p.paid_at);}
 get funnel(){const ts=this.tenants;return [{label:'Estabelecimentos',value:ts.length},{label:'Com serviço ativo',value:ts.filter((t:any)=>this.active(t.services)).length},{label:'Serviço e equipe ativos',value:ts.filter((t:any)=>this.active(t.services)&&this.active(t.staff)).length},{label:'Com primeiro agendamento',value:ts.filter((t:any)=>t.appointments>0).length},{label:'Contrato ativo e pagamento real',value:ts.filter((t:any)=>this.paid(t)).length}];}
 reasons(t:any){const a=[];if(!t.owner_verified)a.push('Responsável sem email verificado');if(!this.active(t.services))a.push('Sem serviço ativo');if(!this.active(t.staff))a.push('Sem profissional ativo');else if(t.staff.some((p:any)=>p.ativo&&(!p.services||!p.availability)))a.push('Equipe com serviço ou disponibilidade pendente');if(t.trial_ends_at){const d=Math.ceil((Date.parse(t.trial_ends_at)-Date.now())/86400000);if(d>=0&&d<=7&&!this.paid(t))a.push(`Teste termina em ${d} dia(s)`);}const last=t.last_record_at||t.created_at;if(last&&Date.now()-Date.parse(last)>3*86400000&&!this.paid(t))a.push('Sem novos registros há mais de 3 dias');if(this.tickets.some(m=>m.estabelecimento_id===t.id&&['aberto','em_analise'].includes(m.status)))a.push('Atendimento pendente');return a;}
 get attention(){return this.tenants.map((t:any)=>({...t,reasons:this.reasons(t)})).filter((t:any)=>t.reasons.length).sort((a:any,b:any)=>b.reasons.length-a.reasons.length);}
 get tenant(){return this.tenants.find((t:any)=>t.id===this.selected);}
 get timeline(){return (this.data?.timeline||[]).filter((e:any)=>e.tenant_id===this.selected);}
 get filteredTickets(){const q=this.search.toLocaleLowerCase();return this.tickets.filter(m=>(!this.ticketStatus||m.status===this.ticketStatus)&&(!this.category||m.category===this.category)&&(!q||`${m.body} ${this.name(m.estabelecimento_id)}`.toLocaleLowerCase().includes(q)));}
 name(id:string){return this.tenants.find((t:any)=>t.id===id)?.nome||'Sem estabelecimento vinculado';}
 age(date:string){return Math.max(0,Math.floor((Date.now()-Date.parse(date))/86400000));}
 get errorGroups(){const map=new Map<string,any>();for(const e of this.errors){const k=e.page_path+'|'+e.error_code;const g=map.get(k)||{page:e.page_path,code:e.error_code,count:0,users:new Set<string>(),last:e.created_at};g.count++;g.users.add(e.user_id);map.set(k,g);}return [...map.values()].sort((a,b)=>b.count-a.count);}
 get suggestions(){const map=new Map<string,any>();for(const t of this.tickets.filter(t=>t.category==='sugestao')){const key=t.body.trim().toLocaleLowerCase().replace(/\s+/g,' ');const g=map.get(key)||{body:t.body,count:0};g.count++;map.set(key,g);}return [...map.values()].sort((a,b)=>b.count-a.count);}
 prepare(t:any){this.selected=t.id;let help='criar seu primeiro agendamento';if(!this.active(t.services))help='cadastrar o primeiro serviço, com preço e duração';else if(!this.active(t.staff))help='cadastrar um profissional e definir sua disponibilidade';else if(t.staff.some((p:any)=>p.ativo&&(!p.services||!p.availability)))help='vincular serviços à equipe e conferir os horários disponíveis';this.draft=`Olá, equipe ${t.nome}! Aqui é João Paulo, do AgendaAI. Vi que vocês já cadastraram ${t.clients} cliente(s) e ${t.services.length} serviço(s). Posso ajudar vocês a ${help}? Como próximo objetivo do piloto, sugiro registrar um agendamento real e acompanhar sua conclusão. O teste dura 30 dias, sem cartão e sem cobrança automática; contratar depois é opcional.\n\nhttps://agenda-ai-beryl.vercel.app/login`;}
 edit(m:any){this.editing=m;this.reply=m.owner_reply||'';this.replyStatus=m.status;}
 async save(){if(!this.editing||this.busy)return;this.busy=true;try{const {data,error}=await this.db.from('support_messages').update({owner_reply:this.reply.trim()||null,status:this.replyStatus,replied_at:this.reply.trim()?new Date().toISOString():null}).eq('id',this.editing.id).select('id');if(error||!data?.length)throw error;this.editing=null;this.notice='Atendimento atualizado.';await this.refresh();}catch{this.error='Falha ao salvar atendimento.';}finally{this.busy=false;this.cdr.markForCheck();}}
 get realReceived(){return this.payments.filter(p=>p.status==='paid'&&p.currency==='brl'&&p.paid_at).reduce((s,p)=>s+p.amount_cents/100,0);}
 get failures(){return this.payments.filter(p=>p.status==='failed');}
}
