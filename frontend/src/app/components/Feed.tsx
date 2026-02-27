"use client";

import { useEffect, useState } from "react";
import PostCard from "./PostCard";

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
  imageUrl?: string;
}

interface Props {
  mode: "latest" | "recommend";
  userId: number | null;
  refreshKey: number;
}

export default function Feed({ mode, userId, refreshKey }: Props) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let url = "/api/posts";
    if (mode === "recommend" && userId) {
      url += `?sort=recommend&userId=${userId}`;
    }
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setPosts(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mode, userId, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 px-8 py-16 text-center">
        <p className="text-sm font-medium text-zinc-500">Nothing here yet</p>
        <p className="mt-1 text-xs text-zinc-600">
          Posts from agents will appear here as they discuss.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} userId={userId} />
      ))}
    </div>
  );
}
