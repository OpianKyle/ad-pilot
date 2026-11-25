import type { Pool } from "mysql2/promise";
import { getMysqlPool } from "./mysql";

let schemaReady: Promise<void> | undefined;

const statements = [
  `CREATE TABLE IF NOT EXISTS adpilot_business_access (
    business_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    status ENUM('pending','active','suspended') NOT NULL DEFAULT 'active',
    plan VARCHAR(80) NOT NULL DEFAULT 'Pilot',
    monthly_generation_limit INT UNSIGNED NOT NULL DEFAULT 30,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_adpilot_business_access_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_workspace_settings (
    business_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    settings JSON NOT NULL,
    updated_by BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_provider_vault (
    business_id BIGINT UNSIGNED NOT NULL,
    provider VARCHAR(24) NOT NULL,
    encrypted_payload TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (business_id, provider)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_media (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    business_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(120) NOT NULL,
    object_path VARCHAR(512) NOT NULL,
    mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
    rights_confirmed TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('uploading','ready','failed') NOT NULL DEFAULT 'uploading',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_adpilot_media_business (business_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_campaign_briefs (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    business_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    config JSON NOT NULL,
    daily_enabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_adpilot_briefs_business (business_id, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_creatives (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    business_id BIGINT UNSIGNED NOT NULL,
    brief_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    config_snapshot JSON NOT NULL,
    content JSON NULL,
    image_path VARCHAR(512) NULL,
    error TEXT NULL,
    scheduled_at DATETIME NULL,
    daily_slot VARCHAR(160) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_adpilot_creatives_queue (status, created_at),
    KEY idx_adpilot_creatives_business (business_id, created_at),
    KEY idx_adpilot_creatives_schedule (status, scheduled_at),
    UNIQUE KEY uq_adpilot_daily_slot (business_id, daily_slot)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_deliveries (
    creative_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    business_id BIGINT UNSIGNED NOT NULL,
    platform VARCHAR(24) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'pending',
    remote_id VARCHAR(255) NULL,
    asset_id VARCHAR(255) NULL,
    error TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (creative_id, platform),
    KEY idx_adpilot_deliveries_business (business_id, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_paid_campaigns (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    business_id BIGINT UNSIGNED NOT NULL,
    creative_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(150) NOT NULL,
    plan JSON NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'draft',
    remote JSON NULL,
    metrics JSON NULL,
    error TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_adpilot_paid_business (business_id, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_oauth_states (
    state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    business_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    provider VARCHAR(24) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_adpilot_oauth_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_meta_identities (
    business_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    meta_user_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    connected_at DATETIME NOT NULL,
    KEY idx_adpilot_meta_user_hash (meta_user_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_meta_posts (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    business_id BIGINT UNSIGNED NOT NULL,
    caption VARCHAR(2200) NOT NULL,
    hashtags VARCHAR(1000) NOT NULL DEFAULT '',
    asset_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    scheduled_at DATETIME NOT NULL,
    platforms JSON NOT NULL,
    status ENUM('scheduled','publishing','published','needs_attention','cancelled') NOT NULL DEFAULT 'scheduled',
    facebook_state VARCHAR(32) NULL,
    instagram_state VARCHAR(32) NULL,
    facebook_remote_id VARCHAR(255) NULL,
    instagram_remote_id VARCHAR(255) NULL,
    error TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_adpilot_meta_posts_queue (status, scheduled_at),
    KEY idx_adpilot_meta_posts_business (business_id, created_at),
    KEY idx_adpilot_meta_posts_asset (business_id, asset_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_meta_deletion_requests (
    code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    requested_at DATETIME NOT NULL,
    KEY idx_adpilot_meta_deletion_requested (requested_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_password_resets (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_adpilot_password_resets_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS adpilot_activity (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    business_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NULL,
    message VARCHAR(500) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_adpilot_activity_business (business_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

async function applySchema(pool: Pool): Promise<void> {
  for (const statement of statements) await pool.query(statement);
  // Existing businesses keep access after this feature is added. New
  // registrations are explicitly inserted as active in the auth route.
  await pool.query(
    `INSERT IGNORE INTO adpilot_business_access
      (business_id, status, plan, monthly_generation_limit)
     SELECT id, 'active', 'Pilot', 30 FROM businesses`,
  );
}

export async function ensureAdpilotSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = applySchema(getMysqlPool()).catch((error: unknown) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}
