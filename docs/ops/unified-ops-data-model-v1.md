# Unified Ops Data Model V1

## Goal

本设计面向未来统一的 `ops` 运维平台，而不是仅服务当前的 Telegram 客服机器人。

平台应能够统一纳管：

- `xboard` 主系统
- 支付中间件
- 邮件中心
- 巡检/定时任务
- 多个 Telegram Bot
- 未来扩展的 AI、Webhook、Worker 类服务

当前工作区内的 Telegram 客服 bot 只是该平台中的一个服务实例。

配套实施路线见：

- [docs/ops/implementation-roadmap-v1.md](/Users/liaoguangze/Projects/vvcloud-xboard/docs/ops/implementation-roadmap-v1.md)

## Scope Model

统一使用 4 层业务作用域：

- `system_code`
- `module_code`
- `service_code`
- `environment_code`

推荐含义：

- `system_code`：业务系统，例如 `xboard`、`payment_gateway`
- `module_code`：系统内的大模块，例如 `bot`、`billing`、`mail`
- `service_code`：模块内的具体服务，例如 `telegram_support`
- `environment_code`：环境，例如 `production`、`staging`

示例：

- `xboard / bot / telegram_support / production`
- `payment_gateway / bot / telegram_payment_query / production`
- `payment_gateway / bot / telegram_payment_notify / production`

## Design Principles

- `service` 是统一纳管的核心对象
- 表关联优先使用数值主键 `id`
- `*_code` 用于业务识别、展示和跨系统引用
- `RDS` 存放规则、知识库、运营日志、错误日志、审计日志和服务元数据
- 本地 `console/journal` 保留调试日志与原始消息流
- 不默认将所有群消息全文写入 `RDS`
- 规则、知识库和 AI 策略需要支持版本化和发布

## Entity Layers

### 1. Registry Layer

用于统一纳管系统、模块、服务、实例和外部端点。

#### `ops_systems`

字段建议：

- `id`
- `code`
- `name`
- `status`
- `owner_team`
- `description`
- `metadata_json`
- `created_at`
- `updated_at`

约束：

- unique(`code`)

#### `ops_modules`

字段建议：

- `id`
- `system_id`
- `code`
- `name`
- `module_type`
- `status`
- `description`
- `metadata_json`
- `created_at`
- `updated_at`

约束：

- unique(`system_id`, `code`)

#### `ops_services`

字段建议：

- `id`
- `system_id`
- `module_id`
- `environment_code`
- `code`
- `name`
- `service_type`
- `provider`
- `runtime_mode`
- `deploy_type`
- `enabled`
- `status`
- `owner_team`
- `description`
- `config_version`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- `service_type` 例：`telegram_bot`、`webhook_service`、`worker`
- `provider` 例：`telegram`、`alipay`、`wechat`
- `runtime_mode` 例：`polling`、`webhook`
- `deploy_type` 例：`systemd`、`docker`、`k8s`

约束：

- unique(`module_id`, `environment_code`, `code`)

#### `ops_service_instances`

字段建议：

- `id`
- `service_id`
- `instance_key`
- `host_name`
- `process_manager`
- `process_identifier`
- `version`
- `desired_state`
- `actual_state`
- `health_status`
- `started_at`
- `last_heartbeat_at`
- `last_seen_at`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- 一个服务未来可以有多个实例
- 当前 polling bot 通常只运行单实例

#### `ops_service_endpoints`

字段建议：

- `id`
- `service_id`
- `endpoint_type`
- `provider`
- `external_identifier`
- `webhook_url`
- `polling_enabled`
- `enabled`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- `external_identifier` 可用于 bot username、chat id、支付通知入口标识等

#### `ops_service_settings`

字段建议：

- `id`
- `service_id`
- `setting_key`
- `setting_value_json`
- `value_type`
- `updated_by`
- `updated_at`

约束：

- unique(`service_id`, `setting_key`)

#### `ops_secret_refs`

字段建议：

- `id`
- `service_id`
- `secret_key`
- `secret_provider`
- `secret_reference`
- `rotation_policy`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- 仅保存 secret 引用，不直接存明文 token

