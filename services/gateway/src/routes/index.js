import { Router } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { WRITE_BUCKET, READ_BUCKET } from "../redis/token.js";
import verifyToken from "../middleware/jwt.js";

const router = Router();

router.use('/auth', rateLimiter(WRITE_BUCKET), createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true
}));

router.use('/urls', verifyToken, rateLimiter(WRITE_BUCKET), createProxyMiddleware({
    target: process.env.WRITE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/api/v1/urls/' }
}));

router.use('/', rateLimiter(READ_BUCKET), createProxyMiddleware({
    target: process.env.READ_SERVICE_URL,
    changeOrigin: true
}));

export default router;