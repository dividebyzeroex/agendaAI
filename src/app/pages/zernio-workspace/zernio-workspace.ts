import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';

type SocialAccount = { id: string; platform: string; username: string; isActive: boolean };
type MediaType = 'image'|'video';
type Attachment = { name: string; type: MediaType; file: File; preview: string; publicUrl?: string };
const ACCEPTED_TYPES = new Set(['image/jpeg','image/png','video/mp4','video/quicktime']);
const MAX_MEDIA_BYTES = 300 * 1024 * 1024;

@Component({
  selector: 'app-zernio-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zernio-workspace.html',
  styleUrls: ['./zernio-workspace.css'],
})
export class ZernioWorkspace implements OnInit, OnDestroy {
  private db = inject(SupabaseService).client;
  private est = inject(EstabelecimentoService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  growthCampaignName = '';
  private loadedGrowthCampaign = '';
  private cdr = inject(ChangeDetectorRef);

  get isOwner() { return this.router.url.startsWith('/platform-admin'); }
  accounts: SocialAccount[] = [];
  tenantProfiles: Array<{nome:string;profileId:string;connectedAccounts:number}> = [];
  selected = new Set<string>();
  platforms = [
    { value:'instagram',label:'Instagram' }, {value:'facebook',label:'Facebook'},
    {value:'googlebusiness',label:'Google Business'},{value:'tiktok',label:'TikTok'},
    {value:'linkedin',label:'LinkedIn'},{value:'youtube',label:'YouTube'}
  ];
  platform = 'instagram';
  content = '';
  scheduledFor = '';
  attachments: Attachment[] = [];
  loading = true;
  busy = false;
  uploadProgress = '';
  verified: boolean | null = null;
  error = '';
  notice = '';
  profileId = '';

  get activeAccounts() { return this.accounts.filter(a => a.isActive).length; }
  get selectedAccounts() { return this.accounts.filter(a => a.isActive && this.selected.has(a.id)); }
  get requiresMedia() { return this.selectedAccounts.some(a => ['instagram','tiktok','pinterest'].includes(a.platform)); }
  get canSubmit() {
    return !this.loading && !this.busy && !!this.content.trim() &&
      this.selectedAccounts.length > 0 && (!this.requiresMedia || this.attachments.length > 0) &&
      (!this.selectedAccounts.some(a => a.platform === 'instagram') || this.content.length <= 2200);
  }
  get minSchedule() { return this.localDateTime(new Date(Date.now() + 2 * 60_000)); }
  get scheduleInvalid() {
    if (!this.scheduledFor) return false;
    const when = new Date(this.scheduledFor).getTime();
    return !Number.isFinite(when) || when <= Date.now() + 30_000 || when > Date.now() + 90 * 86400_000;
  }
  get scheduleText() {
    if (!this.scheduledFor) return 'Selecione a data e o horário da publicação.';
    if (this.scheduleInvalid) return 'Escolha um horário ainda futuro, com até 90 dias de antecedência.';
    return 'O horário escolhido será respeitado no seu fuso local.';
  }

  ngOnInit() { void this.load(); }
  ngOnDestroy() {
    for (const item of this.attachments) if (item.preview) URL.revokeObjectURL(item.preview);
  }
  private localDateTime(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset()*60_000);
    return local.toISOString().slice(0,16);
  }
  scheduleToday() { this.scheduledFor = this.localDateTime(new Date(Date.now()+30*60_000)); }
  private async scope() {
    if (this.isOwner) return { scope:'owner' };
    let id = this.est.estabelecimento$.value?.id;
    if (!id) {
      await this.est.fetchEstabelecimento();
      id = this.est.estabelecimento$.value?.id;
    }
    if (!id) throw Error('Abra sua conta de estabelecimento para continuar.');
    return {scope:'tenant',estabelecimentoId:id};
  }
  private async api(action: string, data: Record<string,unknown> = {}) {
    const { data: {session} } = await this.db.auth.getSession();
    if (!session) throw Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch('/api/commercial?action=zernio-'+action, {
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
      body:JSON.stringify({...await this.scope(),...data}),
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw Error(result.error || 'Não foi possível comunicar com o Zernio.');
    return result;
  }
  async load() {
    this.loading=true;this.error='';
    try {
      const data=await this.api('overview');
      this.profileId=data.profileId||'';
      this.accounts=data.accounts||[];
      const campaignId = this.route.snapshot.queryParamMap.get('campanha');
      if (!this.isOwner && campaignId && /^[0-9a-f-]{36}$/i.test(campaignId) && campaignId !== this.loadedGrowthCampaign) {
        const tenant = (await this.scope() as {estabelecimentoId?:string}).estabelecimentoId;
        const {data:campaign,error:campaignError}=await this.db.from('growth_social_campaigns')
          .select('id,title,caption').eq('id',campaignId).eq('estabelecimento_id',tenant!).maybeSingle();
        if (campaignError) throw Error(campaignError.message);
        if (campaign) {
          this.content = campaign.caption;
          this.growthCampaignName = campaign.title;
          this.loadedGrowthCampaign = campaignId;
        }
      }

      this.tenantProfiles=this.isOwner?(data.tenants||[]):[];
      this.selected=new Set([...this.selected].filter(id=>this.accounts.some(a=>a.id===id&&a.isActive)));
      if(new URLSearchParams(window.location.search).has('connected'))
        this.notice='Conexão autorizada. Selecione o canal para criar seu conteúdo.';
    }catch(e){this.error=e instanceof Error?e.message:'Não foi possível consultar as contas.';}
    finally{this.loading=false;this.cdr.markForCheck();}
  }
  async verifyKey() {
    this.busy=true;this.error='';this.notice='';
    try {
      const result=await this.api('health');
      this.verified=result.configured===true;
      this.notice=this.verified?'Conexão com Zernio verificada.':'A integração ainda não foi validada.';
    }catch(e){this.verified=false;this.error=e instanceof Error?e.message:'Falha na verificação.';}
    finally{this.busy=false;this.cdr.markForCheck();}
  }
  toggleAccount(id:string,on:boolean){
    if(on)this.selected.add(id);else this.selected.delete(id);
    this.cdr.markForCheck();
  }
  async connect(){
    this.busy=true;this.error='';
    try {
      const data=await this.api('connect',{platform:this.platform});
      if(!data.authUrl)throw Error('URL de autorização indisponível.');
      window.location.assign(data.authUrl);
    }catch(e){this.error=e instanceof Error?e.message:'Não foi possível conectar a conta.';this.busy=false;this.cdr.markForCheck();}
  }
  addMedia(event: Event) {
    const input=event.target as HTMLInputElement;
    this.error='';
    const files=Array.from(input.files||[]);
    input.value='';
    for(const file of files){
      if(this.attachments.length>=10){this.error='Selecione no máximo 10 arquivos por publicação.';break;}
      if(!ACCEPTED_TYPES.has(file.type) || file.size>MAX_MEDIA_BYTES || file.size===0){
        this.error='Use imagens JPG/PNG ou vídeos MP4/MOV com até 300 MB por arquivo.';
        continue;
      }
      const type:MediaType=file.type.startsWith('image/')?'image':'video';
      this.attachments.push({name:file.name,type,file,preview:URL.createObjectURL(file)});
    }
    this.cdr.markForCheck();
  }
  removeMedia(index:number){
    const item=this.attachments[index];
    if(item?.preview)URL.revokeObjectURL(item.preview);
    this.attachments.splice(index,1);
  }
  private async uploadedMedia(){
    for(let i=0;i<this.attachments.length;i++){
      const item=this.attachments[i];
      if(item.publicUrl)continue;
      this.uploadProgress='Enviando arquivo '+(i+1)+' de '+this.attachments.length+'…';
      this.cdr.markForCheck();
      const upload=await this.api('media-presign',{filename:item.name,contentType:item.file.type,size:item.file.size});
      const response=await fetch(upload.uploadUrl,{method:'PUT',headers:{'Content-Type':item.file.type},body:item.file});
      if(!response.ok)throw Error('O upload de '+item.name+' falhou. Tente novamente.');
      item.publicUrl=upload.publicUrl;
    }
    return this.attachments.map(a=>({url:a.publicUrl!,type:a.type}));
  }
  async save(mode:'draft'|'schedule'){
    if(!this.canSubmit)return;
    this.error='';this.notice='';this.busy=true;
    try{
      if(mode==='schedule' && (!this.scheduledFor || this.scheduleInvalid))
        throw Error('Escolha um horário futuro, inclusive hoje, para agendar.');
      const mediaItems=await this.uploadedMedia();
      const instant=mode==='schedule'?new Date(this.scheduledFor).toISOString():undefined;
      const result=await this.api(mode,{
        accountIds:this.selectedAccounts.map(x=>x.id),
        content:this.content.trim(),mediaItems,
        ...(instant?{scheduledFor:instant}:{}),
        requestId:crypto.randomUUID(),
      });
      if(mode==='schedule' && result.status!=='scheduled')
        throw Error('O Zernio não confirmou o agendamento. Verifique o status antes de repetir.');
      this.notice=mode==='draft'?'Rascunho salvo no Zernio.':'Post agendado com sucesso para '+new Date(this.scheduledFor).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})+'.';
      this.content='';
      for(const item of this.attachments)URL.revokeObjectURL(item.preview);
      this.attachments=[];
    }catch(e){this.error=e instanceof Error?e.message:'Não foi possível salvar a publicação.';}
    finally{this.busy=false;this.uploadProgress='';this.cdr.markForCheck();}
  }
}
