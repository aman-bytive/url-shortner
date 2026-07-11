import { Router } from "express";
import urlRouter from "./url.routes.js";

const router = Router();

router.use("/urls",urlRouter);

export default router;