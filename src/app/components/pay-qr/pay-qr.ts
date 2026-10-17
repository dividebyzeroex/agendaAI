import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { qrcodegen } from '../../utils/vendor/qrcodegen';

@Component({
  selector: 'app-pay-qr',
  standalone: true,
  template: `
    <div class="express-qr" [attr.aria-label]="label">
      <canvas #canvas [style.width.px]="size" [style.height.px]="size"
        role="img" [attr.aria-label]="label"></canvas>
    </div>
  `,
  styles: [`
    :host { display: inline-flex; justify-content: center; max-width: 100%; }
    .express-qr { background: #fff; border: 1px solid #ede7f5; border-radius: 18px; padding: 12px; box-shadow: 0 12px 35px rgba(30,12,63,.07); }
    canvas { display: block; max-width: min(100%, 70vw); height: auto !important; image-rendering: pixelated; }
  `]
})
export class PayQrComponent implements AfterViewInit, OnChanges {
  @Input() value = '';
  @Input() size = 204;
  @Input() label = 'QR Code da comanda: escaneie para abrir o pagamento';
  @ViewChild('canvas', {static: true}) canvas!: ElementRef<HTMLCanvasElement>;

  ngAfterViewInit(): void { this.render(); }
  ngOnChanges(): void { if (this.canvas) this.render(); }

  private render(): void {
    if (!this.canvas || !this.value) return;
    const qr = qrcodegen.QrCode.encodeText(this.value, qrcodegen.QrCode.Ecc.MEDIUM);
    const border = 4;
    const side = qr.size + border * 2;
    const canvas = this.canvas.nativeElement;
    // Use one exact canvas pixel per QR module; CSS scales sharply on retina devices.
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, side, side);
    context.fillStyle = '#211335';
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) context.fillRect(x + border, y + border, 1, 1);
      }
    }
  }
}
