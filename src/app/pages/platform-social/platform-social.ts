import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-platform-social',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './platform-social.html',
  styleUrls: ['./platform-social.css']
})
export class PlatformSocial implements OnInit {
  isZernioConnected = true;
  queue: any[] = [];
  
  stats = {
    scheduled: 145,
    publishedToday: 32,
    failed: 3
  };

  ngOnInit() {
    this.generateMockQueue();
  }

  generateMockQueue() {
    const tenants = ['Barbearia do João', 'Tattoo Studio', 'Spa Zen'];
    const platforms = ['instagram', 'facebook', 'tiktok'];
    const statuses = ['scheduled', 'published', 'failed'];
    
    for (let i = 0; i < 8; i++) {
      this.queue.push({
        id: `post-${i}`,
        tenant: tenants[Math.floor(Math.random() * tenants.length)],
        platform: platforms[Math.floor(Math.random() * platforms.length)],
        scheduledFor: new Date(Date.now() + Math.random() * 86400000),
        status: i === 2 ? 'failed' : statuses[Math.floor(Math.random() * 2)],
        content: `Confira nossos serviços especiais e agende seu horário...`
      });
    }
  }

  retryPost(id: string) {
    const post = this.queue.find(p => p.id === id);
    if (post) {
      post.status = 'scheduled';
      this.stats.failed = Math.max(0, this.stats.failed - 1);
      this.stats.scheduled++;
    }
  }
}
