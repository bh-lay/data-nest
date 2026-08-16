# 小剧数巢 (DataNest)

个人跨应用数据管理平台。基于 Node.js，单一用户角色、无开放注册，支持数据增删改查、匿名访问控制，以及面向外部服务的 API Token。

- 中文名：小剧数巢
- 英文名：DataNest
- 建议子域名：`nest.你的域名`

## 功能

- **单一用户类型，禁止注册**：首次启动自动创建初始管理员，登录后可修改自己的密码、创建/删除其他用户。
- **数据增删改查**：`data` 字段为任意 JSON 值（对象、数组、字符串、数字等），服务端不做内容校验。
- **匿名访问控制**：每条记录可设置是否允许未登录读取。
- **API Token**：登录后可创建 Token，供外部服务读写数据（Token 仅创建时明文显示一次）。
- **存储**：SQLite（单实例，无需高可用/集群）。

## 快速开始

```bash
npm install
npm start
```

打开 http://localhost:3000 ，使用初始账号登录。

### 初始账号

首次启动时若用户表为空，会自动创建管理员：

- 用户名：`admin`
- 密码：`admin123`

请登录后立即修改密码。可通过环境变量在首次启动前覆盖：

```bash
ADMIN_USERNAME=root ADMIN_PASSWORD=change-me node server.js
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DATA_DIR` | `./data` | 数据目录（存放 SQLite 与 JWT 密钥） |
| `DB_PATH` | `./data/app.db` | SQLite 数据库路径 |
| `ADMIN_USERNAME` | `admin` | 初始管理员用户名（仅首次启动生效） |
| `ADMIN_PASSWORD` | `admin123` | 初始管理员密码（仅首次启动生效） |
| `JWT_SECRET` | 自动生成并持久化 | JWT 签名密钥 |
| `SESSION_TTL` | `12h` | 登录会话有效期 |

## API 说明

### 认证

登录返回 JWT，后续请求通过 `Authorization: Bearer <token>` 携带。

- `POST /api/auth/login` — 登录，body `{ username, password }`
- `GET /api/auth/me` — 当前用户信息（需登录）
- `POST /api/auth/change-password` — 修改自己的密码，body `{ current_password, new_password }`（需登录）

### 用户管理（需登录）

- `GET /api/users` — 用户列表
- `POST /api/users` — 创建用户，body `{ username, password }`
- `DELETE /api/users/:id` — 删除用户（不能删除自己）

### 数据记录

记录结构：

```json
{
  "id": 1,
  "name": "可选名称",
  "data": { "任意": "JSON 值" },
  "anonymous_access": false,
  "created_by": 1,
  "created_at": "2025-01-01 00:00:00",
  "updated_at": "2025-01-01 00:00:00"
}
```

- `GET /api/records` — 列表。登录（含 Token）可见全部；匿名仅可见 `anonymous_access=true` 的记录。
- `GET /api/records/:id` — 单条。私有记录匿名访问返回 401。
- `POST /api/records` — 创建，body `{ name?, data, anonymous_access? }`（需登录或 Token）
- `PUT /api/records/:id` — 更新（部分字段即可）（需登录或 Token）
- `DELETE /api/records/:id` — 删除（需登录或 Token）

`data` 必填且为任意 JSON 值，其余字段不做内容校验。路径中的 `:id` 为记录 ID，可在 Web 界面数据列表中查看并复制。

### API Token（需登录）

- `GET /api/tokens` — Token 列表（不含明文）
- `POST /api/tokens` — 创建 Token，body `{ name }`，响应中的 `secret` 为明文（仅此一次）
- `DELETE /api/tokens/:id` — 撤销 Token

外部服务使用 Token 时，任选其一：

```bash
# 方式一：专用头
curl -H "X-API-Token: dm_xxxx" -X POST http://localhost:3000/api/records \
  -H "Content-Type: application/json" -d '{"data":{"key":"value"}}'

# 方式二：Bearer
curl -H "Authorization: Bearer dm_xxxx" http://localhost:3000/api/records
```

Token 拥有数据的完整读写权限，但不能管理用户或创建/撤销 Token。

## Docker 部署

### 使用 docker compose

```bash
docker compose up -d
```

数据持久化到宿主机 `./data` 目录。首次启动（空数据库）前可在 `docker-compose.yml` 中设置管理员账号与 `JWT_SECRET`。

### 构建并发布镜像

```bash
# 仅构建本地镜像
./scripts/docker-publish.sh v1.0.0

# 构建并推送到仓库（先 docker login）
IMAGE=ghcr.io/yourname/data-nest PUSH=true ./scripts/docker-publish.sh v1.0.0
```

镜像内数据目录为 `/app/data`（建议挂载卷持久化），服务端口 `3000`。

## 项目结构

```
server.js            # 入口
src/
  config.js          # 环境变量与密钥管理
  db.js              # SQLite 建表 + 初始管理员
  auth.js            # 密码哈希、JWT、Token 中间件
  routes/
    auth.js          # 登录 / 修改密码
    users.js         # 用户管理
    records.js       # 数据 CRUD
    tokens.js        # Token 管理
public/              # 前端（原生 HTML/CSS/JS）
```
