import { SupportWidget } from '../../components/support-widget/support-widget';
import { Component, ElementRef, HostListener, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({selector:'app-platform-layout',standalone:true,imports:[SupportWidget,CommonModule,RouterModule],templateUrl:'./platform-layout.html',styleUrls:['./platform-layout.css']})
export class PlatformLayout {
 private authService=inject(AuthService);
 private router=inject(Router);
 @ViewChild('ownerMenu') menu?:ElementRef<HTMLElement>;
 private opener:HTMLElement|null=null;
 user$=this.authService.profile$;
 isSidebarOpen=false;
 isMobile=typeof window!=='undefined'&&window.innerWidth<=900;
 readonly navigation=[
  {path:'/platform-admin/dashboard',label:'Visão geral',icon:'pi-home',section:'Operação'},
  {path:'/platform-admin/control',label:'Gestão e ativação',icon:'pi-compass',section:'Operação'},
  {path:'/platform-admin/tenants',label:'Estabelecimentos',icon:'pi-building',section:'Operação'},
  {path:'/platform-admin/growth',label:'Oportunidades',icon:'pi-users',section:'Crescimento'},
  {path:'/platform-admin/billing',label:'Financeiro',icon:'pi-wallet',section:'Administração'},
  {path:'/platform-admin/settings',label:'Configurações',icon:'pi-cog',section:'Administração'}
 ];
 readonly mobileNavigation=this.navigation.filter(item=>['/platform-admin/dashboard','/platform-admin/tenants','/platform-admin/growth','/platform-admin/billing'].includes(item.path));
 get pageTitle(){return this.navigation.find(item=>this.isActive(item.path))?.label||'Owner';}
 isActive(path:string){return this.router.url.split(/[?#]/)[0].replace(/\/$/,'')===path;}
 toggleSidebar(event?:Event){
  if(this.isSidebarOpen){this.closeSidebar();return;}
  this.opener=event?.currentTarget instanceof HTMLElement?event.currentTarget:null;
  this.isSidebarOpen=true;
  setTimeout(()=>{if(this.isSidebarOpen)this.menu?.nativeElement.querySelector<HTMLElement>('.menu-close')?.focus();},0);
 }
 closeSidebar(){this.isSidebarOpen=false;this.opener?.focus();}
 @HostListener('window:resize') resize(){this.isMobile=window.innerWidth<=900;if(!this.isMobile)this.isSidebarOpen=false;}
 @HostListener('document:keydown.escape') escape(){if(this.isSidebarOpen)this.closeSidebar();}
 trapMenu(event:KeyboardEvent){
  if(!this.isMobile||!this.isSidebarOpen||event.key!=='Tab')return;
  const controls=Array.from(this.menu?.nativeElement.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')||[]);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 }
 async logout(){await this.authService.logout();}
}
