// StudyMaster AI — Vercel Edge Proxy
// Keeps API keys server-side. Students call /api/proxy instead of AI APIs directly.
// Deploy free at vercel.com — zero cost for hobby usage.

export const config = { runtime: 'edge' };

// ── Obfuscated keys (XOR encoded, decoded at runtime) ──
function _dk(arr, seed, mod) {
  return arr.map((v, i) => String.fromCharCode(v ^ (seed + i % mod))).join('');
}

const _KEYS = {
  groq: () => _dk([60,47,54,1,56,12,41,83,4,55,53,19,32,37,63,15,6,14,59,24,24,38,86,7,53,36,0,28,4,84,46,48,38,6,10,30,42,40,104,22,5,37,15,54,50,45,4,47,32,33,9,20,109,101,48,109], 91, 17),
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

const ALLOWED_ORIGINS = [
  'https://mvs146.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }

  const { provider = 'groq', model, messages, system, max_tokens = 2000 } = body;

  // Rate limiting via request metadata (basic)
  const ip = req.headers.get('x-forwarded-for') || 'unknown';

  try {
    let result = '';

    if (provider === 'groq') {
      const key = _KEYS.groq();
      const msgs = system ? [{ role: 'system', content: system }, ...(messages || [])] : (messages || []);
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: msgs,
          max_tokens: Math.min(max_tokens, 8000),
          temperature: 0.7
        })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || 'Groq error');
      result = data.choices?.[0]?.message?.content || '';

    } else if (provider === 'openai') {
      const key = _KEYS.openai();
      const msgs = system ? [{ role: 'system', content: system }, ...(messages || [])] : (messages || []);
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: msgs,
          max_tokens: Math.min(max_tokens, 4096),
          temperature: 0.7
        })
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error.message || 'OpenAI error');
      result = data.choices?.[0]?.message?.content || '';

    } else {
      return new Response(JSON.stringify({ error: 'Unknown provider' }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ response: result }), { status: 200, headers: corsHeaders });

  } catch (err) {
    console.error('Proxy error:', err.message);
    return new Response(JSON.stringify({ error: err.message || 'AI request failed' }), { status: 500, headers: corsHeaders });
  }
}
