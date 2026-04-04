import { Component, HostListener, inject, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AgendaEventService } from '../../services/agenda-event.service';

interface CommandItem {
  icon: string;
  name: string;
  action: () => void;
  category: string;
}

@Component({
  selector: 'app-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="palette-backdrop" *ngIf="isOpen" (click)="close()">
      <div class="palette-container" (click)="$event.stopPropagation()">
        <div class="palette-header">
          <i class="pi pi-search search-icon"></i>
          <input 
            #searchInput
            type="text" 
            [(ngModel)]="searchQuery" 
            (ngModelChange)="filterCommands()"
            (keydown)="handleKeydown($event)"
            placeholder="Type a command or search... (e.g. 'agenda')" 
            class="search-input"
          />
          <div class="esc-hint">esc</div>
        </div>
        <div class="palette-body">
          <ng-container *ngFor="let category of filteredCategories">
            <div class="category-name">{{ category }}</div>
            <div 
              class="command-item" 
              *ngFor="let cmd of groupedCommands[category]; let i = index"
              [class.active]="isSelected(cmd)"
              (click)="executeCommand(cmd)"
              (mouseenter)="selectedIndex = getFlatIndex(cmd)"
            >
              <i [class]="'pi ' + cmd.icon + ' cmd-icon'"></i>
              <span class="cmd-name">{{ cmd.name }}</span>
            </div>
          </ng-container>
          <div class="no-results" *ngIf="flatFilteredCommands.length === 0">
            No commands found for "{{searchQuery}}"
          </div>
        </div>
        <div class="palette-footer">
          <span class="footer-hint"><i class="pi pi-arrow-up"></i><i class="pi pi-arrow-down"></i> to navigate</span>
          <span class="footer-hint"><i class="pi pi-check"></i> enter to select</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .palette-backdrop {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px);
      z-index: 9999; display: flex; justify-content: center; align-items: flex-start;
      padding-top: 12vh;
      animation: fadeIn 0.15s ease-out;
    }
    .palette-container {
      width: 100%; max-width: 600px;
      background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px);
      border-radius: 16px; border: 1px solid rgba(255,255,255,0.4);
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      overflow: hidden; display: flex; flex-direction: column;
      animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .palette-header {
      display: flex; align-items: center; padding: 16px 20px;
      border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    .search-icon { color: #64748b; font-size: 1.25rem; margin-right: 12px; }
    .search-input {
      flex: 1; border: none; background: transparent; font-size: 1.15rem;
      color: #1e293b; outline: none; padding: 4px 0;
    }
    .search-input::placeholder { color: #94a3b8; }
    .esc-hint {
      font-size: 0.75rem; color: #64748b; background: rgba(0,0,0,0.05);
      padding: 4px 8px; border-radius: 6px; font-weight: 600; text-transform: uppercase;
    }
    .palette-body { max-height: 350px; overflow-y: auto; padding: 12px 0; }
    .category-name {
      padding: 8px 20px; font-size: 0.75rem; font-weight: 600;
      text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em;
    }
    .command-item {
      display: flex; align-items: center; padding: 12px 20px; cursor: pointer;
      color: #334155; transition: all 0.1s ease; margin: 0 8px; border-radius: 8px;
    }
    .command-item.active { background: #3b82f6; color: white; }
    .command-item.active .cmd-icon { color: white; }
    .cmd-icon {
      font-size: 1.1rem; width: 24px; color: #64748b; text-align: center; margin-right: 12px;
    }
    .cmd-name { font-weight: 500; font-size: 0.95rem; }
    .no-results { padding: 32px 20px; text-align: center; color: #64748b; font-size: 0.95rem; }
    .palette-footer {
      padding: 12px 20px; border-top: 1px solid rgba(0,0,0,0.08);
      display: flex; gap: 16px; background: rgba(248,250,252,0.8);
    }
    .footer-hint { font-size: 0.75rem; color: #64748b; display: flex; align-items: center; gap: 4px; }
    .footer-hint i { font-size: 0.7rem; }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideDown { from { opacity: 0; transform: translateY(-15px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  `]
})
export class CommandPaletteComponent implements AfterViewInit {
  @ViewChild('searchInput') searchInput!: ElementRef;
  
  isOpen = false;
  searchQuery = '';
  selectedIndex = 0;
  
  router = inject(Router);
  agendaService = inject(AgendaEventService);

  commands: CommandItem[] = [
    // ─── NAVEGAÇÃO ───────────────────────────────────────────────────────────
    { name: 'Ir para Dashboard', icon: 'pi-home', category: 'Navegação', action: () => this.goto('/admin') },
    { name: 'Ir para Minha Agenda', icon: 'pi-calendar', category: 'Navegação', action: () => this.goto('/admin/agenda') },
    { name: 'Ir para Gestão de Clientes', icon: 'pi-users', category: 'Navegação', action: () => this.goto('/admin/clientes') },
    { name: 'Ir para Equipe / Profissionais', icon: 'pi-user-edit', category: 'Navegação', action: () => this.goto('/admin/profissionais') },
    { name: 'Ir para Analytics / Inteligência AI', icon: 'pi-chart-bar', category: 'Navegação', action: () => this.goto('/admin/analytics') },
    { name: 'Ir para Financeiro / Faturamento', icon: 'pi-wallet', category: 'Navegação', action: () => this.goto('/admin/billing') },
    { name: 'Ir para Configurações', icon: 'pi-cog', category: 'Navegação', action: () => this.goto('/admin/configuracoes') },
    
    // ─── AÇÕES RÁPIDAS ───────────────────────────────────────────────────────
    { name: 'Novo Agendamento Rápido', icon: 'pi-plus-circle', category: 'Ações Rápidas', action: () => this.createQuickEvent() },
    { name: 'Cadastrar Novo Cliente', icon: 'pi-user-plus', category: 'Ações Rápidas', action: () => this.goto('/admin/clientes') },
    { name: 'Cadastrar Novo Profissional', icon: 'pi-id-card', category: 'Ações Rápidas', action: () => this.goto('/admin/profissionais') },
    
    // ─── SISTEMA ─────────────────────────────────────────────────────────────
    { name: 'Visualizar Página Pública (Agendamento)', icon: 'pi-external-link', category: 'Sistema', action: () => this.goto('/') },
    { name: 'Atendimento e Suporte', icon: 'pi-question-circle', category: 'Sistema', action: () => alert('Suporte AgendaAi: contato@agenda.ai') },
    { name: 'Sair / Logout', icon: 'pi-sign-out', category: 'Sistema', action: () => this.logout() }
  ];

  logout() {
    localStorage.removeItem('ag-mock-user');
    this.goto('/login');
  }

  flatFilteredCommands: CommandItem[] = [];
  groupedCommands: Record<string, CommandItem[]> = {};
  filteredCategories: string[] = [];

  constructor() {
    this.filterCommands();
  }

  ngAfterViewInit() {
    if (this.isOpen && this.searchInput) {
      setTimeout(() => this.searchInput.nativeElement.focus(), 50);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalKeydown(event: KeyboardEvent) {
    // Ctrl+K or Cmd+K
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      this.toggle();
    }
    if (event.key === 'Escape' && this.isOpen) {
      this.close();
    }
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.searchQuery = '';
      this.filterCommands();
      setTimeout(() => this.searchInput?.nativeElement.focus(), 50);
    }
  }

  close() {
    this.isOpen = false;
  }

  goto(path: string) {
    this.router.navigate([path]);
    this.close();
  }

  createQuickEvent() {
    this.close();
    setTimeout(() => {
      const title = prompt('Command: Novo Agendamento. Qual o nome/serviço?');
      if (title) {
        const now = new Date();
        const start = now.toISOString().split('.')[0];
        const end = new Date(now.getTime() + 60 * 60 * 1000).toISOString().split('.')[0];
        
        this.agendaService.addEvent({
          title: '[Rápido] ' + title,
          start: start,
          end: end,
          backgroundColor: '#8b5cf6'
        });
        this.goto('/admin/agenda');
      }
    }, 100);
  }

  filterCommands() {
    const q = this.searchQuery.toLowerCase();
    this.flatFilteredCommands = this.commands.filter(c => 
      c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );
    
    this.groupedCommands = {};
    for (const cmd of this.flatFilteredCommands) {
      if (!this.groupedCommands[cmd.category]) {
        this.groupedCommands[cmd.category] = [];
      }
      this.groupedCommands[cmd.category].push(cmd);
    }
    this.filteredCategories = Object.keys(this.groupedCommands);
    
    this.selectedIndex = 0; // reset selection
  }

  getFlatIndex(cmd: CommandItem): number {
    return this.flatFilteredCommands.indexOf(cmd);
  }

  isSelected(cmd: CommandItem): boolean {
    return this.getFlatIndex(cmd) === this.selectedIndex;
  }

  handleKeydown(event: KeyboardEvent) {
    if (!this.isOpen) return;
    
    const max = this.flatFilteredCommands.length - 1;
    if (max < 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.selectedIndex = this.selectedIndex < max ? this.selectedIndex + 1 : 0;
      this.scrollToSelected();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.selectedIndex = this.selectedIndex > 0 ? this.selectedIndex - 1 : max;
      this.scrollToSelected();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = this.flatFilteredCommands[this.selectedIndex];
      if (selected) {
        this.executeCommand(selected);
      }
    }
  }

  scrollToSelected() {
    // Basic DOM scroll manipulation can be done, but for simplicity we skip it 
    // unless the list grows extremely long.
    const activeEl = document.querySelector('.command-item.active');
    if (activeEl) {
       activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  executeCommand(cmd: CommandItem) {
    cmd.action();
  }
}
