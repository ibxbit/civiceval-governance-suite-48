import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { ContentEditorComponent } from "./content-editor.component";

describe("ContentEditorComponent", () => {
  let fixture: ComponentFixture<ContentEditorComponent>;
  let component: ContentEditorComponent;

  const mockItem = { id: 5, title: "My Article", richText: "<p>Hello</p>" };
  const mockVersions = [
    { versionNumber: 1, action: "created" },
    { versionNumber: 2, action: "edited" },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ContentEditorComponent);
    component = fixture.componentInstance;
  });

  it("does not render panel when selected is null", () => {
    fixture.componentRef.setInput("selected", null);
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css("section.panel"));
    expect(panel).toBeNull();
  });

  it("renders title and textarea when selected has value", () => {
    fixture.componentRef.setInput("selected", mockItem);
    fixture.componentRef.setInput("versions", []);
    fixture.detectChanges();

    const heading = fixture.debugElement.query(By.css("h2"));
    const textarea = fixture.debugElement.query(By.css("textarea"));

    expect(heading.nativeElement.textContent).toContain("My Article");
    expect(textarea).toBeTruthy();
    expect(textarea.nativeElement.value).toBe("<p>Hello</p>");
  });

  it("Save button emits save event", () => {
    fixture.componentRef.setInput("selected", mockItem);
    fixture.componentRef.setInput("versions", []);
    fixture.detectChanges();

    const saveSpy = jasmine.createSpy("saveSpy");
    component.save.subscribe(saveSpy);

    const saveButton = fixture.debugElement
      .queryAll(By.css("button"))
      .find((btn) =>
        String(btn.nativeElement.textContent).includes("Save Draft"),
      );

    saveButton?.nativeElement.click();

    expect(saveSpy).toHaveBeenCalled();
  });

  it("Rollback button emits version number", () => {
    fixture.componentRef.setInput("selected", mockItem);
    fixture.componentRef.setInput("versions", mockVersions);
    fixture.detectChanges();

    const rollbackSpy = jasmine.createSpy("rollbackSpy");
    component.rollback.subscribe(rollbackSpy);

    const rollbackButtons = fixture.debugElement
      .queryAll(By.css("button"))
      .filter((btn) =>
        String(btn.nativeElement.textContent).includes("Rollback"),
      );

    rollbackButtons[0].nativeElement.click();

    expect(rollbackSpy).toHaveBeenCalledWith(1);
  });

  it("renders version list", () => {
    fixture.componentRef.setInput("selected", mockItem);
    fixture.componentRef.setInput("versions", mockVersions);
    fixture.detectChanges();

    const versionItems = fixture.debugElement.queryAll(By.css("ul li"));
    expect(versionItems.length).toBe(2);
    expect(versionItems[0].nativeElement.textContent).toContain("v1");
    expect(versionItems[0].nativeElement.textContent).toContain("created");
    expect(versionItems[1].nativeElement.textContent).toContain("v2");
    expect(versionItems[1].nativeElement.textContent).toContain("edited");
  });
});
