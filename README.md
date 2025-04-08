# tuon.io - Your IDE for everything

AI-powered content creation and management platform that stores your content in one place and empowers you to craft, enhance, and organize your work with precision.

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
   - Add your API keys and credentials

### Supabase Setup

1. Create a new project on [Supabase](https://supabase.com)
2. Go to Project Settings > API to get your project URL and anon key
3. Add these credentials to your `.env.local` file
4. Set up authentication:
   - Go to Authentication > Providers
   - Enable Email OTP (One-Time Password) provider
   - Configure your email service provider (SMTP) for sending emails

### Start Development Server

```
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `/app` - Next.js app directory
  - `/components` - React components
  - `/context` - React context providers
  - `/auth` - Authentication related routes
  - `/editor` - Editor page
  - `/login` - Authentication page
  - `/lib` - Utilities and API clients

## Tech Stack

- Next.js (App Router)
- React
- Supabase (Auth & Database)
- BlockNote (Editor)
- OpenAI & Gemini (AI Models)