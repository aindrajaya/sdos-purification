# S-DOS: Semantic Design Optimization System

A portfolio demonstration of **autonomous multi-agent AI orchestration** for industrial engineering analysis. S-DOS analyzes engineering blueprints in real-time using a coordinated pipeline of specialized AI agents, delivering compliance assessments and design optimizations through a live, transparent interface.

![Next.js](https://img.shields.io/badge/Next.js-16.1.4-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-06B6D4?logo=tailwindcss)
![n8n](https://img.shields.io/badge/n8n-Workflow-FF6D5A)

## 🎯 Overview

S-DOS (Semantic Design Optimization System) is a **Glass Box AI Architecture** that demonstrates:

- **Multi-Agent Orchestration**: Coordinates 3 specialized AI agents (GPT-4o Vision Extractor, Perplexity Researcher, GPT-4o Design Optimizer)
- **Real-Time Transparency**: Server-Sent Events (SSE) stream live progress updates as each agent completes its analysis
- **Human-in-the-Loop Control**: Configurable autonomy slider from full automation to manual approval
- **Industrial Application**: Analyzes fluid dynamics blueprints for compliance with ISO/ASTM/ASME standards

**Use Case**: An engineer uploads a static mixer blueprint → S-DOS extracts specifications, researches compliance standards, calculates Reynolds numbers, and proposes design optimizations—all within ~20 seconds with complete traceability.

## ✨ Key Features

### 🤖 Three-Agent AI Pipeline
1. **Vision Extractor (GPT-4o)**: Analyzes blueprint images to extract technical parameters (dimensions, materials, Reynolds numbers)
2. **Compliance Researcher (Perplexity sonar-pro)**: Searches for current ISO/ASTM/ASME standards with citations
3. **Design Optimizer (GPT-4o)**: Compares specs against standards, calculates turbulent flow requirements, proposes optimizations

### 📊 Real-Time UI Updates
- **Live Agent Trace**: Expandable timeline showing each agent's status (pending → running → completed)
- **Progressive Data Display**: Extraction results → Research findings → Optimization proposals appear as they complete
- **Smooth Animations**: Custom CSS keyframes for shimmer loading, fade-in transitions, and completion highlights
- **Phase-Specific Rendering**: Each analysis phase displays relevant data (diameter/material → standards/citations → recommendations/cost impact)

### 🔒 Glass Box Architecture
- **Complete Traceability**: Every decision includes reasoning, data sources, and timestamps
- **Error Transparency**: Displays confidence levels, parsing failures, and data quality issues
- **Audit Trail**: Full glass_box_trace array documents agent execution order and results

### ⚡ Performance Optimizations
- **Fire-and-Forget API**: Initial request returns immediately; results stream via SSE
- **60-Second Timeout Handling**: Gracefully manages long-running AI operations
- **Concurrent Processing**: Independent agents run in parallel within n8n workflow

## 🏗️ Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────────┐
│   Next.js UI    │─────▶│  /api/sdos POST  │─────▶│  n8n Workflow      │
│  (React + SSE)  │      │  (Fire & Forget) │      │  (3-Agent Pipeline)│
└────────┬────────┘      └──────────────────┘      └─────────┬──────────┘
         │                                                    │
         │ SSE Stream                                         │
         │                                                    ▼
         │                                        ┌───────────────────────┐
         │◀───────────────────────────────────────│ Progress Notifications│
         │                                        │ POST /api/sdos/progress│
         │                                        └───────────────────────┘
         │                                                    │
         │                                                    ▼
         │                                        ┌───────────────────────┐
         │                                        │ Final ERP Confirmation│
         │◀───────────────────────────────────────│ POST /api/sdos/complete│
         │                                        └───────────────────────┘
         ▼
┌─────────────────────────────────────┐
│  Phase Data Display                 │
│  - Extraction (Dimensions/Material) │
│  - Research (Standards/Citations)   │
│  - Optimization (Recommendations)   │
└─────────────────────────────────────┘
```

### Data Flow

1. **User uploads blueprint** → Base64 encoded PNG/PDF
2. **POST /api/sdos** → Triggers n8n workflow, returns `{ status: "processing" }` immediately
3. **SSE /api/sdos/progress** → Client connects to Server-Sent Events stream
4. **n8n executes agents** → Each agent sends progress notifications with phase data
5. **UI updates in real-time** → `phase1Data`, `phase2Data`, `phase3Data` populate as results arrive
6. **POST /api/sdos/complete** → Final ERP confirmation webhook (mock integration)

## 🛠️ Technology Stack

### Frontend
- **Next.js 16.1.4** (React 19, App Router, Server Components)
- **TypeScript 5.x** (Type-safe development)
- **Tailwind CSS 3.x** (Utility-first styling with custom animations)
- **Server-Sent Events** (Real-time progress streaming)

### Backend & Orchestration
- **Next.js API Routes** (3 endpoints: `/api/sdos`, `/api/sdos/progress`, `/api/sdos/complete`)
- **n8n Workflow Automation** (Visual agent orchestration)
- **In-Memory Progress Store** (Session tracking; use Redis for production)

### AI Services
- **OpenAI GPT-4o** (Vision extraction, design optimization)
- **Perplexity sonar-pro** (Compliance research with real-time citations)

### Development Tools
- **ESLint** (Code quality)
- **PostCSS** (CSS processing)
- **Git** (Version control)

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm/yarn/pnpm
- **n8n instance** (local or cloud)
- **API Keys**:
  - OpenAI API key (`OPENAI_API_KEY`)
  - Perplexity API key (`PERPLEXITY_API_KEY`)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd sdos-ui

# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

### Environment Variables

Create a `.env.local` file in the root directory:

```bash
# n8n Webhook URL (where Next.js sends blueprint data)
SDOS_WEBHOOK=http://localhost:5678/webhook/s-dos-process

# Base URL for callbacks (n8n sends progress updates here)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Optional: Mark workflow as configured in UI
NEXT_PUBLIC_SDOS_READY=true
```

### n8n Workflow Setup

1. **Import workflow**: Open n8n → Import `docs/S-DOS_Portfolio_Agent_v3_WITH_PROGRESS.json`
2. **Configure credentials**:
   - Add OpenAI API key (Header Auth: `Authorization: Bearer sk-...`)
   - Add Perplexity API key (Header Auth: `Authorization: Bearer pplx-...`)
3. **Activate workflow**: Enable the "NextJS Webhook1" trigger
4. **Update callback URLs** (if not localhost):
   - Set `NEXT_PUBLIC_APP_URL` to your deployment domain
   - n8n will POST to `{NEXT_PUBLIC_APP_URL}/api/sdos/progress` and `/api/sdos/complete`

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Test the Workflow

1. **Upload a blueprint**: Use the file picker to select an engineering blueprint (PNG/PDF)
2. **Configure autonomy**: 
   - `Human Approval` → Workflow returns results for manual review
   - `Full Auto` → Workflow automatically executes ERP actions (mock)
3. **Submit analysis**: Click "Start Analysis"
4. **Watch live trace**: Observe agents executing in real-time
5. **View results**: Extraction → Research → Optimization sections populate progressively

## 📁 Project Structure

```
sdos-ui/
├── app/
│   ├── api/
│   │   └── sdos/
│   │       ├── route.ts              # POST: Trigger workflow (fire-and-forget)
│   │       ├── complete/
│   │       │   └── route.ts          # POST: ERP confirmation webhook
│   │       └── progress/
│   │           └── route.ts          # GET: SSE stream | POST: n8n notifications
│   ├── lib/
│   │   ├── progress-store.ts         # In-memory session tracking
│   │   └── sdos.ts                   # TypeScript interfaces
│   ├── globals.css                   # Custom animations (@keyframes)
│   ├── layout.tsx                    # Root layout with fonts
│   └── page.tsx                      # Main UI component (1300+ lines)
├── docs/
│   └── S-DOS_Portfolio_Agent_v3_WITH_PROGRESS.json  # n8n workflow
├── public/                           # Static assets
├── .env.local                        # Environment variables (create this)
├── next.config.ts                    # Next.js configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── tsconfig.json                     # TypeScript configuration
└── package.json                      # Dependencies
```

## 🔌 API Endpoints

### `POST /api/sdos`
**Trigger workflow analysis**

**Request Body**:
```json
{
  "file_data": "iVBORw0KGgo...",  // Base64 encoded image
  "autonomy_level": "human_approval",  // or "full_auto"
  "filename": "blueprint.pdf",
  "session_id": "sdos-1234567890-abc123"
}
```

**Response** (immediate):
```json
{
  "message": "Analysis started. Results will stream via progress updates.",
  "sessionId": "sdos-1234567890-abc123",
  "status": "processing"
}
```

---

### `GET /api/sdos/progress?sessionId=xxx`
**Server-Sent Events stream for real-time updates**

**Response Stream**:
```
data: {"step":1,"status":"running","detail":"Extracting..."}

data: {"step":1,"status":"completed","data":{"extracted_specs":{...}}}

data: {"step":2,"status":"running","detail":"Searching standards..."}

data: {"step":2,"status":"completed","data":{"compliance_research":{...}}}

data: {"step":3,"status":"completed","data":{"optimization_proposal":{...}}}
```

---

### `POST /api/sdos/progress`
**n8n progress notification webhook**

**Request Body** (sent by n8n):
```json
{
  "sessionId": "sdos-1234567890-abc123",
  "step": 1,
  "status": "completed",
  "detail": "Extracted Static Mixer specifications",
  "data": {
    "extracted_specs": {
      "extracted_data": {
        "component_type": "Static Mixer",
        "dimensions": {"diameter_inch": 4, "angle_degrees": 45},
        "material": "Stainless Steel 316L",
        "Reynolds_number": 3200
      }
    }
  }
}
```

---

### `POST /api/sdos/complete`
**ERP execution confirmation webhook**

**Request Body** (sent by n8n Mock ERP node):
```json
{
  "action": "CREATE_WORK_ORDER",
  "session_id": "sdos-1234567890-abc123",
  "report_id": "SDOS-1234567890",
  "final_recommendation": "REQUIRES_ENGINEERING_REVIEW",
  "success": true
}
```

## 🎨 UI Components

### Main Features

- **IntakeFormCard**: Blueprint upload, autonomy slider, project metadata
- **AutonomyCard**: Visual explanation of human-in-the-loop vs full automation
- **MetricCards**: Live Reynolds number, flow regime, and optimization status
- **AgentTraceCard**: Expandable timeline with agent execution trace
- **ReportCard**: Three PhaseSection components for progressive data display
- **PhaseLoadingSkeleton**: Shimmer animation for loading states

### Custom Animations (globals.css)

```css
@keyframes shimmer { /* 2s infinite gradient slide */ }
@keyframes fadeInSlide { /* 0.4s smooth entrance */ }
@keyframes highlightGlow { /* 2s completion pulse */ }
```

## 🧪 Development Workflow

### Running Tests

```bash
# Lint code
npm run lint

# Type check
npx tsc --noEmit

# Build for production
npm run build
```

### Debugging Tips

1. **Check n8n execution logs**: n8n UI → Executions → View details
2. **Monitor SSE stream**: Browser DevTools → Network → `progress?sessionId=...` → EventStream
3. **Inspect progress store**: Add console.log in `/api/sdos/progress/route.ts`
4. **Verify phase data**: Check `phase1Data`, `phase2Data`, `phase3Data` in React DevTools

### Common Issues

**Issue**: Progress bar stuck at 0%  
**Solution**: Verify n8n workflow is sending POST requests to `/api/sdos/progress` with correct `sessionId`

**Issue**: Report shows "Ready to analyze" after completion  
**Solution**: Check that `progress.data` contains `extracted_specs`, `compliance_research`, or `optimization_proposal`

**Issue**: 502 Bad Gateway errors  
**Solution**: Ensure `SDOS_WEBHOOK` points to active n8n webhook URL

## 🚢 Deployment

### Environment Variables for Production

```bash
# Production n8n webhook (if using cloud n8n)
SDOS_WEBHOOK=https://your-n8n-instance.com/webhook/s-dos-process

# Your production domain
NEXT_PUBLIC_APP_URL=https://sdos-demo.yourdomain.com

# Mark as ready
NEXT_PUBLIC_SDOS_READY=true
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel dashboard
# Settings → Environment Variables
```

### Update n8n Workflow URLs

In `docs/S-DOS_Portfolio_Agent_v3_WITH_PROGRESS.json`, update:
- **Mock ERP Execution1** node: `url` → `https://sdos-demo.yourdomain.com/api/sdos/complete`
- All **Notify Agent** nodes use `progress_callback_url` from input (automatically correct if `NEXT_PUBLIC_APP_URL` is set)

## 📊 Performance Metrics

- **Initial Response**: < 100ms (fire-and-forget)
- **SSE Connection**: ~18-25s (3 AI agents processing)
- **Vision Extraction**: ~5-8s (GPT-4o image analysis)
- **Compliance Research**: ~3-6s (Perplexity web search)
- **Design Optimization**: ~5-8s (GPT-4o reasoning)
- **Total End-to-End**: ~15-25s (depending on AI API latency)

## 🤝 Contributing

This is a portfolio demonstration project. For production use:

1. **Replace in-memory store** with Redis/database
2. **Add authentication** (NextAuth.js)
3. **Implement rate limiting** (Upstash Redis)
4. **Add file validation** (size limits, MIME type checks)
5. **Enhance error handling** (retry logic, fallback responses)
6. **Add unit tests** (Jest, React Testing Library)
7. **Implement logging** (Winston, DataDog)

## 📄 License

MIT License - See LICENSE file for details

## 🙏 Acknowledgments

- **OpenAI** for GPT-4o Vision and reasoning capabilities
- **Perplexity AI** for real-time web research with citations
- **n8n** for visual workflow automation
- **Vercel** for Next.js framework and hosting platform

---

**Built with ❤️ to demonstrate autonomous AI agent orchestration for industrial engineering applications.**
