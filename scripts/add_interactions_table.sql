-- Add chat interactions table for RAG analytics
CREATE TABLE IF NOT EXISTS chat_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    sources JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for analytics
CREATE INDEX IF NOT EXISTS idx_chat_interactions_session_id ON chat_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_interactions_created_at ON chat_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_interactions_query_fts ON chat_interactions USING GIN (to_tsvector('english', query));

-- Create view for RAG analytics
CREATE OR REPLACE VIEW rag_analytics AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total_queries,
    AVG((metadata->>'processingTime')::numeric) as avg_processing_time,
    AVG((metadata->>'chunksFound')::numeric) as avg_chunks_found,
    AVG((metadata->>'chunksUsed')::numeric) as avg_chunks_used,
    AVG((metadata->>'contextLength')::numeric) as avg_context_length
FROM chat_interactions 
WHERE metadata IS NOT NULL
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

COMMENT ON TABLE chat_interactions IS 'Stores RAG query interactions for analytics';
COMMENT ON VIEW rag_analytics IS 'Daily RAG performance analytics';
