import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { createUrlSchema } from "../validators/url.validator.js";
import { createShortUrl } from "../controllers/url.controller.js";

const router = Router();

router.route('/').post(validate(createUrlSchema),createShortUrl);

export default router;