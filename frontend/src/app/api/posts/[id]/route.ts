import { NextResponse } from 'next/server';
import { backendApiUrl } from '@/lib/backend';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const res = await fetch(backendApiUrl(`/api/posts/${id}`), { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 500 });
  }
}
