import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { ContentListComponent } from "./content-list.component";

describe("ContentListComponent", () => {
  let fixture: ComponentFixture<ContentListComponent>;
  let component: ContentListComponent;

  const mockItems = [
    { id: 1, title: "First Post", status: "draft" as const },
    { id: 2, title: "Second Post", status: "published" as const },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ContentListComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("items", mockItems);
    fixture.detectChanges();
  });

  it("renders list items from input", () => {
    const listItems = fixture.debugElement.queryAll(By.css("li"));
    expect(listItems.length).toBe(2);
    expect(listItems[0].nativeElement.textContent).toContain("First Post");
    expect(listItems[1].nativeElement.textContent).toContain("Second Post");
  });

  it("Open button emits item id", () => {
    const openSpy = jasmine.createSpy("openSpy");
    component.open.subscribe(openSpy);

    const openButtons = fixture.debugElement.queryAll(By.css("button")).filter(
      (btn) => btn.nativeElement.textContent.trim() === "Open",
    );

    openButtons[0].nativeElement.click();

    expect(openSpy).toHaveBeenCalledWith(1);
  });

  it("PublishToggle button shows Publish for draft items", () => {
    const listItems = fixture.debugElement.queryAll(By.css("li"));
    const firstItemButtons = listItems[0].queryAll(By.css("button"));
    const toggleButton = firstItemButtons.find(
      (btn) =>
        btn.nativeElement.textContent.trim() === "Publish" ||
        btn.nativeElement.textContent.trim() === "Draft",
    );

    expect(toggleButton?.nativeElement.textContent.trim()).toBe("Publish");
  });

  it("PublishToggle button shows Draft for published items", () => {
    const listItems = fixture.debugElement.queryAll(By.css("li"));
    const secondItemButtons = listItems[1].queryAll(By.css("button"));
    const toggleButton = secondItemButtons.find(
      (btn) =>
        btn.nativeElement.textContent.trim() === "Publish" ||
        btn.nativeElement.textContent.trim() === "Draft",
    );

    expect(toggleButton?.nativeElement.textContent.trim()).toBe("Draft");
  });

  it("PublishToggle emits item id on click", () => {
    const publishToggleSpy = jasmine.createSpy("publishToggleSpy");
    component.publishToggle.subscribe(publishToggleSpy);

    const listItems = fixture.debugElement.queryAll(By.css("li"));
    const firstItemButtons = listItems[0].queryAll(By.css("button"));
    const toggleButton = firstItemButtons.find(
      (btn) =>
        btn.nativeElement.textContent.trim() === "Publish" ||
        btn.nativeElement.textContent.trim() === "Draft",
    );

    toggleButton?.nativeElement.click();

    expect(publishToggleSpy).toHaveBeenCalledWith(1);
  });
});
