import { db } from "../db/client";

export type TrpcContext = {
  db: typeof db;
};

export async function createContext(): Promise<TrpcContext> {
  return { db };
}

