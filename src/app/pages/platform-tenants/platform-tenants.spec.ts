import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlatformTenants } from './platform-tenants';

describe('PlatformTenants', () => {
  let component: PlatformTenants;
  let fixture: ComponentFixture<PlatformTenants>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformTenants],
    }).compileComponents();

    fixture = TestBed.createComponent(PlatformTenants);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
