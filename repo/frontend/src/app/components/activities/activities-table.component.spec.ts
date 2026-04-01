import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { ActivitiesTableComponent } from "./activities-table.component";

describe("ActivitiesTableComponent", () => {
  let fixture: ComponentFixture<ActivitiesTableComponent>;
  let component: ActivitiesTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivitiesTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivitiesTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("activities", [
      {
        id: 101,
        title: "Neighborhood Forum",
        participationType: "individual",
        startsAt: "2026-03-01T10:00:00.000Z",
        endsAt: "2026-03-01T11:00:00.000Z",
      },
    ]);
    fixture.detectChanges();
  });

  it("renders activity row content", () => {
    const row = fixture.debugElement.query(By.css("tbody tr"));

    expect(row.nativeElement.textContent).toContain("Neighborhood Forum");
    expect(row.nativeElement.textContent).toContain("individual");
  });

  it("emits selected id when details is clicked", () => {
    const selectedSpy = jasmine.createSpy("selectedSpy");
    component.selected.subscribe(selectedSpy);

    const detailsButton = fixture.debugElement.query(By.css("button"));
    detailsButton.nativeElement.click();

    expect(selectedSpy).toHaveBeenCalledWith(101);
  });
});
