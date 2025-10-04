-- Axiom AI Database Schema
-- PostgreSQL with pgvector extension for vector operations

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas for organization
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS queue;

-- ============================================================================
-- CORE SCHEMA - Main business entities
-- ============================================================================

-- Enterprises (top-level organizations)
CREATE TABLE core.enterprises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    subscription_tier VARCHAR(50) DEFAULT 'free',
    max_workspaces INTEGER DEFAULT 5,
    max_repositories INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workspaces (teams within enterprises)
CREATE TABLE core.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enterprise_id UUID REFERENCES core.enterprises(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    settings JSONB DEFAULT '{}',
    llm_config JSONB DEFAULT '{}', -- LLM provider configurations
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(enterprise_id, slug)
);

-- Users
CREATE TABLE core.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    password_hash VARCHAR(255), -- For local auth
    provider VARCHAR(50) DEFAULT 'local', -- oauth provider
    provider_id VARCHAR(255),
    role VARCHAR(50) DEFAULT 'developer', -- super_admin, workspace_admin, developer, viewer
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workspace memberships
CREATE TABLE core.workspace_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES core.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES core.users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'developer', -- workspace_admin, developer, viewer
    permissions JSONB DEFAULT '{}',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- Git repositories
CREATE TABLE core.repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES core.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    branch VARCHAR(100) DEFAULT 'main',
    auth_type VARCHAR(50) NOT NULL, -- ssh, token, oauth, basic
    auth_config JSONB NOT NULL, -- encrypted credentials
    local_path VARCHAR(500),
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_commit_hash VARCHAR(40),
    sync_status VARCHAR(50) DEFAULT 'pending', -- pending, syncing, completed, failed
    sync_error TEXT,
    file_count INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, url)
);

-- MCP tokens for IDE integration
CREATE TABLE core.mcp_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES core.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES core.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '{}',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- VECTOR SCHEMA - Embeddings and search data
-- ============================================================================

-- Code patterns with embeddings
CREATE TABLE vector.code_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type VARCHAR(50),
    language VARCHAR(50),
    function_name VARCHAR(255),
    class_name VARCHAR(255),
    code_snippet TEXT NOT NULL,
    full_content TEXT,
    line_start INTEGER,
    line_end INTEGER,
    pattern_type VARCHAR(50), -- function, class, import, config, etc.
    complexity_score FLOAT,
    embedding vector(1536), -- OpenAI embedding dimension
    metadata JSONB DEFAULT '{}',
    commit_hash VARCHAR(40),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for vector operations
CREATE INDEX idx_code_patterns_embedding ON vector.code_patterns USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_code_patterns_repository ON vector.code_patterns(repository_id);
CREATE INDEX idx_code_patterns_file_path ON vector.code_patterns(file_path);
CREATE INDEX idx_code_patterns_language ON vector.code_patterns(language);
CREATE INDEX idx_code_patterns_pattern_type ON vector.code_patterns(pattern_type);

-- Full-text search index
CREATE INDEX idx_code_patterns_content_fts ON vector.code_patterns USING gin(to_tsvector('english', code_snippet));

