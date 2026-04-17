import { ComponentFixture, TestBed } from "@angular/core/testing";
import { RouterModule } from "@angular/router";
import { By } from "@angular/platform-browser";

import { AppComponent } from "./app.component";

describe("AppComponent", () => {
  let fixture: ComponentFixture<AppComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
  });

  it("component creates successfully", () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it("contains router-outlet element", () => {
    const routerOutlet = fixture.debugElement.query(By.css("router-outlet"));
    expect(routerOutlet).toBeTruthy();
  });
});
