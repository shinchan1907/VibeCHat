<div align="center">

# 💬 WibeChat

**Open-Source Business Communication & WhatsApp API Platform**  
*Built 100% on Cloudflare Free Tier (Workers • D1 SQLite • R2 • Static Assets)*

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1_SQLite-F38020?style=flat-square&logo=sqlite&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2_Storage-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)
[![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

</div>

---

## 🌟 Overview

**WibeChat** is a fast, single-business messaging platform engineered to run entirely on **Cloudflare's generous Free Tier** with zero server maintenance costs. Designed with an ultra-clean Light SaaS aesthetic (inspired by modern CRM interfaces), WibeChat empowers businesses to manage 2-way customer conversations, dispatch bulk campaigns, create interactive Meta WhatsApp Flows with a drag-and-drop form designer, and automate customer journeys using visual If/Else decision trees.

---

## ✨ Features

### 1. 💬 Live Team Inbox & 2-Way Messaging
- **Modern Split-Pane Workspace**: Search conversations, filter by status (*All*, *Open*, *Pending*, *Resolved*), and monitor unread counters.
- **24-Hour WhatsApp Service Window Tracker**: Real-time countdown timer showing remaining customer care window. Automatically prevents compliance violations by prompting users to send approved Meta templates when the window closes.
- **Rich Media**: Send and receive images, documents, audio voice notes, and videos stored on Cloudflare R2 with $0 egress fees.
- **Delivery Receipts**: Single tick (sent), double gray tick (delivered), and double blue tick (read) receipts synchronized via webhooks.

### 2. ⚡ Visual Drag-and-Drop Meta Flow Builder
- **Zero Raw JSON Required**: Visual 3-column builder featuring an element palette (Text Headings, Inputs, Text Areas, Dropdowns with options manager, and Submit Buttons).
- **Interactive Smartphone Simulator**: Renders the exact form layout live inside an iPhone mockup as you build it.
- **Meta Flow v3.1 Compliant**: Automatically compiles forms into standard Meta Flow JSON specifications.
- **Built-in Data Exchange Endpoint**: Includes a ready-to-use `/api/flows/endpoint` to handle `INIT` and `data_exchange` webhook requests from WhatsApp mobile clients.

### 3. 🤖 Visual Chatbot Builder with If/Else Branching
- **Flowchart Automation Canvas**:
  - ⚡ **Trigger Nodes**: Match incoming customer keywords (`hi`, `pricing`, `demo`, `support`, `menu`).
  - 🔀 **If/Else Condition Nodes**: Evaluate message content with distinct **Branch TRUE** (Green) and **Branch FALSE** (Orange) paths.
  - 💬 **Message Nodes**: Custom responses or approved WhatsApp templates.
  - 🔘 **Interactive Button Nodes**: Quick reply chips (*Get Quote*, *Talk to Sales*, *Human Agent*).
- **Interactive Live Simulator**: Test and debug your bot directly on the canvas, tracing the decision path step-by-step.
- **Automated Webhook Execution**: Automatically executes and replies to incoming customer inquiries on your WhatsApp Business number.

### 4. 📢 Broadcast Campaigns & Audience Segmentation
- **Campaign Dashboard**: Real-time KPI metrics for Sent, Delivered, Read, and Failed messages.
- **Targeting Flexibility**: Send to all opted-in contacts, filter by custom audience tags (e.g., `VIP`, `Lead`), or paste phone numbers.
- **Dynamic Variable Interpolation**: Map template parameters (`{{1}}`, `{{2}}`, `{{name}}`) dynamically per recipient.

### 5. 📄 WhatsApp Template Manager
- **1-Click Meta Sync**: Pull approved templates and statuses directly from Meta Graph API.
- **Template Creator**: Build Marketing, Utility, or Authentication templates with headers, body variables, footers, and interactive CTA buttons.
- **Live Phone Mockup**: Real-time visual preview before submitting to Meta for approval.

### 6. 👥 Audience & Contacts Book
- Contact directory with tags, custom attributes, opt-in/opt-out status, and search.
- Bulk CSV import for fast contact onboarding.

### 7. 🔐 Single-Business Admin Auth
- Enforced single-business administration locked to **`contact@bytenex.io`**.
- Passwordless **Email OTP login** with 30-day cryptographically secured sessions stored in Cloudflare D1.

---

## 🗺️ Multi-Channel Roadmap

WibeChat is architected to expand into a unified multi-channel communication suite:

- [ ] **Instagram Direct Messaging (DM)**: Live 2-way Instagram messaging integration using Meta Graph API.
- [ ] **Instagram Post & Reel Scheduler**: Calendar-based post scheduling and automated publishing directly from Cloudflare Workers.
- [ ] **AI Smart Copilot**: Automated intent classification and response suggestions powered by free **Cloudflare Workers AI** (Llama 3).
- [ ] **Omnichannel Contacts**: Unified customer profiles tracking interactions across WhatsApp, Instagram, and Web.

---

## 🏛️ Cloudflare Free Tier Architecture

WibeChat is engineered to fit 100% within Cloudflare's free quotas:

| Component | Cloudflare Service | Free Tier Allowance | Platform Role |
| :--- | :--- | :--- | :--- |
| **Backend API** | [Cloudflare Workers](https://workers.cloudflare.com/) (Hono) | 100,000 requests/day | Edge API, Webhook engine, Meta API client |
| **Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) | 5M queries/day, 5GB storage | Relational storage for chats, messages, bots, contacts |
| **Media Attachments** | [Cloudflare R2](https://developers.cloudflare.com/r2/) | 10GB storage, $0 egress | Voice notes, media attachments, customer uploads |
| **Frontend Dashboard** | [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/) | Unlimited bandwidth | Light SaaS React SPA served globally from edge |

---

## 🛠️ Quick Start (Local Development)

### Prerequisites
- Node.js v20+ or v22+
- npm v10+

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/WibeChat.git
cd WibeChat
npm install
```

### 2. Initialize Local Cloudflare D1 Database
```bash
npm run d1:init
```

### 3. Build & Run Local Wrangler Server
```bash
# Build frontend
npm run build

# Start local Cloudflare Worker with D1 & Assets
npm run dev:worker
```

Open **`http://localhost:8787`** in your browser.  
Log in with **`contact@bytenex.io`** (in development mode, the 6-digit test OTP will appear in the banner).

---

## ☁️ Production Deployment on Cloudflare (100% Free)

### Step 1: Authenticate with Cloudflare
```bash
npx wrangler login
```

### Step 2: Create Remote Cloudflare D1 Database
```bash
npx wrangler d1 create waba-db
```
*Copy the `database_id` from the output and update it in `wrangler.json`.*

### Step 3: Run Database Migrations on Remote D1
```bash
npm run d1:init:prod
```

### Step 4: Create Cloudflare R2 Media Bucket
```bash
npx wrangler r2 bucket create waba-media
```

### Step 5: Build & Deploy
```bash
npm run deploy
```
Wrangler will publish your platform and provide your live URL:  
`https://wibechat.<your-subdomain>.workers.dev`

---

## 🔗 Meta WhatsApp Cloud API Integration

1. In the [Meta for Developers Portal](https://developers.facebook.com/):
   - Navigate to **WhatsApp > API Setup**:
     - Copy your **Phone Number ID** and **WhatsApp Business Account ID (WABA ID)**.
     - Generate a **Permanent System User Access Token** with permissions:
       - `whatsapp_business_messaging`
       - `whatsapp_business_management`
2. Open your deployed WibeChat dashboard, go to **WABA Settings**, and paste the credentials.
3. Click **Test Connection** to confirm connectivity.
4. In Meta App Dashboard, go to **WhatsApp > Configuration > Callback URL**:
   - **Callback URL**: `https://<your-worker>.workers.dev/api/webhook`
   - **Verify Token**: `bytenex_waba_verify_2026` (or the token specified in Settings)
   - Click **Verify and Save**.
   - Under **Webhook fields**, click **Manage** and subscribe to **`messages`**.
5. *(Optional for Meta Flows)* Under **WhatsApp > Flows**, set the Data Exchange Endpoint to:  
   `https://<your-worker>.workers.dev/api/flows/endpoint`

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
