import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlatformLayout } from './platform-layout';

describe('PlatformLayout', () => {
  let component: PlatformLayout;
  let fixture: ComponentFixture<PlatformLayout>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformLayout],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformLayout);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
