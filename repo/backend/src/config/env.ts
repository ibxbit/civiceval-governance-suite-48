import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default("*"),
  JWT_SECRET: z.string().min(32),
});

export type AppEnv = z.infer<typeof envSchema>;

export const parseEnv = (envSource: NodeJS.ProcessEnv): AppEnv => {
  const result = envSchema.safeParse(envSource);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid environment configuration: ${errors}`);
  }

  return result.data;
};
