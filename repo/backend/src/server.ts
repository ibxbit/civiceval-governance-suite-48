import { buildApp } from "./app.js";

const start = async (): Promise<void> => {
  const app = await buildApp();

  try {
    await app.listen({
      host: app.env.HOST,
      port: app.env.PORT,
    });
  } catch (error) {
    app.log.fatal({ err: error }, "Failed to start server");
    process.exit(1);
  }
};

void start();