### 2. Content Layer

用于管理规则、回复模板、知识库、AI 策略。

建议使用“集合 + 条目”模型，而不是把内容直接散挂在服务上。

#### `ops_rule_sets`

字段建议：

- `id`
- `service_id`
- `code`
- `name`
- `status`
- `version_no`
- `description`
- `checksum`
- `published_at`
- `published_by`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- 例：`default`、`holiday_campaign_2026q1`
- `status` 例：`draft`、`published`、`archived`

#### `ops_rules`

字段建议：

- `id`
- `rule_set_id`
- `name`
- `description`
- `enabled`
- `confidence`
- `match_type`
- `pattern`
- `keywords_json`
- `exclude_keywords_json`
- `regex_flags`
- `cooldown_seconds`
- `priority`
- `stop_on_match`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- `confidence`：`high` / `low`
- `match_type`：`includes` / `exact` / `regex` / `word`

#### `ops_rule_replies`

字段建议：

- `id`
- `rule_id`
- `reply_text`
- `reply_type`
- `sort_order`
- `enabled`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- 用于一个规则挂多个回复模板

#### `ops_knowledge_bases`

字段建议：

- `id`
- `service_id`
- `code`
- `name`
- `status`
- `version_no`
- `description`
- `published_at`
- `published_by`
- `metadata_json`
- `created_at`
- `updated_at`

#### `ops_knowledge_items`

字段建议：

- `id`
- `knowledge_base_id`
- `title`
- `category`
- `enabled`
- `priority`
- `keywords_json`
- `summary`
- `response_text`
- `content_markdown`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- `response_text` 用于 bot 快速回复
- `content_markdown` 用于后台展示与 AI 检索上下文

#### `ops_ai_policies`

字段建议：

- `id`
- `service_id`
- `provider`
- `model`
- `enabled`
- `fallback_after_rules`
- `fallback_after_knowledge`
- `temperature`
- `max_tokens`
- `system_prompt`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- `provider` 例：`openai`、`gemini`

### 3. Runtime Binding Layer

用于控制当前服务真正生效的规则集、知识库和 AI 策略。

#### `ops_service_runtime_bindings`

字段建议：

- `id`
- `service_id`
- `active_rule_set_id`
- `active_knowledge_base_id`
- `active_ai_policy_id`
- `rollout_strategy`
- `updated_by`
- `updated_at`

未来扩展：

- `traffic_percent`
- `target_instance_group`
- `canary_until`

### 4. Logging Layer

只存摘要运营日志，不存全量原始消息归档。

#### `ops_match_logs`

字段建议：

- `id`
- `service_id`
- `instance_id`
- `source_kind`
- `source_id`
- `chat_id`
- `message_id`
- `from_id`
- `confidence`
- `status`
- `message_excerpt`
- `reply_preview`
- `latency_ms`
- `token_usage_json`
- `extra_context_json`
- `created_at`

说明：

- `source_kind`：`rule` / `knowledge` / `ai`
- `status`：`replied` / `cooldown_blocked` / `reply_failed` 等
- `message_excerpt` 建议限制长度，不写全量原文

#### `ops_error_logs`

字段建议：

- `id`
- `service_id`
- `instance_id`
- `source`
- `error_level`
- `error_code`
- `error_message`
- `chat_id`
- `message_id`
- `error_context_json`
- `trace_excerpt`
- `created_at`

说明：

- `source` 例：`telegram_api`、`config_reload`、`ai_call`
- `error_level`：`warning` / `error` / `critical`

#### `ops_admin_audit_logs`

字段建议：

- `id`
- `actor_type`
- `actor_identifier`
- `service_id`
- `action`
- `target_table`
- `target_id`
- `request_ip`
- `before_state_json`
- `after_state_json`
- `created_at`

### 5. Global Settings Layer

#### `ops_settings`

字段建议：

- `id`
- `setting_scope`
- `scope_id`
- `setting_key`
- `setting_value_json`
- `updated_by`
- `updated_at`

说明：

- `setting_scope` 可取 `global` / `system` / `module` / `service`
- 这样可以兼容未来不同层级的配置项

