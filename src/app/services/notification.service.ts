import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'INFO' | 'WARNING' | 'SUCCESS' | 'AI_INSIGHT';

export interface NotificationAction {
  label: string;
  link?: string;
  command?: () => void;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  action?: NotificationAction;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private notificationsSource = new BehaviorSubject<AppNotification[]>([]);
  notifications$ = this.notificationsSource.asObservable();

  constructor() {
    // Carrega notificações iniciais (mock)
    this.addNotification({
      type: 'INFO',
      title: 'Bem-vindo ao Dashboard',
      message: 'Sua agenda está sincronizada e pronta para novos agendamentos.',
      action: { label: 'Ver Agenda', link: '/admin/agenda' }
    });
  }

  get notifications(): AppNotification[] {
    return this.notificationsSource.value;
  }

  get unreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  addNotification(n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) {
    const newNotif: AppNotification = {
      ...n,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      read: false
    };
    this.notificationsSource.next([newNotif, ...this.notifications]);
  }

  markAsRead(id: string) {
    const updated = this.notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    );
    this.notificationsSource.next(updated);
  }

  markAllAsRead() {
    const updated = this.notifications.map(n => ({ ...n, read: true }));
    this.notificationsSource.next(updated);
  }

  remove(id: string) {
    this.notificationsSource.next(this.notifications.filter(n => n.id !== id));
  }
}
