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

后台需填写密钥，保存在当前浏览器会话中。未配置密钥时管理接口拒绝访问，包括本地环境。公开状态接口不会返回检测 URL 或草稿。

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
npm run cf:build
npm run cf:check
```

`cf:check` 仅预检，不上传，打包结果写入工作区 `release/status/worker/`。`.next/` 和 `.open-next/` 是框架生成的构建中间目录，不提交到仓库。OpenNext 对原生 Windows 的支持有限，生产构建推荐 Linux CI 或 WSL。

`E:\AlbaTextus\temps\status\test-cloudflare.mjs` 是 Workers 集成验证脚本，使用独立的 `temps/status/cf-tests/` 本地数据库与测试端口，不修改正式服务列表。旧 `test-management.cjs` 面向已移除的 Node 文件存储，不再适用于当前运行方式。
