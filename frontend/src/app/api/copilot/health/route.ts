import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, apiKey, provider } = body;

    const isOllama = provider === 'ollama';
    const targetUrl = isOllama
      ? `${(endpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '')}/api/tags`
      : `${(endpoint || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '')}/models`;

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(targetUrl, { headers });
    if (!res.ok) {
      return NextResponse.json({ error: res.statusText }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao consultar modelos' }, { status: 502 });
  }
}
