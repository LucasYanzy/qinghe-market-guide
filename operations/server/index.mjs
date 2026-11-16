import { createApp } from "./app.mjs";
import path from "node:path";
import express from "express";
const host = process.env.HOST ?? "127.0.0.1";
if (!["127.0.0.1", "localhost", "::1"].includes(host))
  throw new Error(
    "This local tool binds to loopback. Add authenticated hosting before sharing a server.",
  );
const { app } = createApp(
  process.env.OPERATIONS_DATABASE ?? path.resolve("data/operations.sqlite"),
);
app.use(express.static(path.resolve("dist")));
app.listen(Number(process.env.PORT ?? 3016), host, () =>
  console.log(
    "Market Operations: http://" + host + ":" + (process.env.PORT ?? 3016),
  ),
);
