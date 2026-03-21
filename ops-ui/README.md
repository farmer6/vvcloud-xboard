# VVCloud Ops UI

轻量独立的 Web UI 原型，用于承接未来统一 `ops` 运维平台的第一阶段实现。

## 特点

- 不复用 Laravel
- 服务端渲染 HTML，无前端构建链
- 直连独立 `ops` RDS
- 以 `system/module/service/environment` 为统一作用域
- Basic Auth 保护
- 当前聚焦第一阶段的服务层、内容层和日志层
- 为后续资源层、任务执行层预留扩展空间

## 初始化

```bash
cd ops-ui
cp .env.example .env
npm install
npm run check
npm run init-db
npm start
```

## 环境变量

- `OPS_UI_HOST`：监听地址
- `OPS_UI_PORT`：监听端口
- `OPS_UI_BASIC_AUTH_USER`：Basic Auth 用户名
- `OPS_UI_BASIC_AUTH_PASS`：Basic Auth 密码
- `OPS_SCOPE_SYSTEM`：系统标识，例如 `xboard`
- `OPS_SCOPE_MODULE`：模块标识，例如 `bot`
- `OPS_SCOPE_SERVICE`：服务标识，例如 `telegram_support`
- `OPS_SCOPE_ENV`：环境标识，例如 `production`
- `OPS_DB_HOST`：RDS 地址
- `OPS_DB_PORT`：RDS 端口
- `OPS_DB_NAME`：数据库名，建议 `ops`
- `OPS_DB_USER`：数据库用户
- `OPS_DB_PASS`：数据库密码

## 后续建议

当前阶段建议按以下顺序推进：

1. 完成第一阶段 `service` 模型闭环：`ops_services`、`ops_rule_sets`、`ops_knowledge_bases`、`ops_service_runtime_bindings`
2. 让当前 Telegram 客服 bot 通过 `service_id + runtime binding` 读取规则和知识库
3. 让其他 bot 逐步作为新的 `service` 纳入统一管理
4. 再扩展资源层和任务执行层，用于服务器、DNS、节点和自动化动作

当前 `ops-ui` 已支持第一阶段的最小录入链：

1. `Systems`
2. `Modules`
3. `Services`
4. `Rule Sets`
5. `Rule Set Detail -> Rules + Replies`
6. `Knowledge Bases`
7. `Knowledge Base Detail -> Knowledge Items`
8. `Service Detail -> Runtime Binding`

推荐初始化顺序：

1. 创建 `xboard`
2. 创建 `bot`
3. 创建 `telegram_support`
4. 创建 `default` rule set 和 knowledge base
5. 在 rule set / knowledge base 下录入实际内容
6. 回到 service detail 绑定 active rule set / active knowledge base
7. 再把 bot 切到 `OPS_DATA_SOURCE=rds`

详细规划见：

- [docs/ops/implementation-roadmap-v1.md](/Users/liaoguangze/Projects/vvcloud-xboard/docs/ops/implementation-roadmap-v1.md)

统一 `ops` 平台的数据模型设计文档见：

- [docs/ops/unified-ops-data-model-v1.md](/Users/liaoguangze/Projects/vvcloud-xboard/docs/ops/unified-ops-data-model-v1.md)
- [docs/ops/ops-infrastructure-extension-v1.md](/Users/liaoguangze/Projects/vvcloud-xboard/docs/ops/ops-infrastructure-extension-v1.md)
