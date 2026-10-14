import { ChangeDetectorRef, Component, EventEmitter, inject, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { EstabelecimentoService } from '../../services/estabelecimento.service';
import { SegmentoConfigService } from '../../services/segmento-config.service';
@Component({selector:'app-quick-start',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./quick-start.html',styleUrls:['./quick-start.css']})
export class QuickStart implements OnChanges {
 @Input() tenantId='';@Input() segment='outro';@Output() completed=new EventEmitter<void>();
 private cdr=inject(ChangeDetectorRef);private db=inject(SupabaseService).client;private est=inject(EstabelecimentoService);
 open=false;busy=false;error='';name='';start='09:00';end='18:00';days=[1,2,3,4,5,6];
 services:Array<{titulo:string;preco:number;duracao_min:number;selected:boolean}>=[];
 readonly weekdays=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
 ngOnChanges(){this.services=SegmentoConfigService.forSegmento(this.segment).servicosSugeridos.map(s=>({titulo:s.titulo,preco:s.preco,duracao_min:s.duracao_min,selected:true}));}
 toggleDay(day:number){this.days=this.days.includes(day)?this.days.filter(d=>d!==day):[...this.days,day];}
 async save(){if(this.busy)return;this.busy=true;this.error='';try{const selected=this.services.filter(s=>s.selected);if(this.name.trim().length<2||!selected.length||!this.days.length||this.start>=this.end)throw new Error('Confira profissional, serviços e horários.');const {error}=await this.db.rpc('tenant_quick_start',{p_id:this.tenantId,p_staff_name:this.name.trim(),p_services:selected.map(({titulo,preco,duracao_min})=>({titulo,preco:Number(preco),duracao_min:Number(duracao_min)})),p_days:this.days,p_open:this.start,p_close:this.end});if(error)throw error;await this.est.fetchServicos();await this.est.fetchHorarios();this.open=false;this.completed.emit();}catch(e){this.error=e instanceof Error?e.message:'Não foi possível preparar a agenda. Confira os campos e tente novamente.';}finally{this.busy=false;this.cdr.markForCheck();}}
}
