import { Router } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const router = Router();

router.use('/auth', createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL,
    changeOrigin: true
}));

router.use('/urls', createProxyMiddleware({
    target: process.env.WRITE_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { '^/': '/api/v1/urls/' }
}));

router.use('/', createProxyMiddleware({
    target: process.env.READ_SERVICE_URL,
    changeOrigin: true
}));

export default router;