CREATE TABLE IF NOT EXISTS ops_systems (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  owner_team VARCHAR(191) NULL,
  description TEXT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_systems_code (code)
);

CREATE TABLE IF NOT EXISTS ops_modules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  system_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  module_type VARCHAR(64) NOT NULL DEFAULT 'generic',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  description TEXT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_modules_system_code (system_id, code),
  CONSTRAINT fk_ops_modules_system_id FOREIGN KEY (system_id) REFERENCES ops_systems(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  system_id BIGINT UNSIGNED NOT NULL,
  module_id BIGINT UNSIGNED NOT NULL,
  environment_code VARCHAR(64) NOT NULL DEFAULT 'production',
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  service_type VARCHAR(64) NOT NULL,
  provider VARCHAR(64) NULL,
  runtime_mode VARCHAR(32) NULL,
  deploy_type VARCHAR(32) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  owner_team VARCHAR(191) NULL,
  description TEXT NULL,
  config_version INT NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_services_module_env_code (module_id, environment_code, code),
  INDEX idx_ops_services_system_module (system_id, module_id, environment_code, enabled),
  CONSTRAINT fk_ops_services_system_id FOREIGN KEY (system_id) REFERENCES ops_systems(id) ON DELETE CASCADE,
  CONSTRAINT fk_ops_services_module_id FOREIGN KEY (module_id) REFERENCES ops_modules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_service_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  instance_key VARCHAR(128) NOT NULL,
  host_name VARCHAR(191) NULL,
  process_manager VARCHAR(64) NULL,
  process_identifier VARCHAR(191) NULL,
  version VARCHAR(64) NULL,
  desired_state VARCHAR(32) NOT NULL DEFAULT 'running',
  actual_state VARCHAR(32) NOT NULL DEFAULT 'unknown',
  health_status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  started_at TIMESTAMP NULL,
  last_heartbeat_at TIMESTAMP NULL,
  last_seen_at TIMESTAMP NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_service_instances_key (service_id, instance_key),
  INDEX idx_ops_service_instances_health (service_id, health_status, last_seen_at),
  CONSTRAINT fk_ops_service_instances_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_service_endpoints (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  endpoint_type VARCHAR(64) NOT NULL,
  provider VARCHAR(64) NULL,
  external_identifier VARCHAR(191) NULL,
  webhook_url TEXT NULL,
  polling_enabled TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ops_service_endpoints_service (service_id, enabled),
  CONSTRAINT fk_ops_service_endpoints_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_service_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  setting_key VARCHAR(191) NOT NULL,
  setting_value_json JSON NULL,
  value_type VARCHAR(32) NOT NULL DEFAULT 'json',
  updated_by VARCHAR(191) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_service_settings_key (service_id, setting_key),
  CONSTRAINT fk_ops_service_settings_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_secret_refs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  secret_key VARCHAR(191) NOT NULL,
  secret_provider VARCHAR(64) NOT NULL,
  secret_reference VARCHAR(255) NOT NULL,
  rotation_policy VARCHAR(64) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_secret_refs_key (service_id, secret_key),
  CONSTRAINT fk_ops_secret_refs_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_rule_sets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  version_no INT NOT NULL DEFAULT 1,
  description TEXT NULL,
  checksum VARCHAR(191) NULL,
  published_at TIMESTAMP NULL,
  published_by VARCHAR(191) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_rule_sets_code (service_id, code, version_no),
  INDEX idx_ops_rule_sets_service_status (service_id, status, version_no),
  CONSTRAINT fk_ops_rule_sets_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_set_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  confidence ENUM('high', 'low') NOT NULL DEFAULT 'high',
  match_type ENUM('includes', 'exact', 'regex', 'word') NOT NULL,
  pattern TEXT NULL,
  keywords_json JSON NULL,
  exclude_keywords_json JSON NULL,
  regex_flags VARCHAR(32) NULL,
  cooldown_seconds INT NULL,
  priority INT NOT NULL DEFAULT 100,
  stop_on_match TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ops_rules_set_enabled (rule_set_id, enabled, confidence, priority),
  CONSTRAINT fk_ops_rules_rule_set_id FOREIGN KEY (rule_set_id) REFERENCES ops_rule_sets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_rule_replies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rule_id BIGINT UNSIGNED NOT NULL,
  reply_text TEXT NOT NULL,
  reply_type VARCHAR(32) NOT NULL DEFAULT 'text',
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ops_rule_replies_rule (rule_id, enabled, sort_order),
  CONSTRAINT fk_ops_rule_replies_rule_id FOREIGN KEY (rule_id) REFERENCES ops_rules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_knowledge_bases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  version_no INT NOT NULL DEFAULT 1,
  description TEXT NULL,
  published_at TIMESTAMP NULL,
  published_by VARCHAR(191) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_knowledge_bases_code (service_id, code, version_no),
  INDEX idx_ops_knowledge_bases_service_status (service_id, status, version_no),
  CONSTRAINT fk_ops_knowledge_bases_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_knowledge_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  knowledge_base_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(191) NOT NULL,
  category VARCHAR(100) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  priority INT NOT NULL DEFAULT 100,
  keywords_json JSON NULL,
  summary TEXT NULL,
  response_text TEXT NULL,
  content_markdown MEDIUMTEXT NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ops_knowledge_items_base_enabled (knowledge_base_id, enabled, priority),
  CONSTRAINT fk_ops_knowledge_items_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES ops_knowledge_bases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_ai_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(128) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  fallback_after_rules TINYINT(1) NOT NULL DEFAULT 1,
  fallback_after_knowledge TINYINT(1) NOT NULL DEFAULT 1,
  temperature DECIMAL(4,2) NULL,
  max_tokens INT NULL,
  system_prompt MEDIUMTEXT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ops_ai_policies_service_enabled (service_id, enabled),
  CONSTRAINT fk_ops_ai_policies_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ops_service_runtime_bindings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  active_rule_set_id BIGINT UNSIGNED NULL,
  active_knowledge_base_id BIGINT UNSIGNED NULL,
  active_ai_policy_id BIGINT UNSIGNED NULL,
  rollout_strategy VARCHAR(64) NOT NULL DEFAULT 'all',
  updated_by VARCHAR(191) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_service_runtime_bindings_service (service_id),
  CONSTRAINT fk_ops_service_runtime_bindings_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE,
  CONSTRAINT fk_ops_service_runtime_bindings_rule_set_id FOREIGN KEY (active_rule_set_id) REFERENCES ops_rule_sets(id) ON DELETE SET NULL,
  CONSTRAINT fk_ops_service_runtime_bindings_knowledge_base_id FOREIGN KEY (active_knowledge_base_id) REFERENCES ops_knowledge_bases(id) ON DELETE SET NULL,
  CONSTRAINT fk_ops_service_runtime_bindings_ai_policy_id FOREIGN KEY (active_ai_policy_id) REFERENCES ops_ai_policies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ops_match_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  instance_id BIGINT UNSIGNED NULL,
  source_kind VARCHAR(32) NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  chat_id BIGINT NULL,
  message_id BIGINT NULL,
  from_id BIGINT NULL,
  confidence VARCHAR(16) NULL,
  status VARCHAR(32) NOT NULL,
  message_excerpt VARCHAR(500) NULL,
  reply_preview TEXT NULL,
  latency_ms INT NULL,
  token_usage_json JSON NULL,
  extra_context_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ops_match_logs_service_created (service_id, created_at),
  INDEX idx_ops_match_logs_service_status (service_id, status, created_at),
  CONSTRAINT fk_ops_match_logs_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE,
  CONSTRAINT fk_ops_match_logs_instance_id FOREIGN KEY (instance_id) REFERENCES ops_service_instances(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ops_error_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  instance_id BIGINT UNSIGNED NULL,
  source VARCHAR(64) NOT NULL,
  error_level VARCHAR(32) NOT NULL DEFAULT 'error',
  error_code VARCHAR(64) NULL,
  error_message TEXT NOT NULL,
  chat_id BIGINT NULL,
  message_id BIGINT NULL,
  error_context_json JSON NULL,
  trace_excerpt TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ops_error_logs_service_created (service_id, created_at),
  INDEX idx_ops_error_logs_service_source (service_id, source, created_at),
  CONSTRAINT fk_ops_error_logs_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE CASCADE,
  CONSTRAINT fk_ops_error_logs_instance_id FOREIGN KEY (instance_id) REFERENCES ops_service_instances(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ops_admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_type VARCHAR(64) NOT NULL DEFAULT 'admin_user',
  actor_identifier VARCHAR(191) NOT NULL,
  service_id BIGINT UNSIGNED NULL,
  action VARCHAR(191) NOT NULL,
  target_table VARCHAR(64) NOT NULL,
  target_id BIGINT NULL,
  request_ip VARCHAR(64) NULL,
  before_state_json JSON NULL,
  after_state_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ops_admin_audit_logs_service_created (service_id, created_at),
  CONSTRAINT fk_ops_admin_audit_logs_service_id FOREIGN KEY (service_id) REFERENCES ops_services(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ops_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  setting_scope VARCHAR(32) NOT NULL DEFAULT 'global',
  scope_id BIGINT UNSIGNED NULL,
  setting_key VARCHAR(191) NOT NULL,
  setting_value_json JSON NULL,
  updated_by VARCHAR(191) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_ops_settings_scope_key (setting_scope, scope_id, setting_key)
);
