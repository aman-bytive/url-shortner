import express from "express";
import router from "./src/routes/index.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({extended:true}))

app.use('/api/v1',router)

app.use(errorHandler);

export default app;