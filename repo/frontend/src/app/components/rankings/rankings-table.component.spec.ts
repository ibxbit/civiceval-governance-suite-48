import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { RankingsTableComponent } from "./rankings-table.component";

describe("RankingsTableComponent", () => {
  let fixture: ComponentFixture<RankingsTableComponent>;
  let component: RankingsTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankingsTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RankingsTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("rankings", [
      {
        id: 1,
        subjectKey: "CITY-1",
        benchmark: 90,
        price: 70,
        volatility: 10,
        weights: {
          benchmark: 40,
          price: 30,
          volatility: 30,
        },
        score: 67,
      },
    ]);
    fixture.componentRef.setInput("expandedId", 1);
    fixture.detectChanges();
  });

  it("renders score row", () => {
    const rows = fixture.debugElement.queryAll(By.css("tbody tr"));

    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.textContent).toContain("CITY-1");
    expect(rows[0].nativeElement.textContent).toContain("67");
  });

  it("emits explain event when button clicked", () => {
    const explainSpy = jasmine.createSpy("explainSpy");
    component.explain.subscribe(explainSpy);

    const button = fixture.debugElement.query(By.css("button"));
    button.nativeElement.click();

    expect(explainSpy).toHaveBeenCalledWith(1);
  });
});
