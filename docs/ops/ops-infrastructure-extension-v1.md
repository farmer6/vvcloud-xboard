# Ops Infrastructure Extension V1

## Goal

在统一 `ops` 平台中增加基础设施资源管理与自动化执行能力，使平台不仅能纳管 Bot/Worker/Webhook 服务，还能纳管：

- 云服务器生命周期
- Cloudflare DNS 记录
- XBoard 节点映射关系
- 脚本执行与自动化任务

## Relationship To Unified Model

本扩展不是独立系统，而是对以下主模型的延伸：

- `Registry Layer`
- `Logging Layer`
- `Global Settings Layer`

新增：

- `Resource Layer`
- `Job Execution Layer`

## Resource Taxonomy

建议优先支持以下资源类型：

### `cloud_server`

代表云服务器实例。

典型 provider：

- `aliyun`
- `aws`
- `tencent_cloud`

核心识别：

- `resource_key` = 云厂商实例 ID

### `dns_record`

代表 DNS 解析记录。

典型 provider：

- `cloudflare`

核心识别：

- `resource_key` = `zone_id:record_id`

### `xboard_node`

代表 XBoard 系统内的服务器节点或逻辑节点。

核心识别：

- `resource_key` = 节点 ID 或逻辑唯一键

### `ssl_certificate`

代表证书资源。

### `script_runner_target`

代表可被脚本执行的目标，如某台主机、某个跳板、某个任务控制器。

## Resource Model

### `ops_resource_types`

最小字段：

- `id`
- `code`
- `name`
- `category`
- `provider_type`
- `description`
- `metadata_json`

建议分类：

- `infrastructure`
- `network`
- `application`

### `ops_resources`

最小字段：

- `id`
- `system_id`
- `module_id`
- `service_id`
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

典型 `metadata_json`：

#### 云服务器

```json
{
  "instance_type": "ecs.c7.large",
  "private_ip": "10.0.1.10",
  "public_ip": "47.0.0.1",
  "zone": "cn-hongkong-h",
  "image_id": "ubuntu-22.04"
}
```

#### DNS 记录

```json
{
  "zone_name": "example.com",
  "record_name": "hk-node-01",
  "record_type": "A",
  "record_value": "47.0.0.1",
  "proxied": true
}
```

#### XBoard 节点

```json
{
  "node_name": "HK-01",
  "server_type": "vmess",
  "host": "hk-node-01.example.com",
  "port": 443
}
```

### `ops_resource_relations`

用于表达资源图谱关系。

常见关系：

- `runs_on`
  `xboard_node` -> `cloud_server`
- `resolved_by`
  `xboard_node` -> `dns_record`
- `points_to`
  `dns_record` -> `cloud_server`
- `managed_by`
  `cloud_server` -> `service`

最小字段：

- `id`
- `left_resource_id`
- `relation_type`
- `right_resource_id`
- `metadata_json`
- `created_at`

### `ops_resource_snapshots`

资源状态采样表。

用途：

- 保留云主机状态
- 保留 DNS 当前值
- 对比资源漂移

最小字段：

- `id`
- `resource_id`
- `snapshot_type`
- `snapshot_payload_json`
- `collected_at`

## Automation Job Model

### `ops_job_definitions`

定义系统支持的自动化动作模板。

典型任务：

- `create_server`
- `shutdown_server`
- `start_server`
- `destroy_server`
- `update_dns_record`
- `sync_xboard_node`
- `provision_server`

最小字段：

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

### `ops_job_runs`

每一次执行记录。

最小字段：

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

### `ops_job_steps`

多步骤执行明细。

适合以下场景：

1. 创建云服务器
2. 等待公网 IP
3. 写入 Cloudflare A 记录
4. 注册/更新 XBoard 节点
5. 输出最终信息

最小字段：

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

### `ops_change_requests`

高风险动作审批入口。

适用场景：

- 删除服务器
- 改动生产 DNS
- 批量停机

最小字段：

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

## Example Service Layout

### 1. 服务器生命周期管理

- `system_code`: `xboard`
- `module_code`: `infrastructure`
- `service_code`: `server_lifecycle_manager`

负责：

- 创建/关闭/销毁云服务器
- 同步云主机状态

### 2. Cloudflare DNS 管理

- `system_code`: `xboard`
- `module_code`: `network_edge`
- `service_code`: `cloudflare_dns_manager`

负责：

- 创建/修改/删除 DNS 记录
- 快照记录当前解析状态

### 3. 节点编排服务

- `system_code`: `xboard`
- `module_code`: `infrastructure`
- `service_code`: `xboard_node_orchestrator`

负责：

- 将云服务器、DNS 记录、XBoard 节点映射起来
- 一键上下线节点

## Example Flows

### Create A New Server Node

1. UI 发起 `create_server` job
2. `server_lifecycle_manager` 创建云主机
3. 写入 `ops_resources(cloud_server)`
4. `cloudflare_dns_manager` 执行 `update_dns_record`
5. 写入 `ops_resources(dns_record)`
6. `xboard_node_orchestrator` 创建或更新 `xboard_node`
7. 建立三者关系：
   - `xboard_node runs_on cloud_server`
   - `dns_record points_to cloud_server`
   - `xboard_node resolved_by dns_record`
8. 执行链路写入 `ops_job_runs` / `ops_job_steps`

### Disable A Node

1. 选择 `xboard_node`
2. 创建 `disable_node` job
3. 下线 XBoard 节点
4. 可选执行 DNS 切流或删除解析
5. 可选关闭云服务器
6. 写入审计日志和执行日志

## UI Information Architecture

建议统一 `ops` UI 在未来增加：

- `Resources`
- `Resource Detail`
- `Relations`
- `Snapshots`
- `Jobs`
- `Job Definitions`
- `Job Runs`
- `Job Run Detail`
- `Change Requests`

## Security Notes

- 云 API Key、Cloudflare Token 不直接存数据库明文
- 统一使用 `ops_secret_refs`
- 高风险动作接审批流
- 任务执行日志与资源状态变更必须进入审计链

## Recommended Rollout

### Phase A

- 完成 `service` 层建模
- 将 Telegram bot 纳入统一 ops

### Phase B

- 引入 `Resource Layer`
- 先纳管 `cloud_server` 和 `dns_record`

### Phase C

- 引入 `Job Execution Layer`
- 先支持只读同步，再支持写操作

### Phase D

- 接入 XBoard 节点编排
- 实现节点与云资源、DNS 记录联动
