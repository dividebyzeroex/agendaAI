import { Component, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgendaEventService } from '../../services/agenda-event.service';
import { Router } from '@angular/router';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Floating Button -->
    <div class="fab-container" *ngIf="!isOpen" (click)="togglePanel()">
      <div class="fab-button">
        <i class="pi pi-sparkles"></i>
      </div>
      <div class="fab-badge">1</div>
    </div>

    <!-- Assistant Panel -->
    <div class="assistant-drawer" [class.open]="isOpen">
      <div class="drawer-header">
        <div class="header-info">
          <i class="pi pi-sparkles" style="color: #6366f1;"></i>
          <h3>Agenda AI</h3>
        </div>
        <button class="close-btn" (click)="togglePanel()"><i class="pi pi-times"></i></button>
      </div>
      
      <div class="drawer-body" #chatBody>
        <div class="message" *ngFor="let msg of messages" [class.user]="msg.role === 'user'">
          <div class="msg-avatar">
            <i class="pi" [class.pi-user]="msg.role === 'user'" [class.pi-sparkles]="msg.role === 'assistant'"></i>
          </div>
          <div class="msg-bubble">
            {{ msg.content }}
          </div>
        </div>
        <div class="thinking-indicator" *ngIf="isThinking">
          <span></span><span></span><span></span>
        </div>
      </div>
      
      <div class="drawer-footer">
        <div class="input-container">
          <button class="mic-btn" (click)="toggleVoice()" [class.recording]="isRecording">
            <i class="pi" [class.pi-microphone]="!isRecording" [class.pi-headphones]="isRecording"></i>
          </button>
          <input 
            type="text" 
            [(ngModel)]="userInput" 
            (keyup.enter)="sendMessage()" 
            [placeholder]="isRecording ? 'Ouvindo...' : 'Digite seu comando...'"
          />
          <button class="send-btn" (click)="sendMessage()" [disabled]="!userInput.trim()">
            <i class="pi pi-send"></i>
          </button>
        </div>
        <div class="hint">Dica: Diga "Agendar cliente João para amanhã às 14h"</div>
      </div>
    </div>
    
    <!-- Backdrop for mobile/smaller screens -->
    <div class="drawer-backdrop" *ngIf="isOpen" (click)="togglePanel()"></div>
  `,
  styles: [`
    .fab-container {
      position: fixed; bottom: 2rem; right: 2rem; z-index: 999;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      animation: bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .fab-button {
      background: linear-gradient(135deg, #6366f1, #a855f7); color: white;
      width: 56px; height: 56px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.5rem; box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.4);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .fab-container:hover .fab-button {
      transform: scale(1.05); box-shadow: 0 12px 20px -3px rgba(99, 102, 241, 0.5);
    }
    .fab-badge {
      position: absolute; top: -2px; right: -2px; background: #ef4444; color: white;
      font-size: 0.7rem; font-weight: bold; width: 20px; height: 20px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center;
      border: 2px solid #fff;
    }
    
    .assistant-drawer {
      position: fixed; top: 0; right: -400px; width: 380px; height: 100vh;
      background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);
      box-shadow: -5px 0 25px rgba(0,0,0,0.1); z-index: 1000;
      display: flex; flex-direction: column; transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      border-left: 1px solid rgba(255,255,255,0.5);
    }
    .assistant-drawer.open { right: 0; }
    
    .drawer-header {
      padding: 1.5rem; display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #f1f5f9; background: white;
    }
    .header-info { display: flex; align-items: center; gap: 10px; }
    .header-info h3 { margin: 0; font-size: 1.2rem; color: #1e293b; font-weight: 700; }
    .close-btn {
      background: transparent; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer;
      width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    }
    .close-btn:hover { background: #f1f5f9; color: #334155; }
    
    .drawer-body {
      flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;
      background: #f8fafc;
    }
    
    .message { display: flex; gap: 12px; align-items: flex-end; max-width: 90%; }
    .message.user { align-self: flex-end; flex-direction: row-reverse; }
    
    .msg-avatar {
      width: 32px; height: 32px; border-radius: 50%; background: #e0e7ff; color: #4f46e5;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.9rem;
    }
    .message.user .msg-avatar { background: #cbd5e1; color: #334155; }
    
    .msg-bubble {
      background: white; padding: 12px 16px; border-radius: 16px; border-bottom-left-radius: 4px;
      font-size: 0.95rem; color: #334155; box-shadow: 0 1px 2px rgba(0,0,0,0.05); line-height: 1.4;
    }
    .message.user .msg-bubble {
      background: #4f46e5; color: white; border-radius: 16px; border-bottom-right-radius: 4px;
    }
    
    .drawer-footer { background: white; padding: 1rem; border-top: 1px solid #f1f5f9; }
    .input-container {
      display: flex; align-items: center; background: #f1f5f9; border-radius: 24px; padding: 4px;
    }
    .mic-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none; background: transparent;
      color: #64748b; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .mic-btn.recording { background: #ef4444; color: white; animation: pulse 1.5s infinite; }
    
    .input-container input {
      flex: 1; border: none; background: transparent; padding: 0 12px; outline: none; color: #334155;
    }
    .send-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none; background: #4f46e5;
      color: white; font-size: 0.9rem; cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: background 0.2s;
    }
    .send-btn:disabled { background: #cbd5e1; cursor: not-allowed; }
    .send-btn:not(:disabled):hover { background: #4338ca; }
    
    .hint { font-size: 0.75rem; color: #94a3b8; text-align: center; margin-top: 8px; }
    
    .drawer-backdrop {
      display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.2); z-index: 999;
    }
    
    .thinking-indicator { display: flex; align-items: center; gap: 4px; padding: 12px 16px; background: white; border-radius: 16px; align-self: flex-start; margin-left: 44px; }
    .thinking-indicator span { width: 6px; height: 6px; background: #cbd5e1; border-radius: 50%; animation: blink 1.4s infinite both; }
    .thinking-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .thinking-indicator span:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes blink { 0%, 100% { opacity: 0.2; } 20% { opacity: 1; } }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); } 70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); } 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); } }
    @keyframes bounceIn { 0% { transform: scale(0); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
    
    @media (max-width: 768px) {
      .assistant-drawer { width: 100%; right: -100%; }
      .drawer-backdrop { display: block; }
    }
  `]
})
export class AiAssistantComponent {
  isOpen = false;
  userInput = '';
  isRecording = false;
  isThinking = false;
  
  messages: ChatMessage[] = [
    { role: 'assistant', content: 'Olá! Sou seu assistente de agenda inteligente. Posso ajudar a marcar horários, cancelar eventos ou navegar pelo sistema. Como posso ajudar?', timestamp: new Date() }
  ];

  agendaService = inject(AgendaEventService);
  router = inject(Router);
  zone = inject(NgZone);
  recognition: any;

  constructor() {
    this.initSpeechRecognition();
  }

  togglePanel() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => {
        const inputContainer = document.querySelector('.input-container input') as HTMLElement;
        inputContainer?.focus();
      }, 300);
    } else {
      if (this.isRecording) {
        this.stopRecording();
      }
    }
  }

  initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'pt-BR';
      this.recognition.continuous = false;
      this.recognition.interimResults = false;

      this.recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        this.zone.run(() => {
          this.userInput = transcript;
          this.isRecording = false;
          // Auto send after dictation
          setTimeout(() => this.sendMessage(), 300);
        });
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech error:', event.error);
        this.zone.run(() => this.isRecording = false);
      };

      this.recognition.onend = () => {
        this.zone.run(() => this.isRecording = false);
      };
    } else {
      console.warn('Speech recognition not supported in this browser.');
    }
  }

  toggleVoice() {
    if (!this.recognition) {
      alert('Seu navegador não suporta reconhecimento de voz.');
      return;
    }
    
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  startRecording() {
    try {
      this.recognition.start();
      this.isRecording = true;
      this.userInput = ''; // clear input while listening
    } catch (e) {
      this.isRecording = false;
    }
  }

  stopRecording() {
    if (this.recognition) {
      this.recognition.stop();
    }
    this.isRecording = false;
  }

  sendMessage() {
    const text = this.userInput.trim();
    if (!text) return;

    // Add user message
    this.messages.push({ role: 'user', content: text, timestamp: new Date() });
    this.userInput = '';
    this.scrollToBottom();

    // Simulate AI thinking delay
    this.isThinking = true;
    setTimeout(() => {
      this.isThinking = false;
      this.processIntent(text);
      this.scrollToBottom();
    }, 1200);
  }

  processIntent(text: string) {
    const lowerText = text.toLowerCase();
    
    // Simplistic NLP logic for scheduling
    // Example: "Agendar Joao para amanha as 14 horas"
    if (lowerText.includes('agendar') || lowerText.includes('marcar')) {
      const isTomorrow = lowerText.includes('amanhã');
      
      let date = new Date();
      if (isTomorrow) {
        date.setDate(date.getDate() + 1);
      }
      
      // Attempt to extract hour
      const hourMatch = lowerText.match(/(\d{1,2})\s*(?:horas|h|:00)/);
      let hour = 10; // Default to 10
      if (hourMatch && hourMatch[1]) {
        hour = parseInt(hourMatch[1], 10);
      }
      
      date.setHours(hour, 0, 0, 0);
      
      const startStr = date.toISOString().split('.')[0];
      const endStr = new Date(date.getTime() + 60 * 60 * 1000).toISOString().split('.')[0];
      
      this.agendaService.addEvent({
        title: `Agendamento via IA: ${text}`,
        start: startStr,
        end: endStr,
        backgroundColor: '#f43f5e'
      });
      
      this.messages.push({
        role: 'assistant',
        content: `Entendido! Agendei um evento para o dia ${date.toLocaleDateString('pt-BR')} às ${hour}h.`,
        timestamp: new Date()
      });
      
      // Navigate to calendar if not there
      this.router.navigate(['/admin/agenda']);
      
    } else if (lowerText.includes('cancelar')) {
       // Just a demo answer
       this.messages.push({
        role: 'assistant',
        content: 'Para cancelar um agendamento, navegue até a sua agenda clicando no evento e confirme a exclusão.',
        timestamp: new Date()
      });
    } else if (lowerText.includes('fechar') || lowerText.includes('sair')) {
      this.isOpen = false;
    } else {
      this.messages.push({
        role: 'assistant',
        content: 'Desculpe, ainda estou aprendendo. Você pode me pedir para agendar horários, como: "Agendar um corte amanhã às 15 horas".',
        timestamp: new Date()
      });
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.drawer-body');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }, 50);
  }
}
