# AlbaTextus Status

少量服务的独立状态板块与手动事件发布后台。初始服务列表和事件列表均为空，没有演示数据。导航栏复用 Connect，页面延续简洁的白底细边框风格。

## Cloudflare Workers + D1 部署

使用 OpenNext 将 Next.js 部署到 **Cloudflare Workers**，服务与事件保存到 **D1**，每分钟通过 Cron Trigger 执行健康检测。不需要常驻 Node 服务或外部数据库。Node.js 要求 **22.18+**；首次部署需要 Cloudflare 账号和 Wrangler 登录。

在 `status/` 目录执行：

```sh
npm ci
npx wrangler login
npm run db:create
```

将创建结果的 `database_id` 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，替换全零占位值。然后执行：

```sh
npm run db:migrate:remote
npx wrangler secret put STATUS_ADMIN_TOKEN
npm run cf:deploy
```

密钥命令会交互式读取长随机管理密钥，不要将其写进 Wrangler 配置或提交到仓库。部署命令会输出 `workers.dev` 地址；自定义域名可以在 Cloudflare 控制台的 Worker 设置中添加。修改 Worker 名称时，要同步修改 `services[0].service` 自引用绑定。

Cloudflare Git 构建的项目根目录设置为 `status`，构建命令 `npm run cf:build`，部署命令 `npx opennextjs-cloudflare deploy`。首次构建前须完成 D1 创建、绑定、迁移与 Secret 配置。后续新增数据库迁移也需先执行 `db:migrate:remote`。

## 本地开发与 Workers 预览

```powershell
cd E:\AlbaTextus\status
npm ci
Copy-Item .dev.vars.example .dev.vars
# 编辑 .dev.vars，设置本地 STATUS_ADMIN_TOKEN
npm run db:migrate:local
npm run dev -- --hostname 127.0.0.1 --port 3100
```

- 状态页：`http://127.0.0.1:3100/`
- 管理后台：`http://127.0.0.1:3100/admin`
- 只读状态接口：`/api/status`
- 本服务健康接口：`/healthz`
- 已发布事件详情：`/incidents/<id>`；草稿和不存在的事件返回 404。

`next dev` 使用 Wrangler 的本地 D1 绑定。完整 Workers 预览：

```sh
npm run cf:build
npm run cf:preview
```

预览默认地址为 `http://localhost:8787`。本地不会自动触发 Cron，可以用后台手动检测，或模拟一次计划任务：

```sh
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

本地 D1 统一保存在工作区 `temps/status/cloudflare-state/v3/`，开发、预览、迁移和导入共用此目录；与云端 D1 隔离。`npm start` 也是 Workers 预览，需要先完成 `cf:build`。不要再用 `next start` 作为生产运行方式。

## 检测规则

| HTTP 响应 | 显示 |
| --- | --- |
| 200 | 绿色，运行正常 |
| 433 | 黄色，维护中 |
| 其他状态码 | 红色，服务异常 |
| 超时、连接失败、DNS/TLS 错误 | 红色，服务异常 |
| 未检测或检测结果超过 3 分钟 | 灰色，等待检测 |

服务名称与地址由管理员填写。地址没有 `/healthz` 时自动补全。只接受 HTTP/HTTPS 地址，不接受 URL 内嵌密码、查询参数和锚点。云端只能检测 Workers 可访问的公网地址，原来的 localhost/内网服务需要先通过 Cloudflare Tunnel 等方式暴露可访问的健康端点。

检测由 Worker 完成，不依赖浏览器是否打开。Cron 每分钟触发一次（Cloudflare Cron 最短周期为一分钟），每次请求超时 5 秒，并发上限 4；同一时刻最多一个计划检测批次。计划任务异常中断后锁最多 3 分钟自动过期，长批次会跳过重叠轮次。不跟随重定向，3xx 也按异常处理；只看 HTTP 状态码，不解析响应正文。后台保存服务时立即检测，也支持单项检测与全部检测。前台每 10 秒读取最近检测结果，公开刷新只读取结果，不发起探测。Cron 配置传播可能需要数分钟，可在 Cloudflare 控制台查看执行记录。

## 手动公告与事件

首页保留 System status 历史面板：每个服务一行，状态条使用原来的 90 格表示过去 24 小时，每格代表 16 分钟，不显示延迟。每次健康检测归入对应区间，并以该区间内最严重状态着色（异常优先于维护、维护优先于正常）；无记录为灰色，不补造过去数据。可用率为过去 24 小时 HTTP 200 次数 / 全部实际检测次数，维护计入分母，没有采样的区间不参与计算。记录随服务持久化；更名或修改地址后保留同一服务的记录。

在后台创建事件，自行填写标题、关联服务（可不关联）、事件进度，以及每条更新的状态名称和正文。支持：

- 保存草稿、发布、编辑已发布内容、撤回草稿、删除事件。
- 添加或删除更新记录，预览正文；最新更新排在最上面。
- 将事件标记为已结束，已发布事件仍保留在状态页。
- 更新的时间由服务器记录，编辑已有更新保留其原始时间；显示北京时间。

健康检测不会自动创建事件或修改手写文案。手动事件是否结束也不覆盖 HTTP 检测结果。删除服务后，已写事件保留并解除服务关联。

## 存储与访问

数据库通过 `DB` 绑定访问。`status_records` 按服务、事件分别存储 JSON，保留历史与事件更新；`status_meta` 保存全局写入版本；`monitor_lease` 防止重复计划检测。修改使用 D1 原子批处理与版本比较，并发冲突自动重试，避免多个 Worker 实例覆盖彼此的更新。初始化后为空数据，不生成演示内容。

云端使用 Wrangler Secret，本地使用 `.dev.vars`：

```dotenv
STATUS_ADMIN_TOKEN=替换为自己的长随机管理密钥
```

后台支持通用 OAuth2 登录，也兼容管理密钥。密钥仅在验证成功后保存在当前浏览器会话中；OAuth2 使用 HttpOnly Cookie 和 D1 服务端会话。两种方式都未配置时管理接口拒绝访问，包括本地环境。公开状态接口不会返回检测 URL 或草稿。

### 接入 ALBATEXTUS Connect

本地 Connect 默认从 `http://localhost:3000` 提供账户页面及 OAuth2 接口。相邻 `connect` 仓库已配置数据库并有启用的管理员时，可以直接登记 Status：

