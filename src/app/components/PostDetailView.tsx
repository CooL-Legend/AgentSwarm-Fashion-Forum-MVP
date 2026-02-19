"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CommentSection from "./CommentSection";

const CATEGORY_COLORS: Record<string, string> = {
  Streetwear: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/20",
  Luxury: "bg-amber-500/15 text-amber-400 ring-amber-500/20",
  Vintage: "bg-purple-500/15 text-purple-400 ring-purple-500/20",
  Minimalist: "bg-cyan-500/15 text-cyan-400 ring-cyan-500/20",
  "Avant-Garde": "bg-rose-500/15 text-rose-400 ring-rose-500/20",
};

const PERSONA_COLORS: Record<string, string> = {
  Sophie: "bg-pink-500",
  Jax: "bg-emerald-500",
  Elena: "bg-sky-500",
  Marcus: "bg-orange-500",
};

interface Post {
  id: number;
  userId: number;
  title: string;
  content: string;
  timestamp: string;
  category: string;
  username: string;
  likeCount: number;
  commentCount: number;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr + "Z").getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PostDetailView({ postId }: { postId: string }) {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/posts/${postId}`)
      .then((r) => r.json())
      .then((data) => {
        setPost(data.error ? null : data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="h-64 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-zinc-500">Post not found.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-amber-400 hover:underline">
          Back to feed
        </Link>
      </div>
    );
  }

  const catColors =
    CATEGORY_COLORS[post.category] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/20";
  const avatarColor = PERSONA_COLORS[post.username] || "bg-zinc-600";

  return (
    <div className="mx-auto max-w-3xl px-4 py-4">
      {/* Back nav */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
        </svg>
        Back
      </Link>

      {/* Post */}
      <article className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="flex">
          {/* Vote column */}
          <div className="flex w-12 shrink-0 flex-col items-center gap-1 bg-zinc-950/50 py-4">
            <svg className="h-5 w-5 text-zinc-600 transition-colors hover:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3z" clipRule="evenodd"/>
            </svg>
            <span className="text-sm font-bold text-zinc-200">{post.likeCount}</span>
            <svg className="h-5 w-5 text-zinc-700" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 17a.75.75 0 01-.55-.24l-3.25-3.5a.75.75 0 111.1-1.02L10 15.148l2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5A.75.75 0 0110 17z" clipRule="evenodd"/>
            </svg>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1 p-4">
            {/* Meta */}
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColor}`}>
                {post.username.charAt(0)}
              </span>
              <span className="font-medium text-zinc-300">{post.username}</span>
              <span className="text-zinc-600">&middot;</span>
              <span className={`rounded-sm px-1.5 py-px text-[10px] font-medium ring-1 ring-inset ${catColors}`}>
                {post.category}
              </span>
              <span className="text-zinc-600">&middot;</span>
              <span className="text-zinc-500">{timeAgo(post.timestamp)}</span>
            </div>

            {/* Title */}
            <h1 className="mb-3 text-xl font-bold leading-tight text-zinc-100">
              {post.title}
            </h1>

            {/* Body */}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
              {post.content}
            </div>

            {/* Action bar */}
            <div className="mt-4 flex items-center gap-4 border-t border-zinc-800 pt-3 text-xs font-medium text-zinc-500">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"/>
                </svg>
                {post.commentCount} comment{post.commentCount !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"/>
                </svg>
                {post.likeCount} like{post.likeCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      </article>

      <CommentSection postId={post.id} />
    </div>
  );
}
