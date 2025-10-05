-- Axiom AI - Enterprise Knowledge Schema Migration
-- Adds hierarchical enterprise knowledge extraction capabilities

-- ============================================================================
-- NEW TABLES FOR ENTERPRISE KNOWLEDGE SYSTEM
-- ============================================================================

-- 1. Framework Fingerprints - Detect languages, frameworks, and custom components
CREATE TABLE core.framework_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    framework_type VARCHAR(100) NOT NULL, -- "Spring Boot", "Django", "Express", etc.
    framework_version VARCHAR(50),
    is_custom BOOLEAN DEFAULT false,
    package_name VARCHAR(255), -- "com.abc.r1", "@company/core", etc.
    custom_components JSONB DEFAULT '[]', -- [{name, type, usage, occurrence_count}]
    dependency_file TEXT, -- path to pom.xml, package.json, etc.
    config_namespaces TEXT[] DEFAULT '{}', -- ["ginger.*", "abc.*"]
    detected_languages JSONB DEFAULT '{}', -- {java: 450, python: 23}
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_frameworks_repo ON core.framework_fingerprints(repository_id);
CREATE INDEX idx_frameworks_custom ON core.framework_fingerprints(is_custom);

-- 2. Architecture Patterns - Design patterns and architectural decisions
CREATE TABLE core.architecture_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    pattern_type VARCHAR(100) NOT NULL, -- "event-driven", "microservices", "monolith", etc.
    pattern_name VARCHAR(255),
    description TEXT,
    rationale TEXT,
    evidence_source TEXT, -- "docs/ADR-015.md" or "inferred from code"
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    details JSONB DEFAULT '{}', -- {message_broker, service_count, communication_patterns}
    technologies JSONB DEFAULT '[]', -- [{name, purpose, reasoning}]
    communication_patterns JSONB DEFAULT '[]', -- ["REST", "gRPC", "event-bus"]
    principles TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_arch_patterns_repo ON core.architecture_patterns(repository_id);
CREATE INDEX idx_arch_patterns_type ON core.architecture_patterns(pattern_type);
CREATE INDEX idx_arch_patterns_confidence ON core.architecture_patterns(confidence_score DESC);

-- 3. Domain Models - Business domain knowledge graph
CREATE TABLE core.domain_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) NOT NULL,
    summary TEXT,
    entities JSONB DEFAULT '[]', -- [{name, fields, relationships, validations}]
    services JSONB DEFAULT '[]', -- [{name, operations, dependencies}]
    relationships JSONB DEFAULT '[]', -- [{from, to, type, description}]
    business_rules TEXT[],
    operations TEXT[],
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_domains_repo_name ON core.domain_models(repository_id, domain_name);
CREATE INDEX idx_domains_name ON core.domain_models(domain_name);

-- 4. Code Patterns - Implementation patterns and templates
CREATE TABLE core.code_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    pattern_name VARCHAR(255) NOT NULL,
    language VARCHAR(50) NOT NULL,
    category VARCHAR(100), -- "api_client", "database_access", "error_handling", etc.
    frequency INTEGER DEFAULT 0,
    is_standard BOOLEAN DEFAULT false,
    template TEXT,
    explanation TEXT,
    when_to_use TEXT,
    configuration_options JSONB DEFAULT '[]', -- [{param, description, default}]
    examples JSONB DEFAULT '[]', -- [{file, line, code, context}]
    variations JSONB DEFAULT '[]', -- [{frequency, reason, is_valid, recommendation}]
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_patterns_repo_cat ON core.code_patterns(repository_id, category);
CREATE INDEX idx_patterns_standard ON core.code_patterns(repository_id, is_standard);
CREATE INDEX idx_patterns_frequency ON core.code_patterns(repository_id, frequency DESC);
CREATE INDEX idx_patterns_language ON core.code_patterns(language);

-- 5. API Specifications - External and internal API specs
CREATE TABLE core.api_specifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    api_name VARCHAR(255) NOT NULL,
    base_url TEXT,
    version VARCHAR(50),
    authentication_method VARCHAR(100), -- "OAuth2 Bearer", "API Key", etc.
    endpoints JSONB DEFAULT '[]', -- [{method, path, request_schema, response_schema, security}]
    common_headers JSONB DEFAULT '{}', -- {Authorization: "Bearer", request-id: "uuid"}
    rate_limits JSONB DEFAULT '{}',
    error_codes JSONB DEFAULT '[]',
    source TEXT, -- "openapi.yaml", "swagger.json", "inferred from code"
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_apis_repo ON core.api_specifications(repository_id);
CREATE INDEX idx_apis_name ON core.api_specifications(api_name);

-- 6. Extraction Logs - Track extraction pipeline execution
CREATE TABLE core.extraction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    component VARCHAR(100) NOT NULL, -- "RepositoryAnalyzer", "DomainExtractor", etc.
    status VARCHAR(50) CHECK (status IN ('started', 'completed', 'failed', 'partial')) DEFAULT 'started',
    duration_ms INTEGER,
    items_extracted INTEGER DEFAULT 0,
    cost_usd DECIMAL(10,4) DEFAULT 0,
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_logs_repo_component ON core.extraction_logs(repository_id, component);
CREATE INDEX idx_logs_status ON core.extraction_logs(status);
CREATE INDEX idx_logs_started ON core.extraction_logs(started_at DESC);

