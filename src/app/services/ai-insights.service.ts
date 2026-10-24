import { Injectable, inject } from '@angular/core';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class AiInsightsService {
  private notifications=inject(NotificationService);
  /** Redirect callers to a source-backed analysis; never manufacture insights from incomplete in-memory arrays. */
  generateInstantInsight(_context:string) {
    this.notifications.addNotification({
      type:'AI_INSIGHT',
      title:'Inteligência baseada em dados',
      message:'Abra o Intelligence Hub para consultar os indicadores reais do estabelecimento. Nenhuma recomendação foi calculada nesta notificação.',
      action:{label:'Ver análise',link:'/admin/intelligence'}
    });
  }
}
