import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { AgendaEventService, AgendaEvent } from '../../services/agenda-event.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ButtonModule, CardModule, TableModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.css']
})
export class Admin implements OnInit {
  private agendaService = inject(AgendaEventService);

  todayAppointments: AgendaEvent[] = [];
  totalToday = 0;
  revenue = 0;
  isLoading = true;

  ngOnInit() {
    this.agendaService.events$.subscribe(events => {
      const todayStr = new Date().toISOString().split('T')[0];
      this.todayAppointments = events.filter(e => e.start.startsWith(todayStr));
      this.totalToday = this.todayAppointments.length;
      this.revenue = this.totalToday * 120; // R$120 avg ticket
      this.isLoading = false;
    });
  }

  getStatusClass(status: string): string {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('confirm')) return 'confirmado';
    if (s.includes('cancel')) return 'cancelado';
    return 'aguardando';
  }
}
