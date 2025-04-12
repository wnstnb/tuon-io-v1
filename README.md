# tuon.io - Your IDE for everything

AI-powered content creation and management platform that stores your content in one place and empowers you to craft, enhance, and organize your work with precision.

## Features

- **AI-Powered Content Creation** - Seamlessly create and edit content with AI assistance that adapts to your needs
- **Intelligent Intent Analysis** - System automatically determines whether to respond in chat or edit your document based on your intent
- **Multi-Model AI Integration** - Choose between OpenAI (GPT-4o, GPT-o3-mini) and Google (Gemini 2.0, 2.5) models for different tasks
- **Rich Text Document Editor** - Create structured documents with headings, lists, tables, and code blocks
- **Image Support** - Upload and embed images directly in your documents with automatic storage handling
- **Web Search Integration** - Research topics without leaving the app using ExaSearch for up-to-date information
- **Semantic Content Search** - Find exactly what you need across all your documents with vector-based search
- **File Management System** - Organize your documents with automatic tagging and filing
- **Three-Pane Interface** - Optimized workspace with productivity tools, content editor, and research capabilities
- **Real-Time Syncing** - All content automatically saved and accessible across devices with Supabase backend
- **Document Versioning** - Track changes and maintain version history of your content
- **Secure Authentication** - Email-based one-time password authentication through Supabase

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
     - ExaSearch API key (for semantic search)
     - S3-compatible storage credentials

### Supabase Setup

1. Create a new project on [Supabase](https://supabase.com)
2. Go to Project Settings > API to get your project URL and anon key
3. Add these credentials to your `.env.local` file
4. Set up authentication:
   - Go to Authentication > Providers
   - Enable Email OTP (One-Time Password) provider
   - Configure your email service provider (SMTP) for sending emails
5. Set up storage buckets for image uploads:
   - Create buckets for 'user_uploads' and 'user_avatars'

### Start Development Server

```
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Application Overview

Tuon.io features a three-pane layout designed for efficient content creation:

1. **Left Pane (Productivity)**: Access to conversations and file explorer
2. **Center Pane (Artifact Editor)**: Rich text editor for content creation
3. **Right Pane (Web Search)**: Integration for research capabilities

### Key Features

- **Smart AI Content Creation**: AI analyzes your intent to determine whether to respond in chat or edit the document
- **Multi-model Support**: Switch between OpenAI (GPT-4o, GPT-o3-mini) and Google (Gemini 2.0, 2.5) models
- **Content Management**: Organize artifacts with automatic tagging and filing
- **Rich Text Editing**: Full-featured document editor with image support
- **Vector Search**: Semantic search across your content

## Project Structure

- `/app` - Next.js app directory
  - `/components` - React components (Editor, Chat, UI elements)
  - `/context` - React context providers (AI, Theme, Supabase)
  - `/auth` - Authentication related routes
  - `/editor` - Editor page
  - `/login` - Authentication page
  - `/lib` - Utilities and API clients
    - `/services` - Core services (Intent, Creator, Artifact, etc.)
    - `/utils` - Helper utilities

## Tech Stack

- **Frontend**: Next.js (App Router), React 19, TypeScript
- **Database**: Supabase (PostgreSQL with pgvector)
- **Authentication**: Supabase Auth
- **Editor**: BlockNote
- **AI Integration**: OpenAI & Google Generative AI APIs
- **Search**: ExaSearch & vector embeddings
- **Storage**: S3-compatible storage for media

## Core Services

- **Intent Analysis**: Determines how AI should respond to user queries
- **Creator Agent**: Formats AI responses for either conversation or editor
- **Artifact Management**: Handles content storage and organization
- **Image Service**: Manages image uploads and retrieval

## Database Schema

The application uses a comprehensive schema including:

- Users
- Artifacts (content items)
- Tags and artifact tagging
- Conversations and messages
- User feedback
- Custom instructions

Row-level security policies ensure that users can only access their own data.