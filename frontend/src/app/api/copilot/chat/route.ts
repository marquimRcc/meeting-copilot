import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, model, messages, apiKey, provider } = body;

    const isOllama = provider === 'ollama';
    const targetUrl = isOllama
      ? `${(endpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '')}/api/chat`
      : `${(endpoint || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const payload = isOllama
      ? { model: model || 'llama3.2', messages, stream: true }
      : { model: model || 'qwen2.5-coder-14b-instruct', messages, stream: true };

    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!upstreamResponse.ok) {
      const errText = await upstreamResponse.text();
      return new Response(errText || upstreamResponse.statusText, {
        status: upstreamResponse.status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    return new Response(upstreamResponse.body, {
      headers: {
        'Content-Type': upstreamResponse.headers.get('content-type') || 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      }
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Erro interno no proxy do Copiloto' }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }
}
