import { NextResponse } from 'next/server';
import { backendApiUrl } from '@/lib/backend';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(backendApiUrl('/api/interact'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}
