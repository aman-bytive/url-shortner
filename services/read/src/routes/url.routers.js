import {Router} from 'express';
import { getLongUrl } from '../controller/url.controller.js';

const router = Router();

router.route('/:shortCode').get(getLongUrl);

export default router;