-- 7. Context Cache - Cache assembled hierarchical context
CREATE TABLE vector.context_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repository_id UUID REFERENCES core.repositories(id) ON DELETE CASCADE,
    query_hash VARCHAR(64) NOT NULL,
    query_text TEXT NOT NULL,
    intent_classification JSONB, -- {domain, operation, category, technologies}
    assembled_context JSONB NOT NULL, -- {architecture, domain, patterns, standards}
    enhanced_prompt TEXT,
    tokens_used INTEGER,
    context_quality_score FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    access_count INTEGER DEFAULT 1,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_context_cache_repo_query ON vector.context_cache(repository_id, query_hash);
CREATE INDEX idx_context_cache_expires ON vector.context_cache(expires_at);

-- ============================================================================
-- UPDATE EXISTING TABLES
-- ============================================================================

-- Add enterprise knowledge tracking to repositories table
ALTER TABLE core.repositories ADD COLUMN IF NOT EXISTS primary_language VARCHAR(50);
ALTER TABLE core.repositories ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE core.repositories ADD COLUMN IF NOT EXISTS extraction_duration_ms INTEGER;
ALTER TABLE core.repositories ADD COLUMN IF NOT EXISTS extraction_cost_usd DECIMAL(10,2);
ALTER TABLE core.repositories ADD COLUMN IF NOT EXISTS extraction_status VARCHAR(50) 
    CHECK (extraction_status IN ('pending', 'analyzing', 'completed', 'failed', 'partial'));

CREATE INDEX IF NOT EXISTS idx_repositories_extraction_status ON core.repositories(extraction_status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at for new tables
CREATE TRIGGER update_framework_fingerprints_updated_at 
    BEFORE UPDATE ON core.framework_fingerprints 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_architecture_patterns_updated_at 
    BEFORE UPDATE ON core.architecture_patterns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domain_models_updated_at 
    BEFORE UPDATE ON core.domain_models 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_code_patterns_updated_at 
    BEFORE UPDATE ON core.code_patterns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_specifications_updated_at 
    BEFORE UPDATE ON core.api_specifications 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get hierarchical context for a repository
CREATE OR REPLACE FUNCTION get_enterprise_context(
    repo_id UUID,
    domain_filter TEXT DEFAULT NULL,
    category_filter TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'repository', (SELECT row_to_json(r) FROM core.repositories r WHERE r.id = repo_id),
        'frameworks', (
            SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb)
            FROM core.framework_fingerprints f
            WHERE f.repository_id = repo_id
        ),
        'architecture', (
            SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb)
            FROM core.architecture_patterns a
            WHERE a.repository_id = repo_id
            ORDER BY a.confidence_score DESC
            LIMIT 5
        ),
        'domains', (
            SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
            FROM core.domain_models d
            WHERE d.repository_id = repo_id
            AND (domain_filter IS NULL OR d.domain_name ILIKE '%' || domain_filter || '%')
        ),
        'patterns', (
            SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
            FROM core.code_patterns p
            WHERE p.repository_id = repo_id
            AND (category_filter IS NULL OR p.category = category_filter)
            AND p.is_standard = true
            ORDER BY p.frequency DESC
            LIMIT 10
        ),
        'apis', (
            SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb)
            FROM core.api_specifications a
            WHERE a.repository_id = repo_id
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate pattern frequency threshold for "standard" classification
CREATE OR REPLACE FUNCTION calculate_pattern_threshold(repo_id UUID, total_occurrences INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    total_files INTEGER;
    frequency_percentage FLOAT;
BEGIN
    SELECT file_count INTO total_files
    FROM core.repositories
    WHERE id = repo_id;
    
    IF total_files IS NULL OR total_files = 0 THEN
        RETURN false;
    END IF;
    
    frequency_percentage := (total_occurrences::FLOAT / total_files::FLOAT) * 100;
    
    -- Consider pattern "standard" if used in >70% of applicable files
    RETURN frequency_percentage > 70;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_enterprise_context TO axiom;
GRANT EXECUTE ON FUNCTION calculate_pattern_threshold TO axiom;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE core.framework_fingerprints IS 'Stores detected frameworks, languages, and custom components from repository analysis';
COMMENT ON TABLE core.architecture_patterns IS 'Stores extracted architectural patterns and design decisions from code and documentation';
COMMENT ON TABLE core.domain_models IS 'Stores business domain knowledge including entities, services, and relationships';
COMMENT ON TABLE core.code_patterns IS 'Stores implementation patterns, templates, and code conventions extracted from the codebase';
COMMENT ON TABLE core.api_specifications IS 'Stores API specifications extracted from OpenAPI docs or inferred from code';
COMMENT ON TABLE core.extraction_logs IS 'Tracks execution of extraction pipeline components for debugging and monitoring';
COMMENT ON TABLE vector.context_cache IS 'Caches assembled hierarchical context for fast query response';

COMMENT ON FUNCTION get_enterprise_context IS 'Retrieves complete hierarchical enterprise context for a repository with optional filtering';
COMMENT ON FUNCTION calculate_pattern_threshold IS 'Determines if a code pattern should be classified as "standard" based on frequency';

