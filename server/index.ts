import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import treeRouter from './routes/tree.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';
const VITE_DEV_SERVER = process.env.VITE_DEV_SERVER || 'http://localhost:5173';

// 中间件
app.use(express.json());

// API 路由
app.use('/api/tree', treeRouter);

if (isDev) {
  // 开发环境：代理到 Vite 开发服务器
  console.log(`Development mode: proxying to ${VITE_DEV_SERVER}`);

  // 明确指定要代理的路径（例如根路径或所有路径）
  app.use('/', createProxyMiddleware({
    target: VITE_DEV_SERVER,
    changeOrigin: true,
    ws: true, // WebSocket 支持 HMR
    on: {
      proxyRes: (proxyRes, req, res) => {
        // 在这里修改响应头，禁用缓存
        proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate';
        proxyRes.headers['pragma'] = 'no-cache';
        proxyRes.headers['expires'] = '0';
      }
    }
  }));
} else {
  // 生产环境：静态文件服务（dist/）
  app.use(express.static(path.join(__dirname, '../dist')));

  // 所有非 API 请求返回 index.html（SPA 支持）
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
