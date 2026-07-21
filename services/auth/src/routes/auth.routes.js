import {Router} from "express";
import { validate } from "../middlewares/validate.js";
import { registerUserSchema,loginUserSchema } from "../validators/url.validator.js";
import { registerUser,loginUser } from "../controllers/auth.controller.js";


const router = Router();

router.route('/register').post(validate(registerUserSchema), registerUser);
router.route('/login').post(validate(loginUserSchema), loginUser);

export default router;