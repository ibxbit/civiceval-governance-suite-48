import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Observable, of, throwError } from "rxjs";

import { AuthService } from "../../services/auth.service";
import { ApiService } from "../../services/api.service";
import { ModerationQueuePageComponent } from "./moderation-queue-page.component";

describe("ModerationQueuePageComponent", () => {
  let fixture: ComponentFixture<ModerationQueuePageComponent>;
  let component: ModerationQueuePageComponent;
  let api: jasmine.SpyObj<ApiService>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>("ApiService", ["get", "post"]);
    auth = jasmine.createSpyObj<AuthService>("AuthService", ["getCurrentUserSnapshot"]);
    auth.getCurrentUserSnapshot.and.returnValue({ id: 2, username: "rev", role: "reviewer" });

    api.get.and.callFake(<T>(path: string): Observable<T> => {
      if (path === "/moderation/comments") {
        return of({ data: [{ id: 1, body: "test", status: "pending", pinned: false }] }) as unknown as Observable<T>;
      }
      if (path === "/moderation/reports") {
        return of({ data: [{ id: 1, commentId: 1, reason: "spam", details: null }] }) as unknown as Observable<T>;
      }
      if (path === "/moderation/qna") {
        return of({ data: [{ id: 3, questionText: "question", answerText: null, status: "pending", pinned: false }] }) as unknown as Observable<T>;
      }
      if (path === "/moderation/qna/reports") {
        return of({ data: [{ id: 4, qnaId: 3, reason: "abuse", details: null }] }) as unknown as Observable<T>;
      }
      return of({ data: [] }) as unknown as Observable<T>;
    });
    api.post.and.returnValue(of({ success: true }));

    await TestBed.configureTestingModule({
      imports: [ModerationQueuePageComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModerationQueuePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("loads moderation comments and reports", () => {
    expect((component as any).comments.length).toBe(1);
    expect((component as any).reports.length).toBe(1);
    expect((component as any).qnaEntries.length).toBe(1);
    expect((component as any).qnaReports.length).toBe(1);
  });

  it("executes moderation actions and reloads", () => {
    (component as any).approve(1);
    (component as any).pin(1);
    (component as any).block(1);
    (component as any).handleReport(1, "dismiss");
    (component as any).approveQna(3);
    (component as any).pinQna(3);
    (component as any).blockQna(3);
    (component as any).handleQnaReport(4, "approve");

    expect(api.post).toHaveBeenCalledWith("/moderation/comments/1/approve");
    expect(api.post).toHaveBeenCalledWith("/moderation/comments/1/pin", { pinned: true });
    expect(api.post).toHaveBeenCalledWith("/moderation/comments/1/block");
    expect(api.post).toHaveBeenCalledWith("/moderation/reports/1/handle", { action: "dismiss" });
    expect(api.post).toHaveBeenCalledWith("/moderation/qna/3/approve");
    expect(api.post).toHaveBeenCalledWith("/moderation/qna/3/pin", { pinned: true });
    expect(api.post).toHaveBeenCalledWith("/moderation/qna/3/block");
    expect(api.post).toHaveBeenCalledWith("/moderation/qna/reports/4/handle", { action: "approve" });
  });

  it("shows errors when moderation requests fail", () => {
    api.post.and.returnValue(throwError(() => ({ status: 500 })));
    (component as any).approve(1);
    expect((component as any).errorMessage).toContain("Approve action failed");
  });
});
