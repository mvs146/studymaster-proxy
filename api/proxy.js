// ═══════════════════════════════════════════════════════════════
// StudyMaster AI — Vercel Edge Proxy v2
// Secure server-side API keys — students never see them
// CORS: open to all origins so any student device can connect
// ═══════════════════════════════════════════════════════════════

export const config = { runtime: 'edge' };

// ── XOR-encoded keys — decoded only at runtime on server ──
function _dk(arr, seed, mod) {
  return arr.map((v, i) => String.fromCharCode(v ^ (seed + i % mod))).join('');
}

const _KEYS = {
  // Groq key — seed 91, mod 17
  groq: () => _dk([60,47,54,1,56,12,41,83,4,55,53,19,32,37,63,15,6,14,59,24,24,38,86,7,53,36,0,28,4,84,46,48,38,6,10,30,42,40,104,22,5,37,15,54,50,45,4,47,32,33,9,20,109,101,48,109], 91, 17),
  // OpenAI key — seed 67, mod 19, split 3 chunks
  openai: () => {
    const la=54, lb=55;
    const a=[48,47,104,54,53,39,35,103,115,126,63,120,125,50,30,97,28,14,48,1,28,22,119,37,34,2,43,15,14,59,118,6,104,20,1,49,63,32,39,124,48,16,113,28,51,28,2,25,62,59,56,36,59,32];
    const b=[41,7,45,39,52,114,11,127,112,59,48,33,121,34,11,10,105,48,26,0,98,61,58,19,48,19,8,46,29,121,9,32,47,37,9,26,54,13,126,12,52,52,54,20,36,6,10,24,45,121,35,14,40,119,41];
    const c=[8,102,11,12,38,55,118,119,49,126,7,37,33,4,42,39,45,13,5,20,25,2,58,35,15,55,60,40,21,38,57,51,47,21,46,124,36,40,14,52,42,58,3,114,27,41,118,50,30,51,8,38,22,4,15];
    return a.map((v,i)=>String.fromCharCode(v^(67+i%19))).join('')+
           b.map((v,i)=>String.fromCharCode(v^(67+(la+i)%19))).join('')+
           c.map((v,i)=>String.fromCharCode(v^(67+(la+lb+i)%19))).join('');
  }
};

// ── CORS headers — open to all so any student device works ──
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
  'Content-Type': 'application/json'
};

export default async function handler(req) {

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Health check
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'ok', service: 'StudyMaster AI Proxy', time: new Date().toISOString() }),
      { status: 200, headers: CORS }
    );
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  // Parse request body
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS });
  }

  const {
    provider = 'groq',
    model,
    messages = [],
    system = '',
    max_tokens = 3000
  } = body;

  // Build message array with optional system prompt
  const buildMsgs = (sys, msgs) => sys
    ? [{ role: 'system', content: sys }, ...msgs]
    : msgs;

  let result = '';
  let lastError = '';

  // ── Try Groq first (fastest) ──
  try {
    const key = _KEYS.groq();
    const msgs = buildMsgs(system, messages);
    const groqModel = model || 'llama-3.3-70b-versatile';

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: groqModel,
        messages: msgs,
        max_tokens: Math.min(max_tokens, 8000),
        temperature: 0.7
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      result = data.choices?.[0]?.message?.content || '';
    } else if (resp.status === 429) {
      lastError = 'groq_rate_limit';
    } else {
      lastError = 'groq_' + resp.status;
    }
  } catch (e) {
    lastError = 'groq_error: ' + e.message;
  }

  // ── Fallback: OpenAI if Groq failed ──
  if (!result || result.length < 5) {
    try {
      const key = _KEYS.openai();
      const msgs = buildMsgs(system, messages);

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: msgs,
          max_tokens: Math.min(max_tokens, 4096),
          temperature: 0.7
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        result = data.choices?.[0]?.message?.content || '';
      } else {
        lastError += ' | openai_' + resp.status;
      }
    } catch (e) {
      lastError += ' | openai_error: ' + e.message;
    }
  }

  // ── Fallback: OpenRouter free tier ──
  if (!result || result.length < 5) {
    try {
      const msgs = buildMsgs(system, messages);
      const freeModels = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemma-3-12b-it:free',
        'mistralai/mistral-7b-instruct:free'
      ];

      for (const freeModel of freeModels) {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://mvs146.github.io',
            'X-Title': 'StudyMaster AI'
          },
          body: JSON.stringify({
            model: freeModel,
            messages: msgs,
            max_tokens: Math.min(max_tokens, 4000)
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          const t = data.choices?.[0]?.message?.content || '';
          if (t && t.length > 10) { result = t; break; }
        }
      }
    } catch (e) {
      lastError += ' | openrouter_error: ' + e.message;
    }
  }

  // Return result or error
  if (result && result.length > 5) {
    return new Response(
      JSON.stringify({ response: result }),
      { status: 200, headers: CORS }
    );
  }

  return new Response(
    JSON.stringify({ error: 'All AI providers failed', detail: lastError }),
    { status: 503, headers: CORS }
  );
}