### 6. Resource Layer

用于表达未来被统一运维面板管理的“资源对象”，而不只是“服务进程”。

适用对象：

- 云服务器实例
- DNS 记录
- XBoard 节点
- 负载均衡入口
- 证书
- 存储桶
- 队列、Topic 等中间件资源

#### `ops_resource_types`

字段建议：

- `id`
- `code`
- `name`
- `category`
- `provider_type`
- `description`
- `metadata_json`
- `created_at`
- `updated_at`

示例：

- `cloud_server`
- `dns_record`
- `xboard_node`
- `ssl_certificate`

#### `ops_resources`

字段建议：

- `id`
- `system_id`
- `module_id`
- `service_id` 可空
- `environment_code`
- `resource_type_id`
- `provider`
- `resource_key`
- `name`
- `status`
- `region`
- `owner_team`
- `metadata_json`
- `last_synced_at`
- `created_at`
- `updated_at`

说明：

- `resource_key` 用于存云厂商实例 ID、Cloudflare Record ID、节点唯一键等
- `service_id` 可用于表达某些资源属于某个服务

#### `ops_resource_relations`

字段建议：

- `id`
- `left_resource_id`
- `relation_type`
- `right_resource_id`
- `metadata_json`
- `created_at`

说明：

- 例：某个 `xboard_node` 绑定到某台 `cloud_server`
- 例：某个 `dns_record` 指向某个 `cloud_server`

#### `ops_resource_snapshots`

字段建议：

- `id`
- `resource_id`
- `snapshot_type`
- `snapshot_payload_json`
- `collected_at`

说明：

- 用于保存同步时的资源状态快照
- 例如 Cloudflare 当前解析值、云主机当前电源状态

### 7. Job Execution Layer

用于表达自动化脚本和云厂商 API 的执行模型。

适用场景：

- 创建服务器
- 关闭服务器
- 修改 Cloudflare DNS
- 节点注册、节点下线
- 批量巡检

#### `ops_job_definitions`

字段建议：

- `id`
- `service_id`
- `code`
- `name`
- `job_type`
- `runner_type`
- `enabled`
- `description`
- `default_input_json`
- `metadata_json`
- `created_at`
- `updated_at`

说明：

- `job_type` 例：`create_server`、`shutdown_server`、`update_dns_record`
- `runner_type` 例：`provider_api`、`script`、`workflow`

#### `ops_job_runs`

字段建议：

- `id`
- `service_id`
- `job_definition_id`
- `target_resource_id`
- `trigger_source`
- `requested_by`
- `status`
- `input_payload_json`
- `result_payload_json`
- `error_message`
- `started_at`
- `finished_at`
- `created_at`

说明：

- `trigger_source` 例：`manual`、`schedule`、`webhook`
- `status` 例：`pending`、`running`、`success`、`failed`

#### `ops_job_steps`

字段建议：

- `id`
- `job_run_id`
- `step_order`
- `step_name`
- `status`
- `request_payload_json`
- `response_payload_json`
- `error_message`
- `started_at`
- `finished_at`

说明：

- 用于多步骤任务的可观测性
- 例如：创建主机 -> 等待公网 IP -> 写 DNS -> 回填节点信息

#### `ops_change_requests`

字段建议：

- `id`
- `service_id`
- `resource_id`
- `request_type`
- `requested_by`
- `approval_status`
- `approved_by`
- `payload_json`
- `created_at`
- `updated_at`

说明：

- 预留审批流能力
- 高风险动作可以通过该表接入审批

## Recommended Indexes

### Registry

- `ops_services`: unique(`module_id`, `environment_code`, `code`)
- `ops_service_instances`: index(`service_id`, `health_status`, `last_seen_at`)
- `ops_service_endpoints`: index(`service_id`, `enabled`)

### Content

- `ops_rule_sets`: index(`service_id`, `status`, `version_no`)
- `ops_rules`: index(`rule_set_id`, `enabled`, `confidence`, `priority`)
- `ops_rule_replies`: index(`rule_id`, `enabled`, `sort_order`)
- `ops_knowledge_bases`: index(`service_id`, `status`, `version_no`)
- `ops_knowledge_items`: index(`knowledge_base_id`, `enabled`, `priority`)

