# tuon.io - Your AI-Powered Content Creation Platform

An intelligent content creation and management platform that combines the power of multiple AI models to help you craft, enhance, and organize your content in one seamless workspace.

## Key Features

- **Advanced Intent Recognition** - The system intelligently determines whether to respond in chat or edit your document based on your query intent
- **Multi-Model AI Support** - Choose between OpenAI (GPT-4o, GPT-o3-mini) and Google (Gemini 2.0, Gemini 2.0 Flash) models for different tasks
- **Rich Text Document Editor** - Create structured documents with headings, lists, tables, code blocks using BlockNote
- **Image Support** - Upload and embed images directly in your documents with automatic storage
- **Web Search Integration** - Research topics without leaving the app using ExaSearch for up-to-date information
- **Folder-Based Organization** - Organize your documents in a hierarchical folder structure
- **Document History** - Track changes with version history through Supabase backend
- **Three-Pane Interface** - Optimized workspace with file explorer, content editor, and chat/search capabilities
- **Secure Email Authentication** - One-time password authentication through Supabase Auth
- **Real-Time Syncing** - All content automatically saved and accessible across devices
- **Creator Agent** - Specialized service that formats AI responses for appropriate destination (chat or editor)
- **Auto-Generated Titles** - Documents are automatically titled based on content

## Core Services

- **Intent Analysis (IntentAgentService)**: Determines how AI should respond to user queries using Gemini models
- **Creator Agent (CreatorAgentService)**: Formats AI responses for either conversation or editor
- **Artifact Management (ArtifactService)**: Handles document storage and retrieval
- **Image Service (ImageService)**: Manages image uploads to S3-compatible storage
- **Folder Service (FolderService)**: Manages hierarchical folder organization
- **Search Service (SearchService)**: Provides document search capabilities
- **Conversation Service (ConversationService)**: Manages chat history and conversations

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **UI Editor**: BlockNote rich text editor
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with Email OTP
- **AI Integration**: OpenAI API & Google Generative AI API
- **Search**: ExaSearch API for web search
- **Storage**: S3-compatible storage for media

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/tuon-io-v1.git
   cd tuon-io-v1
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.local.example` to `.env.local`
   - Add your API keys and credentials:
     - OpenAI API key for GPT models
     - Google API key for Gemini models
     - Supabase credentials
     - ExaSearch API key (for web search)
     - S3-compatible storage credentials

### Supabase Setup

1. Create a new project on [Supabase](https://supabase.com)
2. Go to Project Settings > API to get your project URL and anon key
3. Add these credentials to your `.env.local` file
4. Set up authentication:
   - Go to Authentication > Providers
   - Enable Email OTP (One-Time Password) provider
   - Configure your email service provider (SMTP) for sending emails
5. Set up storage buckets for image uploads

### Start Development Server

```
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Application Structure

- `/app` - Next.js app directory
  - `/components` - React components (Editor, Chat, FileExplorer, etc.)
  - `/context` - React context providers (AI, Theme, Supabase)
  - `/lib` - Core utilities and services
    - `/services` - Core services (Intent, Creator, Artifact, etc.)
  - `/api` - API routes for web search and other functionality
  - `/editor` - Main editor page
  - `/auth` - Authentication related routes
  - `/login` - Login page

## User Interface

Tuon.io features a three-pane layout designed for efficient content creation:

1. **Left Pane**: File explorer for navigating and organizing documents
2. **Center Pane**: Rich text editor for content creation
3. **Right Pane**: Chat interface and web search capabilities