# AGENTS.md

This file provides guidance to ChatCode CLI when working with code in this repository.

## 项目概述

MyDiary 是一个个人日记 Web 应用，支持多用户注册登录、Markdown 编辑、心情 Emoji 记录、图片上传以及日历视图。采用前后端分离架构，使用原生 SQL（无 ORM）。

## 运行模式与架构概览

### 开发模式（双服务）
- **前端**（Vite 开发服务器）：`cd frontend && npm run dev` → 端口 5173
- **后端**（Express）：`cd backend && npm run dev` → 端口 3000
- Vite 配置了 `/api` 和 `/uploads` 代理到后端，开发时浏览器只访问前端端口即可
- `./start.sh` 一键同时启动前后端

### 生产模式（单服务）
- Dockerfile 先构建前端生成 `frontend/dist/`，然后后端通过 Express 静态文件中间件提供服务
- 所有非 `/api/` 和非 `/uploads/` 的 GET 请求都 fallback 到 `index.html`（SPA 软路由支持）
- `docker compose up -d --build` 启动完整应用（含 PostgreSQL），访问 `http://localhost:3000`

### 数据流
1. **认证**：服务端会话（HttpOnly Signed Cookie），数据库 `tb_sessions` 表存储令牌哈希，首位注册用户自动成为管理员后关闭注册
2. **日记操作**：所有日记接口经过 `authenticate` 中间件校验 session cookie → 从 `req.user` 提取 `userId` → 参数化 SQL 查询
3. **自动保存**：Editor 页面监听内容变化，2秒防抖自动调用 POST `/api/diaries` 保存；离线时缓存到 `localStorage`，恢复在线后自动同步
4. **图片上传**：POST `/api/upload/image` → multer 临时存储 → 魔数校验/SHA-256 → UUID 分层存储到 `storage/attachments/ab/cd/uuid.ext` → 记录到 `tb_attachments` 表 → 返回私有 `/api/attachments/:id` URL
5. **附件鉴权下载**：GET `/api/attachments/:id` 验证当前用户拥有该附件后才返回文件流

## 项目结构

- `frontend/` — Vue 3 应用
  - `src/views/` — 路由页面（Login, Calendar, Editor, Search）
  - `src/components/` — 可复用 UI 组件
  - `src/stores/auth.ts` — Pinia 认证状态管理
  - `src/router/index.ts` — Vue Router 路由定义（含导航守卫，异步 fetchUser）
  - `src/utils/api.ts` — axios 实例（withCredentials + CSRF Token 自动注入）
- `backend/` — Express API
  - `src/index.ts` — 启动入口（配置校验 → 建库 → 迁移 → 启动服务）
  - `src/app.ts` — Express 应用配置（Helmet、CookieParser、CORS、路由挂载、SPA fallback）
  - `src/config.ts` — 集中配置管理（支持 Docker Secrets _FILE 环境变量）
  - `src/db.ts` — pg Pool 封装
  - `src/db_init.ts` — 启动时自动创建数据库
  - `src/migrate.ts` — 版本化迁移引擎（`schema_migrations` 表跟踪）
  - `src/session.ts` — 服务端会话管理（创建/验证/撤销 + app settings）
  - `src/attachmentUtils.ts` — 附件存储工具函数（魔数校验、SHA-256、分层路径生成）
  - `src/routes/` — 路由模块（auth, diaries, upload, attachments, exports）
  - `src/middleware/auth.ts` — Session Cookie 认证中间件 + CSRF 防护
  - `sql/migrations/` — 版本化 SQL 迁移文件（001~005）
  - `sql/init.sql` — 初始数据库表结构
- `deploy/nas/` — NAS 部署配置（compose.yaml, backup.sh, restore.sh）
- `doc/` — 需求与设计文档
- `contexts/` — 项目核心上下文
- `assets/screenshots/` — README 截图
- `design/` — 设计稿与原型
- `uploads/` — 运行时上传文件（不提交 git）
- `storage/` — 私有附件存储和导出临时目录（不提交 git）

## 数据库设计

- `tb_users`（id, username, password_hash, is_admin, created_at）
- `tb_diaries`（id, user_id, diary_date, content, mood_emoji, images[JSONB], created_at, updated_at）
  - 核心约束：`UNIQUE (user_id, diary_date)` — 每天每用户只能有一条日记，后端使用 `ON CONFLICT ... DO UPDATE` 实现 upsert
- `tb_sessions`（id[UUID], user_id, token_hash[SHA-256], expires_at, last_used_at, revoked_at）— 服务端会话
- `tb_attachments`（id[UUID], user_id, diary_id, storage_key, original_name, mime_type, size_bytes, sha256, deleted_at）
- `schema_migrations`（version, name, checksum, applied_at）— 迁移跟踪表
- `tb_app_settings`（key, value）— 应用级键值配置
- 数据库在服务启动时自动创建，迁移文件按版本顺序执行

## 常用命令

```bash
# 安装依赖（分别在两个目录执行）
cd backend && npm install
cd frontend && npm install

# 启动开发服务
./start.sh                    # 一键启动前后端
cd backend && npm run dev     # 仅后端（端口 3000，tsx watch 热重载）
cd frontend && npm run dev    # 仅前端（端口 5173）

# 构建与预览
cd frontend && npm run build  # 类型检查 + Vite 构建
cd frontend && npm run preview  # 预览生产构建

# Docker 部署
docker compose up -d --build  # 构建并启动（含 PostgreSQL）
```

## 编码规范

- TypeScript，两空格缩进
- Vue 组件/视图使用 `PascalCase.vue`，变量和函数使用 `camelCase`
- 路由模块使用描述性小写名称（如 `routes/diaries.ts`）
- 业务逻辑放在路由处理函数中，共享认证逻辑放在中间件中
- 没有配置格式化工具或 lint，避免无关的格式修改
- 使用参数化 SQL（`$1, $2` 占位符），不使用 ORM

## 测试与验证

目前未配置自动化测试框架。提交前需要手动验证：
1. `cd frontend && npm run build` 确保类型检查通过
2. 验证 `GET /api/health` 返回正常
3. 手动测试受影响的流程：登录注册、日历浏览、日记编辑/保存、搜索、图片上传

如果添加测试，将测试文件以 `*.test.ts` 命名放在源码旁，并在对应 `package.json` 中添加 `npm test` 脚本。

## 提交与 PR 指南

- 使用 Conventional Commit 风格：`feat:`、`fix:`、`docs:`、`chore:` 等
- 保持提交聚焦，使用祈使句简洁概括
- PR 应说明改动内容、列出验证步骤、关联相关 issue，UI 变更附截图
- 明确标注 schema 变更、环境变量变更或部署变更

## 安全注意事项

- `backend/.env.example` → `backend/.env`，切勿提交 `.env` 文件
- 不要提交 credentials、JWT secrets、`uploads/`、`storage/`、`postgres_data/` 目录
- 参数化所有 SQL 查询（`$1, $2`），在 API 路由中验证用户输入
- 使用服务端会话（HttpOnly Signed Cookie）+ CSRF Token 双防护机制
- 附件存储采用私有路径 + 鉴权下载，不暴露直接 URL
- Helmet 配置了 CSP、X-Content-Type-Options 等安全响应头
- 登录接口有速率限制（同一 IP 15 分钟内最多 10 次尝试）
- 首位注册用户自动成为管理员，随后注册自动关闭
- Docker Compose Secrets 用于生产环境敏感信息注入
