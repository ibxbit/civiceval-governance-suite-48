import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Observable, of, throwError } from "rxjs";

import { ContentLibraryPageComponent } from "./content-library-page.component";
import { ApiService } from "../services/api.service";

describe("ContentLibraryPageComponent", () => {
  let fixture: ComponentFixture<ContentLibraryPageComponent>;
  let component: ContentLibraryPageComponent;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>("ApiService", ["get", "post", "put"]);
    api.get.and.callFake(<T>(path: string): Observable<T> => {
      if (path === "/cms/content") {
        return of({
          data: [{ id: 10, title: "Draft 1", richText: "text", status: "draft", versionNumber: 1 }],
        }) as unknown as Observable<T>;
      }
      if (path === "/cms/content/10") {
        return of({ id: 10, title: "Draft 1", richText: "text", status: "draft", versionNumber: 1 }) as unknown as Observable<T>;
      }
      if (path === "/cms/content/10/versions") {
        return of({ versions: [{ versionNumber: 1, action: "create" }] }) as unknown as Observable<T>;
      }
      return of({ data: [] }) as unknown as Observable<T>;
    });
    api.post.and.returnValue(of({ id: 5, token: "abc" }));
    api.put.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [ContentLibraryPageComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(ContentLibraryPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("creates content draft and reloads", () => {
    (component as any).form.setValue({ title: "New", richText: "Body", fileIdsRaw: "" });
    (component as any).create();

    expect(api.post).toHaveBeenCalledWith("/cms/content", jasmine.any(Object));
    expect(api.get).toHaveBeenCalledWith("/cms/content", jasmine.any(Object));
  });

  it("generates expiring secure asset link", () => {
    (component as any).shareForm.setValue({ fileId: 5, expiresInDays: 7 });
    (component as any).createAssetLink();

    expect(api.post).toHaveBeenCalledWith("/cms/files/5/link", { expiresInDays: 7 });
    expect((component as any).shareLink).toContain("/api/cms/files/access/");
  });

  it("captures upload failure and save failure states", () => {
    api.post.and.returnValue(throwError(() => ({ status: 500 })));
    (component as any).uploadDroppedFile(new File(["a"], "a.txt", { type: "text/plain" }));
    expect((component as any).error).toContain("Dropped file upload failed");

    api.put.and.returnValue(throwError(() => ({ status: 500 })));
    (component as any).selected = { id: 10, title: "Draft 1", richText: "text", status: "draft", versionNumber: 1 };
    (component as any).saveSelected();
    expect((component as any).error).toContain("Failed to save content");
  });
});
