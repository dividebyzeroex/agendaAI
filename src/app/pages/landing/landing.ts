import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.html',
  styleUrls: ['./landing.css']
})
export class Landing {
  mouseY = 0;
  mouseX = 0;

  constructor(private router: Router) {}

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: MouseEvent) {
    this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    
    // Setting CSS variables for the antigravity parallax effect
    document.documentElement.style.setProperty('--mouse-x', this.mouseX.toString());
    document.documentElement.style.setProperty('--mouse-y', this.mouseY.toString());
  }

  faqs = [
    { question: 'O AgendaAi funciona se eu já tiver um sistema antigo?', answer: 'Com certeza! Nosso agente atua diretamente em cima da comunicação, rodando em paralelo até você se sentir seguro de migrar 100%.', expanded: false },
    { question: 'A Inteligência Artificial vai soar robótica para meus clientes?', answer: 'Zero. A IA usa linguagem humanizada de alto nível, com direito a emoticons na medida certa, gírias locais (se treinado) e altíssima cordialidade.', expanded: false },
    { question: 'Preciso de um desenvolvedor para configurar?', answer: 'Não. Nossa configuração leva cerca de 30 segundos! Você pluga o painel, a IA aprende com suas instruções básicas e já nasce pronta.', expanded: false },
    { question: 'E se o cliente quiser cancelar de madrugada?', answer: 'Esse é o poder do Agenda Ai! O software cancela e instantaneamente envia mensagem para sua lista de espera preenchendo o buraco no dia seguinte.', expanded: false }
  ];

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToAgendar() {
    this.router.navigate(['/agendar']);
  }

  toggleFaq(index: number) {
    // Recolhe os outros, se necessário para modelo sanfona clássico. Aqui vamos deixar abrir vários!
    this.faqs[index].expanded = !this.faqs[index].expanded;
  }
}
