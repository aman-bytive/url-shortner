import express from "express";
import router from "./src/routes/index.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";
import "dotenv/config";

const app = express();

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(router);
app.use(errorHandler);

export default app;