-- Search cache for performance
CREATE TABLE vector.search_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_hash VARCHAR(64) NOT NULL,
    workspace_id UUID REFERENCES core.workspaces(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    results JSONB NOT NULL,
    result_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_search_cache_query_hash ON vector.search_cache(query_hash);
CREATE INDEX idx_search_cache_workspace ON vector.search_cache(workspace_id);
CREATE INDEX idx_search_cache_expires ON vector.search_cache(expires_at);

-- ============================================================================
-- AUDIT SCHEMA - Logging and compliance
-- ============================================================================

-- Audit logs for compliance
CREATE TABLE audit.logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES core.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_workspace ON audit.logs(workspace_id);
CREATE INDEX idx_audit_logs_user ON audit.logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit.logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit.logs(created_at);

-- Security scan results
CREATE TABLE audit.security_scans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    scan_type VARCHAR(50) NOT NULL, -- owasp, cve, dependency, compliance
    severity VARCHAR(20) NOT NULL, -- critical, high, medium, low, info
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_path TEXT,
    line_number INTEGER,
    rule_id VARCHAR(100),
    cwe_id VARCHAR(20),
    cve_id VARCHAR(20),
    remediation TEXT,
    status VARCHAR(20) DEFAULT 'open', -- open, acknowledged, fixed, false_positive
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_security_scans_repository ON audit.security_scans(repository_id);
CREATE INDEX idx_security_scans_severity ON audit.security_scans(severity);
CREATE INDEX idx_security_scans_status ON audit.security_scans(status);

-- ============================================================================
-- QUEUE SCHEMA - Background job processing
-- ============================================================================

-- Queue jobs (Bull queue persistence)
CREATE TABLE queue.jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    queue_name VARCHAR(100) NOT NULL,
    job_id VARCHAR(255) NOT NULL,
    job_type VARCHAR(100) NOT NULL,
    data JSONB NOT NULL,
    options JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'waiting', -- waiting, active, completed, failed, delayed
    progress INTEGER DEFAULT 0,
    result JSONB,
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    delay INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_queue_jobs_queue_name ON queue.jobs(queue_name);
CREATE INDEX idx_queue_jobs_status ON queue.jobs(status);
CREATE INDEX idx_queue_jobs_priority ON queue.jobs(priority DESC);
CREATE INDEX idx_queue_jobs_created_at ON queue.jobs(created_at);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers to relevant tables
CREATE TRIGGER update_enterprises_updated_at BEFORE UPDATE ON core.enterprises FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON core.workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON core.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_repositories_updated_at BEFORE UPDATE ON core.repositories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_code_patterns_updated_at BEFORE UPDATE ON vector.code_patterns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_security_scans_updated_at BEFORE UPDATE ON audit.security_scans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function for vector similarity search
CREATE OR REPLACE FUNCTION search_code_patterns(
    query_embedding vector(1536),
    workspace_id_param UUID,
    similarity_threshold FLOAT DEFAULT 0.7,
    result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    file_path TEXT,
    code_snippet TEXT,
    language VARCHAR(50),
    pattern_type VARCHAR(50),
    similarity FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cp.id,
        cp.file_path,
        cp.code_snippet,
        cp.language,
        cp.pattern_type,
        (1 - (cp.embedding <=> query_embedding)) as similarity
    FROM vector.code_patterns cp
    JOIN core.repositories r ON cp.repository_id = r.id
    WHERE r.workspace_id = workspace_id_param
      AND (1 - (cp.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY similarity DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- Function for hybrid search (vector + keyword)
CREATE OR REPLACE FUNCTION hybrid_search_code_patterns(
    query_text TEXT,
    query_embedding vector(1536),
    workspace_id_param UUID,
    similarity_threshold FLOAT DEFAULT 0.5,
    result_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    file_path TEXT,
    code_snippet TEXT,
    language VARCHAR(50),
    pattern_type VARCHAR(50),
    vector_score FLOAT,
    text_score FLOAT,
    combined_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cp.id,
        cp.file_path,
        cp.code_snippet,
        cp.language,
        cp.pattern_type,
        (1 - (cp.embedding <=> query_embedding)) as vector_score,
        ts_rank(to_tsvector('english', cp.code_snippet), plainto_tsquery('english', query_text)) as text_score,
        (
            0.6 * (1 - (cp.embedding <=> query_embedding)) + 
            0.4 * ts_rank(to_tsvector('english', cp.code_snippet), plainto_tsquery('english', query_text))
        ) as combined_score
    FROM vector.code_patterns cp
    JOIN core.repositories r ON cp.repository_id = r.id
    WHERE r.workspace_id = workspace_id_param
      AND (
        (1 - (cp.embedding <=> query_embedding)) > similarity_threshold
        OR to_tsvector('english', cp.code_snippet) @@ plainto_tsquery('english', query_text)
      )
    ORDER BY combined_score DESC
    LIMIT result_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA SETUP
-- ============================================================================

-- Create default enterprise and workspace for development
INSERT INTO core.enterprises (id, name, slug, subscription_tier) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Enterprise', 'default', 'enterprise');

INSERT INTO core.workspaces (id, enterprise_id, name, slug, description)
VALUES (
    '00000000-0000-0000-0000-000000000002', 
    '00000000-0000-0000-0000-000000000001', 
    'Default Workspace', 
    'default', 
    'Default workspace for development and testing'
);

-- Create default admin user
INSERT INTO core.users (id, email, name, role)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    'admin@axiom.ai',
    'System Administrator',
    'super_admin'
);

-- Add admin to default workspace
INSERT INTO core.workspace_members (workspace_id, user_id, role)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    'workspace_admin'
);

-- Create indexes for performance
CREATE INDEX CONCURRENTLY idx_repositories_workspace_active ON core.repositories(workspace_id) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_users_email_active ON core.users(email) WHERE is_active = true;
CREATE INDEX CONCURRENTLY idx_mcp_tokens_workspace_active ON core.mcp_tokens(workspace_id) WHERE is_active = true;

-- Grant permissions to application user
GRANT USAGE ON SCHEMA core, vector, audit, queue TO axiom;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA core, vector, audit, queue TO axiom;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA core, vector, audit, queue TO axiom;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core, vector, audit, queue TO axiom;
