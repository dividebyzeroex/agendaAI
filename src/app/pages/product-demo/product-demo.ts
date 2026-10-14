import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SegmentoConfigService } from '../../services/segmento-config.service';
@Component({selector:'app-product-demo',standalone:true,imports:[CommonModule,FormsModule,RouterLink],templateUrl:'./product-demo.html',styleUrls:['./product-demo.css']})
export class ProductDemo {
 private route=inject(ActivatedRoute);segment=['barbearia','salao','estetica','petshop'].includes(this.route.snapshot.queryParamMap.get('segmento')||'')?this.route.snapshot.queryParamMap.get('segmento')!:'barbearia';
 service=0;time='10:00';pet='';booked=false;showCash=false;
 readonly times=['09:00','09:30','10:00','11:00','14:00','15:30','16:00'];
 get config(){return SegmentoConfigService.forSegmento(this.segment);}
 get services(){return this.config.servicosSugeridos;}
 get selected(){return this.services[this.service]||this.services[0];}
 change(){this.service=0;this.booked=false;this.showCash=false;}
 start(){localStorage.setItem('ag_signup_segment',this.segment);}
 get guide(){return this.segment==='petshop'?'petshop':this.segment==='barbearia'?'barbearia':'beleza';}
}
