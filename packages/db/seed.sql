-- =============================================================================
-- Steno AI Memory System — Development Seed Data
-- =============================================================================
-- Intended for local development only. Do NOT run in production.
-- =============================================================================

-- Test tenant
INSERT INTO tenants (
    id,
    name,
    slug,
    config,
    plan,
    token_limit_monthly,
    query_limit_monthly,
    active
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Test Tenant',
    'test-tenant',
    '{"tier": "pro", "features": ["hive", "entity_graph", "triggers"]}',
    'pro',
    10000000,
    100000,
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- Test API key
-- key_hash is a placeholder SHA-256 hex; real keys are hashed before storage
INSERT INTO api_keys (
    id,
    tenant_id,
    key_hash,
    key_prefix,
    name,
    scopes,
    active
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', -- SHA-256 of empty string (placeholder)
    'sk_steno_tes',
    'Development Key',
    ARRAY['read', 'write', 'admin'],
    TRUE
) ON CONFLICT DO NOTHING;

-- Test session
INSERT INTO sessions (
    id,
    tenant_id,
    scope,
    scope_id,
    started_at,
    summary,
    topics,
    message_count,
    fact_count,
    metadata
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'user',
    'dev-user-001',
    NOW(),
    'Development seed session for local testing.',
    ARRAY['onboarding', 'testing'],
    0,
    0,
    '{"source": "seed", "environment": "development"}'
) ON CONFLICT DO NOTHING;
