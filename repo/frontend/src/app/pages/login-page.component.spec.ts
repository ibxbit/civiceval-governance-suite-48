import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { of, throwError } from "rxjs";

import { AuthService } from "../services/auth.service";
import { LoginPageComponent } from "./login-page.component";

describe("LoginPageComponent", () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let component: LoginPageComponent;
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>("AuthService", ["login", "register"]);
    auth.login.and.returnValue(of({ accessToken: "t", user: { id: 1, username: "u", role: "participant" } }));
    auth.register.and.returnValue(of({ user: { id: 2, username: "new", role: "participant" } }));
    router = jasmine.createSpyObj<Router>("Router", ["navigateByUrl"]);
    router.navigateByUrl.and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("submits login and navigates", () => {
    (component as any).form.setValue({ username: "alice", password: "Admin@12345678" });
    (component as any).onSubmit();

    expect(auth.login).toHaveBeenCalledWith("alice", "Admin@12345678");
    expect(router.navigateByUrl).toHaveBeenCalledWith("/activities");
  });

  it("supports registration mode and calls register", () => {
    (component as any).toggleMode();
    (component as any).form.setValue({ username: "new-user", password: "Admin@12345678" });
    (component as any).onSubmit();

    expect(auth.register).toHaveBeenCalledWith("new-user", "Admin@12345678");
    expect((component as any).isRegisterMode).toBeFalse();
    expect((component as any).errorMessage).toContain("Registration successful");
  });

  it("shows invalid credentials error on login failure", () => {
    auth.login.and.returnValue(throwError(() => ({ status: 401 })));
    (component as any).form.setValue({ username: "alice", password: "wrong" });
    (component as any).onSubmit();

    expect((component as any).errorMessage).toContain("Invalid username or password");
  });
});
