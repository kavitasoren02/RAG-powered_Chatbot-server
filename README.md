# RAG Chatbot Backend

A Node.js/Express backend for a RAG-powered news chatbot using PostgreSQL, Redis, and Google Gemini.

## Features

- **RAG Pipeline**: News ingestion, embedding generation, and vector similarity search
- **Real-time Chat**: WebSocket support for streaming responses
- **Session Management**: Redis-based session storage with TTL
- **Vector Database**: Qdrant integration for semantic search
- **News Ingestion**: Automated RSS feed processing and article embedding
- **Caching**: Multi-layer caching for performance optimization
- **Streaming Responses**: Real-time message streaming with chunked delivery
- **Enhanced WebSocket**: Typing indicators, user presence, and message receipts

## Tech Stack

- **Runtime**: Node.js with ES modules
- **Framework**: Express.js
- **Database**: PostgreSQL (optional persistent storage)
- **Cache**: Redis (session management)
- **Vector DB**: Qdrant
- **AI Services**: Google Gemini API, Jina Embeddings
- **Real-time**: Socket.IO

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Copy environment variables:
\`\`\`bash
cp .env.example .env
\`\`\`

3. Configure your `.env` file with:
   - Database URLs (PostgreSQL, Redis, Qdrant)
   - API keys (Gemini, Jina)
   - RSS feed URLs

4. Start the server:
\`\`\`bash
npm run dev
\`\`\`

## API Endpoints

### Chat
- `POST /api/chat/message` - Send a message and get AI response (supports streaming)
- `GET /api/chat/history/:sessionId` - Get chat history for session
- `POST /api/chat/stream` - Server-sent events for streaming responses

### Session
- `POST /api/session/create` - Create new chat session
- `DELETE /api/session/:sessionId` - Clear session history

### WebSocket Events
- `join-session` - Join a chat session room
- `user-message` - Real-time user message broadcasting
- `bot-message` - AI response broadcasting
- `bot-typing` - Bot typing indicators
- `message-chunk` - Streaming response chunks
- `message-error` - Error handling
- `user-typing` - User typing indicators
- `message-read` - Message read receipts
- `session-activity` - User activity tracking

## Architecture

### RAG Pipeline
1. **Ingestion**: RSS feeds → Article extraction → Text chunking
2. **Embedding**: Jina Embeddings API → Vector generation
3. **Storage**: Qdrant vector database → Semantic indexing
4. **Retrieval**: Query embedding → Similarity search → Top-k passages
5. **Generation**: Context + Query → Gemini API → Final response

### Streaming Service
- Real-time response generation with Google Gemini
- Chunked message delivery via WebSocket
- Error handling and recovery
- Typing indicators during processing

### Caching Strategy
- **Session Cache**: Redis with 24h TTL for chat history
- **Embedding Cache**: Vector DB native caching
- **Response Cache**: Optional LRU cache for frequent queries

## Performance Optimizations

- Connection pooling for PostgreSQL
- Redis clustering support
- Batch embedding processing
- Streaming responses via WebSocket
- Lazy loading of vector indices
- Enhanced WebSocket event handling
- Real-time message chunking for better UX
