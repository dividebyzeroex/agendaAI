import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { injectSpeedInsights } from '@vercel/speed-insights';

injectSpeedInsights({
  beforeSend: (event) => {
    const u = new URL(event.url);
    return /^\/(minha-area|clube|comanda|avaliar|preferencias|checkin)\//.test(u.pathname) ||
      u.searchParams.has('portal')
      ? null
      : event;
  },
});

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
