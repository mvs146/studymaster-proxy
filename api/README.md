# StudyMaster AI — Vercel Proxy Setup

## Deploy in 3 minutes (FREE forever)

### Step 1: Create Vercel account
Go to vercel.com → Sign up free with GitHub

### Step 2: Deploy this folder
Option A — Vercel CLI:
```bash
npm i -g vercel
cd vercel-proxy
vercel deploy --prod
```

Option B — Drag & Drop:
1. Go to vercel.com/new
2. Drag this entire folder into the browser
3. Click Deploy

### Step 3: Update your app URL
After deploy, Vercel gives you a URL like:
`https://studymaster-proxy-yourname.vercel.app`

In your index.html, find this line:
```js
const PROXY_URL = '';
```
Change it to:
```js
const PROXY_URL = 'https://studymaster-proxy-yourname.vercel.app/api/proxy';
```

### What this does
- Your API keys stay on Vercel servers — students CANNOT see them
- Students call your proxy → proxy calls Groq/OpenAI → returns result
- Free tier: 100,000 requests/month (enough for thousands of students)
- Zero cold starts (Edge runtime = instant response)

### Security
- Only your GitHub Pages domain can use this proxy
- Keys are XOR-encoded even in the server code
- No logs of student queries stored

