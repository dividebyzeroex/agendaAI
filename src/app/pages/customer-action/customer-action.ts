import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BusinessService } from '../../services/business.service';
@Component({
  selector: 'app-customer-action',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: ` <main>
    <span class="brand">agendaAI</span>
    <p *ngIf="loading()" role="status">Conferindo seu link…</p>
    <div *ngIf="!loading()">
      <h1>
        {{
          done()
            ? 'Obrigado!'
            : unsubscribe
              ? 'Parar de receber mensagens?'
              : checkin
                ? 'Já chegou?'
                : 'Como foi seu atendimento?'
        }}
      </h1>
      <p *ngIf="name() && !done()">{{ name() }}</p>
      <p *ngIf="done()">
        {{
          unsubscribe
            ? 'Sua preferência foi atualizada. Você não receberá novas campanhas deste estabelecimento neste canal.'
            : checkin
              ? 'Sua chegada foi registrada. Aguarde a equipe chamar você.'
              : 'Sua avaliação foi recebida e ajuda o estabelecimento a melhorar.'
        }}
      </p>
      <p *ngIf="error()" role="alert">{{ error() }}</p>
      <form *ngIf="!done() && !checkin && !unsubscribe && available()" (ngSubmit)="submit()">
        <fieldset>
          <legend>De 1 (ruim) a 5 (excelente)</legend>
          <div class="ratings">
            <label *ngFor="let n of [1, 2, 3, 4, 5]" [class.selected]="rating === n"
              ><input type="radio" name="rating" [value]="n" [(ngModel)]="rating" required />{{
                n
              }}</label
            >
          </div>
        </fieldset>
        <label class="comment"
          >Quer contar mais? (opcional)<textarea
            name="comment"
            [(ngModel)]="comment"
            maxlength="2000"
            rows="4"
          ></textarea></label
        ><button [disabled]="busy() || !rating">
          {{ busy() ? 'Enviando…' : 'Enviar avaliação' }}</button
        ><small>Seu comentário é privado para a gestão do estabelecimento.</small>
      </form>
      <button
        type="button"
        *ngIf="(checkin || unsubscribe) && !done()"
        (click)="submit()"
        [disabled]="busy()"
      >
        {{
          busy()
            ? 'Registrando…'
            : unsubscribe
              ? 'Parar de receber mensagens'
              : 'Confirmar minha chegada'
        }}
      </button>
    </div>
  </main>`,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        background: #f8fafc;
        padding: 40px 20px;
        color: #172033;
      }
      main {
        max-width: 480px;
        margin: 0 auto;
      }
      .brand {
        display: inline-block;
        color: #655cf0;
        font-weight: 700;
        margin-bottom: 48px;
        font-size: 1.3rem;
      }
      h1 {
        font-size: 1.9rem;
        letter-spacing: -0.04em;
        margin: 0 0 16px;
      }
      p {
        line-height: 1.7;
        color: #64748b;
      }
      fieldset {
        border: 0;
        padding: 0;
        margin: 28px 0;
      }
      legend,
      .comment {
        font-size: 0.9rem;
        color: #475569;
      }
      .ratings {
        display: flex;
        gap: 12px;
        margin-top: 16px;
      }
      .ratings label {
        flex: 1;
        min-height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        cursor: pointer;
        position: relative;
      }
      .ratings input {
        position: absolute;
        opacity: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
      }
      .ratings .selected {
        background: #ede9fe;
        border-color: #655cf0;
        color: #4338ca;
      }
      .ratings label:focus-within {
        outline: 3px solid #a5b4fc;
        outline-offset: 2px;
      }
      .comment {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 12px;
        font: inherit;
        resize: vertical;
      }
      button {
        display: block;
        width: 100%;
        min-height: 48px;
        background: #655cf0;
        border: 0;
        border-radius: 10px;
        color: white;
        font: inherit;
        font-weight: 600;
        margin-top: 24px;
        padding: 12px;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
      }
      small {
        display: block;
        color: #64748b;
        font-size: 0.8rem;
        line-height: 1.6;
        margin-top: 20px;
      }
      [role='alert'] {
        background: #fff1f2;
        color: #9f1239;
        padding: 16px;
        border-radius: 10px;
      }
    `,
  ],
})
export class CustomerAction implements OnInit {
  private route = inject(ActivatedRoute);
  private service = inject(BusinessService);
  private token = this.route.snapshot.paramMap.get('token') || '';
  unsubscribe = this.route.snapshot.data['unsubscribe'] === true;
  checkin = this.route.snapshot.data['checkin'] === true;
  loading = signal(false);
  busy = signal(false);
  done = signal(false);
  error = signal('');
  name = signal('');
  available = signal(false);
  rating = 0;
  comment = '';
  async ngOnInit() {
    if (this.checkin || this.unsubscribe) return;
    this.loading.set(true);
    try {
      const d = await this.service.publicAction('feedback-info', this.token);
      this.done.set(d.received);
      this.name.set(d.name);
      this.available.set(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Link indisponível.');
    } finally {
      this.loading.set(false);
    }
  }
  async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.service.publicAction(
        this.unsubscribe ? 'unsubscribe' : this.checkin ? 'checkin' : 'feedback-submit',
        this.token,
        { rating: this.rating, comment: this.comment },
      );
      this.done.set(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      this.busy.set(false);
    }
  }
}
