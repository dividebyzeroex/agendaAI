import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UsageQuota {
  tokensUsed: number;
  tokensLimit: number;
  smsUsed: number;
  smsLimit: number;
}

@Injectable({
  providedIn: 'root'
})
export class CostTrackerService {
  private quotaSubject = new BehaviorSubject<UsageQuota>({
    tokensUsed: 12500,
    tokensLimit: 50000,
    smsUsed: 42,
    smsLimit: 100
  });

  quota$ = this.quotaSubject.asObservable();

  constructor() { }

  getQuota(): UsageQuota {
    return this.quotaSubject.getValue();
  }

  // Record LLM API usage
  trackTokens(amount: number) {
    const current = this.getQuota();
    this.quotaSubject.next({
      ...current,
      tokensUsed: current.tokensUsed + amount
    });
  }

  // Record an SMS send event
  trackSms(amount: number = 1) {
    const current = this.getQuota();
    this.quotaSubject.next({
      ...current,
      smsUsed: current.smsUsed + amount
    });
  }
}
