import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { GeosearchComponent } from './geosearch.component';

describe('GeosearchComponent', () => {
  let component: GeosearchComponent;
  let fixture: ComponentFixture<GeosearchComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ GeosearchComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(GeosearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
