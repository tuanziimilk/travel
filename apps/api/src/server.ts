import express from "express";
import cors from "cors";
import { env } from "./env";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

const app = express();
app.use(cors({ origin: env.webOrigin }));
app.use(express.json({ limit: "20mb" }));

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

app.listen(env.apiPort, () => {
  console.log(`API running on http://localhost:${env.apiPort}`);
});
