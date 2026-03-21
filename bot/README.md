# Telegram Group Reply Bot

独立运行的 Telegram 群关键词自动回复机器人。

## 功能

- 长轮询模式，不需要 webhook
- 仅处理群和超级群文本消息
- 群白名单控制
- 高/低置信度规则，优先命中高置信度
- 关键词 / 精确匹配 / 正则匹配
- 单条规则支持多个回复模板随机返回
- 规则文件热更新，不重启 bot 即可生效
- 支持 `RDS + 本地缓存 + 本地文件兜底`
- 支持知识库关键词匹配回退
- 内存冷却，避免同一规则刷屏
- 本地 `/health` 健康检查和详细控制台日志
- 数据库仅在启用 `RDS` 模式时需要

## 使用

1. 复制配置文件：

```bash
cd bot
cp .env.example .env
```

2. 编辑 `.env`：

- `BOT_TOKEN`：Telegram bot token
- `ALLOWED_CHAT_IDS`：允许生效的群 ID，多个用逗号分隔
- `DEFAULT_COOLDOWN_SECONDS`：默认冷却秒数
- `REPLY_TO_MESSAGE`：是否以回复消息形式发送
- `DROP_PENDING_UPDATES`：启动时是否丢弃积压消息
- `ENABLE_LOW_CONFIDENCE`：是否启用低置信度规则
- `ENABLE_KNOWLEDGE_FALLBACK`：是否启用知识库关键词回退
- `HEALTH_ENABLED`：是否启用本地健康检查服务
- `HEALTH_HOST`：健康检查监听地址，建议保持 `127.0.0.1`
- `HEALTH_PORT`：健康检查端口
- `LOG_MESSAGE_TEXT`：是否在日志里记录消息文本
- `MAX_LOG_TEXT_LENGTH`：日志文本最大长度
- `OPS_DATA_SOURCE`：`local` 或 `rds`
- `OPS_SCOPE_SYSTEM`：系统标识
- `OPS_SCOPE_MODULE`：模块标识
- `OPS_SCOPE_SERVICE`：服务标识
- `OPS_SCOPE_ENV`：环境标识
- `OPS_DB_HOST` / `OPS_DB_PORT` / `OPS_DB_NAME` / `OPS_DB_USER` / `OPS_DB_PASS`：RDS 配置
- `OPS_REFRESH_SECONDS`：从 RDS 拉取配置的轮询秒数
- `OPS_CACHE_FILE`：本地缓存文件路径
- `OPS_WRITE_LOGS_TO_RDS`：是否把命中/错误摘要日志写入 RDS
- `RULES_FILE`：规则文件路径
- `KNOWLEDGE_FILE`：本地知识库文件路径

3. 编辑 `rules.json`

仓库已经附带一版可直接用的 [rules.json](/Users/liaoguangze/Projects/vvcloud-xboard/bot/rules.json)。
如果你想从空白示例开始，也可以参考 `rules.example.json`。
本地知识库示例可参考 [knowledge.example.json](/Users/liaoguangze/Projects/vvcloud-xboard/bot/knowledge.example.json)。

支持三种规则类型：

- `includes`：文本包含任意关键词即命中
- `exact`：文本与某个关键词完全一致才命中
- `regex`：正则表达式命中

可选字段：

- `confidence`：`high` 或 `low`
- `replies`：多个回复模板，命中后随机选择
- `excludeKeywords`：文本包含这些词时不触发当前规则
- `cooldownSeconds`：单群下该规则的冷却时间
- `priority`：同一置信度下的规则优先级，数字越小越先匹配

4. 安装依赖并启动：

```bash
npm install
npm start
```

如需只检查配置和规则文件是否合法，不启动 bot：

```bash
npm run check
```

查看运行中 bot 的本地健康状态：

```bash
npm run health
curl http://127.0.0.1:3939/health
```

## 数据源模式

### 本地模式

- `OPS_DATA_SOURCE=local`
- 读取 `rules.json` 和 `knowledge.json`
- 通过文件热更新自动刷新

### RDS 模式

- `OPS_DATA_SOURCE=rds`
- 按 `system/module/service/environment` 解析目标服务
- 通过 `ops_service_runtime_bindings` 获取当前生效的规则集和知识库
- 从 `ops` RDS 拉取规则和知识库
- 定时刷新
- 成功拉取后写本地缓存
- RDS 短时不可用时自动退回本地缓存，再退回本地文件

## 规则示例

```json
[
  {
    "id": "download-client",
    "type": "includes",
    "confidence": "high",
    "keywords": ["下载", "客户端"],
    "replies": [
      "客户端下载入口请查看群置顶。",
      "客户端请优先从官网或群置顶下载。"
    ],
    "cooldownSeconds": 90
  }
]
```
