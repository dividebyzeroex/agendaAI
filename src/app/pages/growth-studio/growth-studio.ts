import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';

type Item = { id:string; titulo?:string; nome?:string; preco?:number; duracao_min?:number };
type Slot = { slot_start:string };
type Campaign = {
 id:string;tracking_code:string;title:string;caption:string;status:string;
 servico_id:string;profissional_id:string;slot_start:string;created_at:string;
 visits:number;bookings:number;
};
@Component({
 selector:'app-growth-studio',standalone:true,imports:[CommonModule,FormsModule,RouterLink],
 templateUrl:'./growth-studio.html',styleUrls:['./growth-studio.css'],
})
export class GrowthStudio implements OnInit {
 private db=inject(SupabaseService).client;
 private est=inject(EstabelecimentoService);
 private router=inject(Router);
 private cdr=inject(ChangeDetectorRef);
 loading=true;busy=false;error='';notice='';
 services:Item[]=[];professionals:Item[]=[];slots:Slot[]=[];campaigns:Campaign[]=[];
 retention:any={inactive30:0,inactive60:0,email_opt_in30:0,total_clients:0};
 selectedService='';selectedProfessional='';selectedDay=this.localDate(new Date());selectedSlot='';
 variation:'simple'|'urgency'='simple';
 generatedLink='';answerTemplate='';
 get tenant(){return this.est.estabelecimento$.value?.id || '';}
 get slug(){return this.est.estabelecimento$.value?.slug || '';}
 get totalClicks(){return this.campaigns.reduce((n,x)=>n+x.visits,0);}
 get totalBookings(){return this.campaigns.reduce((n,x)=>n+x.bookings,0);}
 get confirmedCampaigns(){return this.campaigns.filter(x=>x.status!=='draft').length;}
 get selectedServiceDetails(){return this.services.find(s=>s.id===this.selectedService);}
 get chosenProfessional(){return this.professionals.find(p=>p.id===this.selectedProfessional);}
 get hasOpportunity(){return !!this.selectedSlot && !!this.selectedService && !!this.selectedProfessional && !!this.slug;}
 get minDay(){return this.localDate(new Date());}
 get maxDay(){const d=new Date();d.setDate(d.getDate()+14);return this.localDate(d);}
 private localDate(d:Date){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);}
 formatSlot(iso:string){return new Date(iso).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}
 bookingLink(c:{tracking_code:string}){return new URL('/agendar/'+encodeURIComponent(this.slug)+'?campanha='+c.tracking_code,window.location.origin).toString();}
 private async rpc(name:string,body:Record<string,unknown>){const {data,error}=await this.db.rpc(name,body);if(error)throw Error(error.message);return data;}
 async ngOnInit(){await this.load();}
 async load(){
  this.loading=true;this.error='';
  try{
   if(!this.tenant)await this.est.fetchEstabelecimento();
   if(!this.tenant)throw Error('Selecione seu estabelecimento.');
   const t=this.tenant;
   const [sv,pro,cam,ret]=await Promise.all([
    this.db.from('servicos').select('id,titulo,preco,duracao_min').eq('estabelecimento_id',t).eq('ativo',true).order('titulo'),
    this.db.from('profissionais').select('id,nome').eq('estabelecimento_id',t).eq('ativo',true).order('nome'),
    this.db.from('growth_social_campaigns').select('id,title,caption,status,tracking_code,servico_id,profissional_id,slot_start,created_at')
      .eq('estabelecimento_id',t).order('created_at',{ascending:false}).limit(60),
    this.rpc('growth_retention_counts',{p_tenant:t})
   ]);
   if(sv.error||pro.error||cam.error)throw Error(sv.error?.message||pro.error?.message||cam.error?.message||'Consulta indisponível.');
   this.services=sv.data||[];this.professionals=pro.data||[];this.retention=ret||{};
   if(!this.services.some(s=>s.id===this.selectedService))this.selectedService=this.services[0]?.id||'';
   if(!this.professionals.some(p=>p.id===this.selectedProfessional))this.selectedProfessional=this.professionals[0]?.id||'';
   const rows=cam.data||[];
   const ids=rows.map(x=>x.id);
   let visits:any[]=[];let bookings:any[]=[];
   if(ids.length){
    const [v,b]=await Promise.all([
      this.db.from('growth_social_visits').select('campaign_id,clicks').in('campaign_id',ids),
      this.db.from('growth_social_bookings').select('campaign_id,event_id').in('campaign_id',ids)
    ]);
    if(v.error||b.error)throw Error(v.error?.message||b.error?.message||'Métricas indisponíveis.');
    visits=v.data||[];bookings=b.data||[];
   }
   this.campaigns=rows.map(c=>({...c,visits:visits.filter(v=>v.campaign_id===c.id).reduce((sum,v)=>sum+v.clicks,0),
     bookings:bookings.filter(b=>b.campaign_id===c.id).length}));
   if(this.selectedService&&this.selectedProfessional)await this.loadSlots();
  }catch(e){this.error=e instanceof Error?e.message:'Não foi possível carregar o Growth Studio.';}
  finally{this.loading=false;this.cdr.markForCheck();}
 }
 async loadSlots(){
  if(!this.tenant||!this.selectedService||!this.selectedProfessional)return;
  this.error='';this.selectedSlot='';
  try{
   const data=await this.rpc('growth_open_slots',{p_tenant:this.tenant,p_day:this.selectedDay,
    p_service:this.selectedService,p_professional:this.selectedProfessional});
   this.slots=data||[];
  }catch(e){this.slots=[];this.error=e instanceof Error?e.message:'Não foi possível consultar os horários.';}
  finally{this.cdr.markForCheck();}
 }
 draftCaption(link:string){
  const service=this.selectedServiceDetails?.titulo||'atendimento';
  const company=this.est.estabelecimento$.value?.nome||'Nosso salão';
  const when=this.selectedSlot?this.formatSlot(this.selectedSlot):'em breve';
  return this.variation==='urgency'
    ? '✨ Surgiu um horário para '+service+'!\n'+when+' com '+(this.chosenProfessional?.nome||'nossa equipe')+'.\n\nConfira a disponibilidade e reserve pelo link:\n'+link+'\n\nOs horários podem mudar a qualquer momento.\n#AgendaAberta'
    : 'Sua próxima visita ao '+company+' pode começar aqui. ✨\nTemos um horário disponível para '+service+' em '+when+'.\n\nReserve diretamente pela nossa agenda:\n'+link+'\n\nSujeito à disponibilidade.';
 }
 async createCampaign(){
  if(this.busy||!this.hasOpportunity)return;
  this.busy=true;this.notice='';this.error='';
  try{
   const t=this.tenant;
   const {data,error}=await this.db.from('growth_social_campaigns').insert({
    estabelecimento_id:t,servico_id:this.selectedService,profissional_id:this.selectedProfessional,
    slot_start:this.selectedSlot,title:'Horário disponível · '+(this.selectedServiceDetails?.titulo||'Serviço'),
    caption:'Rascunho em preparação para seu estabelecimento',status:'draft'
   }).select('id,tracking_code').single();
   if(error||!data)throw Error(error?.message||'Falha ao criar campanha.');
   const link=this.bookingLink(data);
   const caption=this.draftCaption(link);
   const {error:upError}=await this.db.from('growth_social_campaigns').update({caption,status:'ready',updated_at:new Date().toISOString()})
     .eq('id',data.id).eq('estabelecimento_id',t);
   if(upError)throw Error('Campanha criada como rascunho, mas não foi ativada: '+upError.message);
   this.generatedLink=link;
   this.answerTemplate='Olá! 👋 Temos horários que você pode consultar e reservar por aqui: '+link;
   this.notice='Campanha pronta. Inclua uma foto e agende nas redes ou compartilhe o link.';
   await this.load();
  }catch(e){this.error=e instanceof Error?e.message:'Não foi possível criar a campanha.';}
  finally{this.busy=false;this.cdr.markForCheck();}
 }
 async setStatus(c:Campaign,status:'paused'|'ready'){
  if(this.busy)return;this.busy=true;this.error='';this.notice='';
  try{
   const {error}=await this.db.from('growth_social_campaigns').update({status,updated_at:new Date().toISOString()})
     .eq('id',c.id).eq('estabelecimento_id',this.tenant);
   if(error)throw Error(error.message);
   c.status=status;this.notice=status==='paused'?'Campanha pausada.':'Campanha reativada.';
  }catch(e){this.error=e instanceof Error?e.message:'Não foi possível atualizar.';}
  finally{this.busy=false;this.cdr.markForCheck();}
 }
 openComposer(c:Campaign){void this.router.navigate(['/admin/social'],{queryParams:{campanha:c.id}});}
 replyTemplate(c:Campaign){
  return 'Olá! 👋 Obrigado pelo interesse. Você pode ver os serviços e reservar seu horário aqui: '+this.bookingLink(c);
 }
 async copy(value:string){
  try{await navigator.clipboard.writeText(value);this.notice='Copiado para compartilhar.';}
  catch{this.error='Não foi possível copiar automaticamente. Selecione o link e copie manualmente.';}
  this.cdr.markForCheck();
 }
}
