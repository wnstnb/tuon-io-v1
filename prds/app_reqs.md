# tuon.io - Your IDE for everything.
Tuon is the Tagalog word for "focus." Tuon.io is an AI-powered content creation and management platform that stores your content in one place and empowers you to craft, enhance, and organize your work with precision. 

## General Overview of Features
- **Unobtrusive AI Editor**: Edit smarter, not harder.
   - Target specific sections with laser focus by highlighting, or.
   - Edit the entire document in seconds. Your choice
   - Multiple post enhancement options (regenerate, add a sentence, enhance writing, apply custom instructions)

- **One-click processing**: Save or dislike content with one click.  
   - Saves tell the AI editor what you want more of.
   - Dislikes tell it what to avoid.

- **Content Database**: What you and the AI editor use to amplify your voice.
   - Automatic tone inference and tagging allows for precise content tailoring and personalized messaging.
   - Vector storage with Supabase allows for efficient semantic search and retrieval of relevant content.
   - Knowledge base management (tag editing, entry deletion)
   - User feedback mechanism

- **Automated tagging**: Let the AI editor sort and file so you can focus on making your content and easily find later.
   - Think less about where you put things. Put that energy to doing more.
   - Still able to apply manual labels as needed

# App flow
## Starting page
This is where the user starts. Will have a single chat input element that has the ability to switch model types and take multimodal input. After some input, they will transfer over to the 3 pane 

## Artifacts (CENTER PANE)
These are the objects created by the user. Text and image support, maybe embedding videos if necessary. I'd like to use @mdxeditor/editor for this.
Other requirements:
- MVP:
    - Ability to highlight and right click on text and have some options to modify based on custom instructions (NEED AGENT)
    - Infer title for artifact based on what is in there or on conversation (NEED AGENT)
    - Ability to add in tool calls as defined by the user.

## Chat Input
Users can start with a blank canvas for the artifact or not. This chat will reference whatever is currently in the artifact, or determine whether it needs to make an artifact or not (NEED AGENT)
Other requirements:
- MVP:
    - Should have the ability to switch model types, like a dropdown. Let's spec for GPT-4o + o3-mini and Gemini 2.0 + Gemini 2.5 (NEED API KEYS FOR THESE)
- FUTURE STATE:
    - Should have functionality to create different assistants. These assistants should be able to take specific instructions and multimodel processing. 

## Productivity Pane (LEFT PANE)
This pane will be to the left of the Artifact area and will have 4 tabs that the user can click through:
- MVP: 
    - Conversation tab: What is happening in the current conversation
    - Files tab: 
        - File explorer for their artifacts. Should have search functionality
        - Artifacts will automatically get tagged based on a set of tags, User will need to put them in a file or they stay unfiled. 
        - If tagged: RAG Agent will learn how to tag and unobtrusively suggest a tag in the title area of the Artifact pane.
        - If filed: RAG Agent will learn how where to file this conversation and unobtrusively suggest it in title area of the Artifact pane.
        Artifacts can be filed or tagged.

## Web Search Pane (RIGHT PANE)
This pane will be powered by Perplexity AI and enable users to be able to web search within the app itself
- MVP:
    - Users can use this manually
- FUTURE STATE:
    - NEED AGENT to infer whether web search is needed based on input.

# Supabase Storage Specifications

## Database Tables

### 1. Users
```sql
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT auth.uid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  preferences JSONB DEFAULT '{}'
);
```

### 2. Artifacts
```sql
CREATE TABLE artifacts (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  title TEXT,
  content JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_filed BOOLEAN DEFAULT FALSE,
  file_path TEXT,
  embedding vector(1536)
);
```

