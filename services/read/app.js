import express from "express";
import  {errorHandler}  from "./src/middleware/errorHandler.js";
import router from "./src/routes/index.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({extended:true}));

app.use("/", router);

app.use(errorHandler);

export default app;