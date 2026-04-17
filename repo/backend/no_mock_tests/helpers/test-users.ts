import type { FastifyInstance } from "fastify";
import { nonceHeaders } from "./setup-db.js";

export const TEST_PASSWORD = "TestAdmin@12345678";
export const ADMIN_USERNAME = "test-admin";
export const PARTICIPANT_USERNAME = "test-participant";
export const REVIEWER_USERNAME = "test-reviewer";

export type RegisterAndLoginResult = {
  token: string;
  userId: number;
  role: string;
};

export const registerAndLogin = async (
  app: FastifyInstance,
  username: string,
  password: string,
): Promise<RegisterAndLoginResult> => {
  const registerResponse = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    headers: nonceHeaders(),
    payload: { username, password },
  });

  if (registerResponse.statusCode !== 200) {
    throw new Error(
      `Registration failed for "${username}": ${registerResponse.statusCode} ${registerResponse.body}`,
    );
  }

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: nonceHeaders(),
    payload: { username, password },
  });

  if (loginResponse.statusCode !== 200) {
    throw new Error(
      `Login failed for "${username}": ${loginResponse.statusCode} ${loginResponse.body}`,
    );
  }

  const body = loginResponse.json() as {
    accessToken: string;
    user: { id: number; username: string; role: string };
  };

  return {
    token: body.accessToken,
    userId: body.user.id,
    role: body.user.role,
  };
};