```powershell
cd ../connect
go run ./cmd/register-status
cd ../status
npm run db:migrate:local
npm run dev -- --hostname 127.0.0.1 --port 3100
```

打开 `http://127.0.0.1:3100/admin`，点击「使用 ALBATEXTUS Connect 登录」，在账户中心登录并确认授权后回到后台。

登记工具创建独立机密客户端 `albatextus-status`，最低访问角色为 `ADMIN`，只申请 `profile`，回调为 `http://127.0.0.1:3100/api/auth/callback`。默认应用所有者和允许账号使用 Connect `.env` 中 `SEED_ADMIN_EMAIL` 对应的现有管理员；首次登记可用 `-admin-id <用户 UUID>` 指定。工具会保留已有的 Status 管理密钥及允许名单，重复执行复用客户端密钥并保留已登记的其他回调，不重置用户或其他应用。

端口变化时使用 `go run ./cmd/register-status -app-url http://127.0.0.1:新的端口`。可用 `-issuer-url` 指定 Connect 的公开入口、`-output` 指定配置文件。配置写入本地 `.dev.vars`，运行中的 Status 需要重启以加载。凭据文件不提交到 Git。

Connect 对应 `/oauth/authorize`、`/oauth/token` 和 `/api/v1/user`，使用 `client_secret_post` 发送客户端凭据，以 `sub`（用户 UUID）匹配允许名单，并显示 `display_name`。Connect 不提供 OIDC ID Token，无需申请 `openid` 或邮箱权限。线上需在 Connect 登记真实 HTTPS 回调，再将对应参数和 Client Secret 配置到 Worker，并执行数据库迁移。

### 通用 OAuth2 登录

在登录源创建支持 **Authorization Code + PKCE S256** 的 OAuth2 应用，登记回调地址：

```text
https://你的状态页域名/api/auth/callback
```

本地开发可登记 `http://127.0.0.1:3100/api/auth/callback`。浏览器访问地址与配置的回调地址必须使用相同的协议、主机名和端口；`localhost` 与 `127.0.0.1` 不能混用。除回环地址外，所有端点和回调必须使用 HTTPS。

复制 `.dev.vars.example` 中的 OAuth2 配置到 `.dev.vars` 并填写真实值。线上通过 Worker 的环境变量和 Secrets 配置：

| 变量 | 用途 |
| --- | --- |
| `STATUS_OAUTH_CLIENT_ID` | 必填，OAuth2 应用 ID |
| `STATUS_OAUTH_CLIENT_SECRET` | 必填，OAuth2 应用密钥；线上使用 Wrangler Secret |
| `STATUS_OAUTH_AUTHORIZATION_URL` | 必填，授权端点 |
| `STATUS_OAUTH_TOKEN_URL` | 必填，换取访问令牌的端点 |
| `STATUS_OAUTH_USERINFO_URL` | 必填，使用 Bearer 访问令牌获取用户资料的 JSON 端点 |
| `STATUS_OAUTH_REDIRECT_URI` | 必填，完整回调地址，路径固定为 `/api/auth/callback` |
| `STATUS_OAUTH_ALLOWED_USER_IDS` | 必填，允许管理后台的固定用户 ID，以逗号分隔；不支持 `*` |
| `STATUS_OAUTH_NAME` | 可选，登录按钮显示名称，默认 `OAuth2` |
| `STATUS_OAUTH_SCOPES` | 可选，空格分隔的权限范围，默认 `profile`；空字符串表示不发送 scope |
| `STATUS_OAUTH_USER_ID_CLAIM` | 可选，用户资料中的固定 ID 字段，默认 `sub`；支持 `id`、`data.id` 等路径 |
| `STATUS_OAUTH_TOKEN_AUTH_METHOD` | 可选，`client_secret_basic`（默认）或 `client_secret_post` |
| `STATUS_OAUTH_ISSUER` | 可选，登录源的 issuer，默认授权端点的 origin；登录源返回 `iss` 或 ID Token 时必须与其完全一致 |

