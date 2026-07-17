import {Router} from 'express';
import urlRouter from './url.routers.js';

const router = Router();

router.use('/', urlRouter);

export default router;