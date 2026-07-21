import express from "express";
import router from "./src/routes/index.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

const app = express();

app.use(router);
app.use(errorHandler);

export default app;