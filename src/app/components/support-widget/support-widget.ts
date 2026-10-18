import { Component, Input, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
@Component({selector:'app-support-widget',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./support-widget.html',styleUrls:['./support-widget.css']})
export class SupportWidget {
 @Input() owner=false;
 private db=inject(SupabaseService).client;
 private estab=inject(EstabelecimentoService);
 private router=inject(Router);
 private cdr=inject(ChangeDetectorRef);
 open=false; busy=false; loading=false; category='duvida'; body=''; error=''; notice=''; messages:any[]=[]; selected:any=null; reply=''; status='em_analise';
 async show(){this.open=true;await this.load();}
 async load(){this.loading=true;this.error='';try {const {data,error}=await this.db.from('support_messages').select('*').order('created_at',{ascending:false}).limit(50);if(error)throw error;this.messages=data||[];}catch{this.error='Não foi possível carregar as mensagens. Tente novamente.';}finally{this.loading=false;this.cdr.markForCheck();}}
 async send(){if(this.busy||this.body.trim().length<10)return;this.busy=true;this.error='';this.notice='';try{const {error}=await this.db.from('support_messages').insert({category:this.category,body:this.body.trim(),page_path:this.router.url.split(/[?#]/)[0].slice(0,300),estabelecimento_id:this.estab.estabelecimento$.getValue()?.id||null});if(error)throw error;this.body='';this.notice='Mensagem registrada. Você poderá acompanhar a resposta aqui.';await this.load();}catch{this.error='Não foi possível enviar. Seu texto foi preservado; tente novamente.';}finally{this.busy=false;this.cdr.markForCheck();}}
 choose(m:any){this.selected=m;this.reply=m.owner_reply||'';this.status=m.status;}
 async answer(){if(!this.selected||this.busy)return;this.busy=true;this.error='';try{const {data,error}=await this.db.from('support_messages').update({owner_reply:this.reply.trim()||null,status:this.status,replied_at:this.reply.trim()?new Date().toISOString():null}).eq('id',this.selected.id).select('id');if(error||!data?.length)throw error;this.selected=null;this.notice='Atendimento atualizado.';await this.load();}catch{this.error='Não foi possível salvar a resposta.';}finally{this.busy=false;this.cdr.markForCheck();}}
}