### Logs

- `ops_match_logs`: index(`service_id`, `created_at`)
- `ops_match_logs`: index(`service_id`, `status`, `created_at`)
- `ops_error_logs`: index(`service_id`, `created_at`)
- `ops_error_logs`: index(`service_id`, `source`, `created_at`)
- `ops_admin_audit_logs`: index(`service_id`, `created_at`)

### Resources

- `ops_resources`: index(`system_id`, `module_id`, `environment_code`, `status`)
- `ops_resources`: unique(`resource_type_id`, `provider`, `resource_key`)
- `ops_resource_relations`: index(`left_resource_id`, `relation_type`)
- `ops_resource_relations`: index(`right_resource_id`, `relation_type`)
- `ops_resource_snapshots`: index(`resource_id`, `collected_at`)

### Jobs

- `ops_job_definitions`: unique(`service_id`, `code`)
- `ops_job_runs`: index(`service_id`, `status`, `created_at`)
- `ops_job_runs`: index(`target_resource_id`, `created_at`)
- `ops_job_steps`: index(`job_run_id`, `step_order`)
- `ops_change_requests`: index(`service_id`, `approval_status`, `created_at`)

## Current Bot Mapping

### 1. XBoard 客服 Bot

- `system_code`: `xboard`
- `module_code`: `bot`
- `service_code`: `telegram_support`
- `environment_code`: `production`

### 2. 支付双向查询 Bot

- `system_code`: `payment_gateway`
- `module_code`: `bot`
- `service_code`: `telegram_payment_query`
- `environment_code`: `production`

### 3. 支付单向通知 Bot

- `system_code`: `payment_gateway`
- `module_code`: `bot`
- `service_code`: `telegram_payment_notify`
- `environment_code`: `production`

## UI Information Architecture

建议未来统一 `ops` UI 按如下层次组织：

- `Systems`
- `Modules`
- `Services`
- `Resources`
- `Jobs`
- `Service Detail`

`Service Detail` 页签建议：

- `Overview`
- `Runtime`
- `Endpoints`
- `Rules`
- `Knowledge`
- `AI Policy`
- `Match Logs`
- `Error Logs`
- `Audit Logs`

资源相关页面建议：

- `Resources`
- `Resource Detail`
- `Resource Relations`
- `Snapshots`

自动化相关页面建议：

- `Jobs`
- `Job Definitions`
- `Job Runs`
- `Job Run Detail`
- `Change Requests`

## Logging Strategy

### Write to RDS

- 规则
- 回复模板
- 知识库
- 运营命中日志摘要
- 错误日志
- 审计日志
- 服务元数据

### Keep Local

- 调试日志
- 原始消息流
- 临时诊断信息

### Do Not Store by Default

- 所有群消息全文
- 所有未命中消息的完整原文

## Migration Path From Current Prototype

### Phase 1

- 保留当前独立 `bot/` 和 `ops-ui/`
- 将现有 `ops_rules` 风格原型升级为 `registry + content + logs`
- 引入 `ops_services`

### Phase 2

- 为当前 Telegram 客服 bot 创建 `service`
- 让 bot 改为按 `service_id` 读取规则和知识库
- 命中/错误摘要写入新日志表

### Phase 3

- 将支付查询 bot、支付通知 bot 接入
- UI 首页从“内容管理页”升级为“服务列表”

### Phase 4

- 接入 AI policy
- 接入实例心跳与运行态
- 接入统一 secrets 管理引用

### Phase 5

- 接入资源层
- 接入作业执行层
- 将云服务器、DNS、节点等资源纳入统一管理

## Infrastructure Extension

基于本模型的基础设施与自动化扩展设计见：

- `docs/ops/ops-infrastructure-extension-v1.md`

## Notes

- 当前仓库中的 `ops-ui/` 目录只是未来统一运维面板的原型载体
- 最终可以整体迁移到独立 `ops` 工作区
- 但数据库契约应从一开始就按统一 `ops` 平台设计，而不是按单个 bot 的临时需求设计
