-- Drop existing RLS policies
DROP POLICY IF EXISTS "Allow users to view own web searches" ON web_searches;
DROP POLICY IF EXISTS "Allow users to insert own web searches" ON web_searches;
DROP POLICY IF EXISTS "Allow users to delete own web searches" ON web_searches;

-- Create updated policies
-- Policy: Users can only see their own search history
CREATE POLICY "Allow users to view own web searches"
ON web_searches
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own searches (with explicit user_id check)
CREATE POLICY "Allow users to insert own web searches"
ON web_searches
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own searches
CREATE POLICY "Allow users to delete own web searches"
ON web_searches
FOR DELETE
USING (auth.uid() = user_id);

-- Ensure proper table grants are in place for authenticated users
GRANT SELECT, INSERT, DELETE ON web_searches TO authenticated; 