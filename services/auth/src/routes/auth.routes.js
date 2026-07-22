import {Router} from "express";
import { validate } from "../middlewares/validate.js";
import { registerUserSchema,loginUserSchema,refreshTokenSchema } from "../validators/url.validator.js";
import { registerUser,loginUser,refreshToken } from "../controllers/auth.controller.js";


const router = Router();

router.route('/register').post(validate(registerUserSchema), registerUser);
router.route('/login').post(validate(loginUserSchema), loginUser);
router.route('/refresh').post(validate(refreshTokenSchema), refreshToken);

export default router;