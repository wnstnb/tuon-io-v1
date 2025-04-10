-- Table to store web search history
CREATE TABLE web_searches (
    search_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique identifier for each search
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, -- Link to the user who performed the search
    query TEXT NOT NULL, -- The search query entered by the user
    search_provider VARCHAR(50), -- Optional: e.g., 'ExaSearch', 'Google', etc.
    results JSONB, -- Store search results (e.g., links, snippets) as JSON
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL -- Timestamp of when the search was performed
);

-- Optional: Index for faster querying by user_id
CREATE INDEX idx_web_searches_user_id ON web_searches(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE web_searches ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own search history
CREATE POLICY "Allow users to view own web searches"
ON web_searches
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own searches
CREATE POLICY "Allow users to insert own web searches"
ON web_searches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own searches (optional)
CREATE POLICY "Allow users to delete own web searches"
ON web_searches
FOR DELETE
USING (auth.uid() = user_id); 