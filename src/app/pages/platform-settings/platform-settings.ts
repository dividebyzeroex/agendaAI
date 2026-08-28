import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-platform-settings',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-settings.html',
  styleUrls: ['./platform-settings.css']
})
export class PlatformSettings {
  keys = [
    { name: 'Stripe Secret Key', value: 'sk_live_51P...', masked: true, env: 'STRIPE_SECRET_KEY' },
    { name: 'Zernio Access Token', value: 'z_token_8x...', masked: true, env: 'ZERNIO_ACCESS_TOKEN' },
    { name: 'Supabase Service Role', value: 'eyJhbGciOiJ...', masked: true, env: 'SUPABASE_SERVICE_ROLE_KEY' },
    { name: 'OpenAI API Key', value: 'sk-proj-49...', masked: true, env: 'OPENAI_API_KEY' }
  ];

  toggles = {
    aiGloballyEnabled: true,
    socialPostingEnabled: true,
    maintenanceMode: false
  };

  toggleMask(index: number) {
    this.keys[index].masked = !this.keys[index].masked;
  }

  toggleSwitch(key: keyof typeof this.toggles) {
    this.toggles[key] = !this.toggles[key];
  }
}
