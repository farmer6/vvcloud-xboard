# Unified Ops Implementation Roadmap V1

## Goal

将当前工作区中的轻量 `ops-ui/` 原型，逐步推进为未来可独立迁移的统一 `ops` 运维平台。

本路线图用于固化阶段边界，避免在后续实现中把：

- 当前 Telegram 客服 bot 的短期需求
- 多 bot 统一纳管
- 未来基础设施与自动化执行能力

混在同一阶段里，导致模型和代码反复返工。

## Phase 1

目标：先完成“服务层闭环”，让当前 Telegram 客服 bot 作为统一 `ops` 体系中的第一个标准 `service` 接入。

范围：

- `Registry Layer`
  - `ops_systems`
  - `ops_modules`
  - `ops_services`
  - `ops_service_instances`
  - `ops_service_endpoints`
  - `ops_service_settings`
  - `ops_secret_refs`
- `Content Layer`
  - `ops_rule_sets`
  - `ops_rules`
  - `ops_rule_replies`
  - `ops_knowledge_bases`
  - `ops_knowledge_items`
  - `ops_ai_policies`
- `Runtime Binding Layer`
  - `ops_service_runtime_bindings`
- `Logging Layer`
  - `ops_match_logs`
  - `ops_error_logs`
  - `ops_admin_audit_logs`
- `Global Settings Layer`
  - `ops_settings`

交付目标：

- `ops-ui` 以 `system / module / service / environment` 为核心视角
- 当前客服 bot 能按 `service_id + runtime binding` 读取规则/知识库
- bot 只把摘要运营日志写入 `RDS`
- 本地 `journal` 继续保留调试日志和原始消息流

当前阶段边界：

- 不在本阶段内实现资源管理
- 不在本阶段内实现自动化任务编排
- 不在本阶段内实现完整 AI 问答流程，只保留数据模型入口

## Phase 2

目标：在统一 `ops` 平台中加入“资源层”，让平台能够描述和管理被运维的对象，而不只是服务进程。

范围：

- `ops_resource_types`
- `ops_resources`
- `ops_resource_relations`
- `ops_resource_snapshots`

优先资源类型：

- `cloud_server`
- `dns_record`
- `xboard_node`
- `ssl_certificate`
- `script_runner_target`

交付目标：

- UI 能按资源类型查看资源
- 能表示：
  - 节点运行在哪台服务器上
  - DNS 指向哪台服务器
  - 某资源由哪个服务维护

阶段边界：

- 先建模和展示，不急于在本阶段里做复杂的执行编排

## Phase 3

目标：加入“任务执行层”，实现自动化动作、变更留痕和未来审批流能力。

范围：

- `ops_job_definitions`
- `ops_job_runs`
- `ops_job_steps`
- `ops_change_requests`

优先任务类型：

- `create_server`
- `shutdown_server`
- `start_server`
- `destroy_server`
- `update_dns_record`
- `sync_xboard_node`
- `provision_server`

交付目标：

- UI 发起标准化任务
- 记录每次执行、每个步骤和最终结果
- 为未来的云 API、脚本执行、审批流预留统一通道

## Current Mapping

当前已明确的服务映射：

- `xboard / bot / telegram_support / production`
- `payment_gateway / bot / telegram_payment_query / production`
- `payment_gateway / bot / telegram_payment_notify / production`

未来可继续扩展：

- `xboard / infrastructure / server_lifecycle_manager / production`
- `xboard / network_edge / cloudflare_dns_manager / production`
- `xboard / infrastructure / xboard_node_orchestrator / production`

## Working Rules

- `ops-ui/` 当前只是统一 `ops` 的轻量原型，不复用 Laravel
- 代码与规则/知识库/运营日志分层管理
- `RDS` 存内容与运营数据，本地 `journal` 存调试日志
- 不把所有群消息全文写入 `RDS`
- 所有新模块优先挂到 `service` 维度，而不是继续增加临时作用域字段