### 3. Tags
```sql
CREATE TABLE tags (
  tag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4. ArtifactTags (Junction table)
```sql
CREATE TABLE artifact_tags (
  artifact_id UUID REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(tag_id) ON DELETE CASCADE,
  is_auto_generated BOOLEAN DEFAULT FALSE,
  confidence_score FLOAT,
  PRIMARY KEY (artifact_id, tag_id)
);
```

### 5. Conversations
```sql
CREATE TABLE conversations (
  conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES artifacts(artifact_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 6. Messages
```sql
CREATE TABLE messages (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content JSONB,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 7. UserFeedback
```sql
CREATE TABLE user_feedback (
  feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  artifact_id UUID REFERENCES artifacts(artifact_id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(message_id) ON DELETE SET NULL,
  feedback_type TEXT CHECK (feedback_type IN ('like', 'dislike')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 8. CustomInstructions
```sql
CREATE TABLE custom_instructions (
  instruction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  instruction_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Row Level Security (RLS) Policies

Enable RLS on all tables:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_instructions ENABLE ROW LEVEL SECURITY;
```

Create policies to ensure users can only access their own data:

```sql
-- Users table policies
CREATE POLICY "Users can view their own data" 
ON users FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own data" 
ON users FOR UPDATE USING (auth.uid() = user_id);

-- Artifacts table policies
CREATE POLICY "Users can view their own artifacts" 
ON artifacts FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own artifacts" 
ON artifacts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own artifacts" 
ON artifacts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own artifacts" 
ON artifacts FOR DELETE USING (auth.uid() = user_id);

-- Similar policies for remaining tables
```

## Storage Buckets

```sql
-- Create buckets for file storage
INSERT INTO storage.buckets (id, name, public) VALUES ('user_uploads', 'User Uploads', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('user_avatars', 'User Avatars', true);

-- RLS for storage
CREATE POLICY "Users can access their own uploads"
ON storage.objects
FOR ALL
USING (auth.uid()::text = (storage.foldername(name))[1]);
```

## Functions and Triggers

### Auto-update timestamps
```sql
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON artifacts
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
```

### Vector Operations Setup
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create index for vector search
CREATE INDEX artifact_embedding_idx ON artifacts 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## Edge Functions

### 1. Generate Embedding
This function will be called when artifacts are created or updated:

```javascript
// supabase/functions/generate-embedding/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.1.0'

const openAiKey = Deno.env.get('OPENAI_API_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  const { artifactId, content } = await req.json()
  
  // Generate embedding
  const configuration = new Configuration({ apiKey: openAiKey })
  const openai = new OpenAIApi(configuration)
  const embedResponse = await openai.createEmbedding({
    model: 'text-embedding-ada-002',
    input: content,
  })
  const [{ embedding }] = embedResponse.data.data
  
  // Update artifact with embedding
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const { error } = await supabase
    .from('artifacts')
    .update({ embedding })
    .eq('artifact_id', artifactId)
  
  if (error) return new Response(JSON.stringify({ error }), { status: 400 })
  return new Response(JSON.stringify({ success: true }), { status: 200 })
})
```

### 2. Auto-Tag Content
This function will analyze content and suggest tags:

```javascript
// supabase/functions/auto-tag/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.1.0'

serve(async (req) => {
  const { artifactId, content, userId } = await req.json()
  
  // Configure OpenAI
  const configuration = new Configuration({ apiKey: Deno.env.get('OPENAI_API_KEY') })
  const openai = new OpenAIApi(configuration)
  
  // Get tag suggestions from AI
  const response = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'You are a tagging assistant. Suggest 3-5 relevant tags for the given content.'
      },
      { role: 'user', content }
    ],
  })
  
  const suggestedTags = response.data.choices[0].message.content.split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
  
  // Process tags in Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  )
  
  // Process each suggested tag
  for (const tagName of suggestedTags) {
    // Look for existing tag
    let { data: existingTag } = await supabase
      .from('tags')
      .select('tag_id')
      .eq('user_id', userId)
      .eq('name', tagName)
      .single()
    
    // Create tag if it doesn't exist
    if (!existingTag) {
      const { data: newTag, error: tagError } = await supabase
        .from('tags')
        .insert({ name: tagName, user_id: userId })
        .select('tag_id')
        .single()
      
      if (tagError) continue
      existingTag = newTag
    }
    
    // Link tag to artifact
    await supabase
      .from('artifact_tags')
      .insert({
        artifact_id: artifactId,
        tag_id: existingTag.tag_id,
        is_auto_generated: true,
        confidence_score: 0.8 // Default confidence
      })
      .onConflict(['artifact_id', 'tag_id'])
      .ignore()
  }
  
  return new Response(
    JSON.stringify({ success: true, tags: suggestedTags }),
    { status: 200 }
  )
})
```

## Data Migration and Backup Strategy

- Regular database backups using Supabase's scheduled backups
- Export data to JSON for manual backups when needed
- Database version tracking for schema migrations

## Performance Considerations

- Implement pagination for artifact listings (limit/offset)
- Cache frequently accessed data using Redis or similar
- Use connection pooling for handling multiple concurrent users
- Monitor query performance and add indexes as needed
- Use Supabase's read replicas for scaling read operations
