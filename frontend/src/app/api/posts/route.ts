import { NextResponse } from 'next/server';
import { backendApiUrl, backendApiUrlWithQuery } from '@/lib/backend';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const res = await fetch(backendApiUrlWithQuery('/api/posts', searchParams), { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(backendApiUrl('/api/posts'), {
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
