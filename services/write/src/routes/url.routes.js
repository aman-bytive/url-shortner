import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import { createUrlSchema } from "../validators/url.validator.js";
import { createShortUrl,getShortUrlByCode,getAllShortUrl } from "../controllers/url.controller.js";

const router = Router();

router.route('/').post(validate(createUrlSchema),createShortUrl);
router.route('/:shortCode').get(getShortUrlByCode);
router.route('/').get(getAllShortUrl);

export default router;