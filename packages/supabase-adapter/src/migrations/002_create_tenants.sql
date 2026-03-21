CREATE TABLE tenants (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                    TEXT        NOT NULL,
    slug                    TEXT        NOT NULL UNIQUE,
    config                  JSONB       NOT NULL DEFAULT '{}',
    plan                    TEXT        NOT NULL DEFAULT 'free',
    token_limit_monthly     BIGINT      NOT NULL DEFAULT 1000000,
    query_limit_monthly     BIGINT      NOT NULL DEFAULT 10000,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    active                  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
