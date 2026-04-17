import { of } from "rxjs";

import { AuthService } from "./auth.service";
import { ApiService } from "./api.service";

describe("AuthService", () => {
  let api: jasmine.SpyObj<ApiService>;

  const mockUser = { id: 1, username: "alice", role: "admin" as const };
  const mockToken = "test-token-abc";

  beforeEach(() => {
    localStorage.clear();
    api = jasmine.createSpyObj<ApiService>("ApiService", [
      "post",
      "get",
      "put",
      "delete",
    ]);
  });

  it("register calls api.post with correct path and payload", () => {
    api.post.and.returnValue(of({ user: mockUser }));
    const service = new AuthService(api);

    service.register("alice", "secret").subscribe();

    expect(api.post).toHaveBeenCalledWith("/auth/register", {
      username: "alice",
      password: "secret",
    });
  });

  it("login calls api.post with correct path and payload", () => {
    api.post.and.returnValue(
      of({ accessToken: mockToken, user: mockUser }),
    );
    const service = new AuthService(api);

    service.login("alice", "secret").subscribe();

    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      username: "alice",
      password: "secret",
    });
  });

  it("login persists token and user to localStorage", () => {
    api.post.and.returnValue(
      of({ accessToken: mockToken, user: mockUser }),
    );
    const setItemSpy = spyOn(localStorage, "setItem").and.callThrough();
    const service = new AuthService(api);

    service.login("alice", "secret").subscribe();

    expect(setItemSpy).toHaveBeenCalledWith("auth.token", mockToken);
    expect(setItemSpy).toHaveBeenCalledWith(
      "auth.user",
      JSON.stringify(mockUser),
    );
  });

  it("login updates currentUser$ observable", (done) => {
    api.post.and.returnValue(
      of({ accessToken: mockToken, user: mockUser }),
    );
    const service = new AuthService(api);

    service.login("alice", "secret").subscribe(() => {
      service.currentUser$.subscribe((user) => {
        expect(user).toEqual(mockUser);
        done();
      });
    });
  });

  it("logout calls api.post to logout endpoint", () => {
    api.post.and.returnValue(of({ success: true }));
    const service = new AuthService(api);

    service.logout().subscribe();

    expect(api.post).toHaveBeenCalledWith("/auth/logout");
  });

  it("logout clears localStorage", () => {
    localStorage.setItem("auth.token", mockToken);
    localStorage.setItem("auth.user", JSON.stringify(mockUser));
    api.post.and.returnValue(of({ success: true }));
    const removeItemSpy = spyOn(localStorage, "removeItem").and.callThrough();
    const service = new AuthService(api);

    service.logout().subscribe();

    expect(removeItemSpy).toHaveBeenCalledWith("auth.token");
    expect(removeItemSpy).toHaveBeenCalledWith("auth.user");
  });

  it("logout sets currentUser$ to null", (done) => {
    localStorage.setItem("auth.token", mockToken);
    localStorage.setItem("auth.user", JSON.stringify(mockUser));
    api.post.and.returnValue(of({ success: true }));
    const service = new AuthService(api);

    service.logout().subscribe(() => {
      service.currentUser$.subscribe((user) => {
        expect(user).toBeNull();
        done();
      });
    });
  });

  it("forceLogout clears session without making API call", () => {
    localStorage.setItem("auth.token", mockToken);
    localStorage.setItem("auth.user", JSON.stringify(mockUser));
    const service = new AuthService(api);

    service.forceLogout();

    expect(api.post).not.toHaveBeenCalled();
    expect(localStorage.getItem("auth.token")).toBeNull();
    expect(localStorage.getItem("auth.user")).toBeNull();
  });

  it("getCurrentUserSnapshot returns null when not logged in", () => {
    const service = new AuthService(api);

    expect(service.getCurrentUserSnapshot()).toBeNull();
  });

  it("getCurrentUserSnapshot returns user after login", () => {
    api.post.and.returnValue(
      of({ accessToken: mockToken, user: mockUser }),
    );
    const service = new AuthService(api);

    service.login("alice", "secret").subscribe();

    expect(service.getCurrentUserSnapshot()).toEqual(mockUser);
  });

  it("isLoggedIn$ emits true after login", (done) => {
    api.post.and.returnValue(
      of({ accessToken: mockToken, user: mockUser }),
    );
    const service = new AuthService(api);

    service.login("alice", "secret").subscribe(() => {
      service.isLoggedIn$.subscribe((loggedIn) => {
        expect(loggedIn).toBeTrue();
        done();
      });
    });
  });

  it("isLoggedIn$ emits false after logout", (done) => {
    localStorage.setItem("auth.token", mockToken);
    localStorage.setItem("auth.user", JSON.stringify(mockUser));
    api.post.and.returnValue(of({ success: true }));
    const service = new AuthService(api);

    service.logout().subscribe(() => {
      service.isLoggedIn$.subscribe((loggedIn) => {
        expect(loggedIn).toBeFalse();
        done();
      });
    });
  });

  it("reads user from localStorage on construction when valid JSON exists", () => {
    localStorage.setItem("auth.user", JSON.stringify(mockUser));
    const service = new AuthService(api);

    expect(service.getCurrentUserSnapshot()).toEqual(mockUser);
  });

  it("returns null from storage for invalid JSON", () => {
    localStorage.setItem("auth.user", "not-valid-json{{");
    const service = new AuthService(api);

    expect(service.getCurrentUserSnapshot()).toBeNull();
  });

  it("returns null from storage when parsed object lacks id field", () => {
    localStorage.setItem("auth.user", JSON.stringify({ username: "alice" }));
    const service = new AuthService(api);

    expect(service.getCurrentUserSnapshot()).toBeNull();
  });
});
