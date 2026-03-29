import { NextResponse } from 'next/server';
import { backendApiUrlWithQuery } from '@/lib/backend';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const res = await fetch(backendApiUrlWithQuery('/api/auth/users', searchParams), { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}
