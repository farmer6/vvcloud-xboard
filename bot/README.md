# Telegram Group Reply Bot

独立运行的 Telegram 群关键词自动回复机器人。

## 功能

- 长轮询模式，不需要 webhook
- 仅处理群和超级群文本消息
- 群白名单控制
- 关键词 / 精确匹配 / 正则匹配
- 内存冷却，避免同一规则刷屏
- 不依赖数据库

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
- `RULES_FILE`：规则文件路径

3. 编辑 `rules.json`

仓库已经附带一版可直接用的 [rules.json](/Users/liaoguangze/Projects/vvcloud-xboard/bot/rules.json)。
如果你想从空白示例开始，也可以参考 `rules.example.json`。

支持三种规则类型：

- `includes`：文本包含任意关键词即命中
- `exact`：文本与某个关键词完全一致才命中
- `regex`：正则表达式命中

4. 安装依赖并启动：

```bash
npm install
npm start
```

如需只检查配置和规则文件是否合法，不启动 bot：

```bash
npm run check
```

## 规则示例

```json
[
  {
    "id": "download-client",
    "type": "includes",
    "keywords": ["下载", "客户端"],
    "reply": "客户端下载入口：https://your-domain.example/download",
    "cooldownSeconds": 90
  }
]
```