例如用户资料为 `{"id":42,"username":"admin"}`，设置 `STATUS_OAUTH_USER_ID_CLAIM=id` 和 `STATUS_OAUTH_ALLOWED_USER_IDS=42`。允许名单使用登录源分配的不可变 ID，不使用可自行修改的显示名或邮箱。数字 ID 必须是安全整数，较大的 ID 请让登录源以字符串返回。

先执行新迁移，再部署：

```sh
# 本地
npm run db:migrate:local

# 线上：其他 OAuth2 环境变量也需要先在 Worker 中配置好
npm run db:migrate:remote
npx wrangler secret put STATUS_OAUTH_CLIENT_SECRET
npm run cf:deploy
```

也可以将非密钥配置写入 `wrangler.jsonc` 的 `vars`，不要把 Client Secret 写进该文件。若只需 OAuth2，移除 `STATUS_ADMIN_TOKEN` 即可隐藏密钥入口；保留它则两种登录方式同时有效，脚本仍可通过 `x-admin-token` 调用管理接口。

登录通过 `oauth4webapi` 处理协议，授权请求绑定浏览器、使用一次性 state 与 PKCE，10 分钟后失效。用户通过允许名单校验后建立 8 小时会话；浏览器仅保存随机会话 Cookie，D1 仅保存其哈希，不保存 OAuth2 访问令牌或刷新令牌。生产 Cookie 使用 `Secure`、`HttpOnly`、`SameSite=Lax` 和 `__Host-` 前缀。退出登录立即删除服务端会话；移除允许名单中的 ID 后，该账号下次后台请求会被拒绝。修改登录源、客户端凭据或 ID 字段会使旧会话失效。

OAuth2 会话下的写操作必须携带与站点一致的 `Origin`，回调成功或失败都会清除流程 Cookie，并跳转回 `/admin`。取消授权、请求过期和权限不足会显示对应提示。登录源需支持标准 JSON 令牌响应及 Bearer 用户资料请求；自定义非标准协议需另行适配。

## 从旧 JSON 导入

旧 `data/status.json` 不再被运行时读取，`STATUS_DATA_DIR` 不再使用。原文件可保留为备份。先执行目标数据库迁移，再导入：

```sh
npm run db:import -- data/status.json --local
npm run db:import -- data/status.json --remote
```

导入工具仅接受空数据库，保留服务 ID、事件、草稿、更新时间和历史，拒绝覆盖非空数据库。云端导入通过已登录的 Wrangler 远程 D1 绑定执行；请显式选择 `--remote`。工具的临时配置放在工作区 `temps/status/`，不会修改源 JSON。

云端备份可使用 D1 的 Time Travel，或导出 SQL 到工作区 `release/`：

```sh
npx wrangler d1 export DB --remote --output ../release/status-backup.sql
```

## 验证

```powershell
npm run lint
npm run typecheck
npm run test:auth
npm run cf:build
npm run cf:check
```

`cf:check` 仅预检，不上传，打包结果写入工作区 `release/status/worker/`。`.next/` 和 `.open-next/` 是框架生成的构建中间目录，不提交到仓库。OpenNext 对原生 Windows 的支持有限，生产构建推荐 Linux CI 或 WSL。

`test:auth` 运行 `temp/auth/` 中的 OAuth2 回归测试，启动本地模拟登录源和独立、不持久化的真实 D1 绑定，覆盖 PKCE、两种客户端认证方式、允许名单、回调重放、跨站请求和退出撤销。无需真实 OAuth2 密钥、Cloudflare 登录或浏览器安装；测试配置与结果写入 `temp/output/`，不使用项目的 `.dev.vars` 或现有数据库。

`E:\AlbaTextus\temps\status\test-cloudflare.mjs` 是 Workers 集成验证脚本，使用独立的 `temps/status/cf-tests/` 本地数据库与测试端口，不修改正式服务列表。旧 `test-management.cjs` 面向已移除的 Node 文件存储，不再适用于当前运行方式。
