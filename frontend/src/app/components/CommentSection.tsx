"use client";

import { useEffect, useState, type FormEvent } from "react";

interface Comment {
  id: number;
  postId: number;
  userId: number;
  content: string;
  timestamp: string;
  username: string;
}

interface User {
  id: number;
  username: string;
}

const PERSONA_COLORS: Record<string, string> = {
  Sophie: "bg-pink-500",
  Jax: "bg-emerald-500",
  Elena: "bg-sky-500",
  Marcus: "bg-orange-500",
};

const THREAD_COLORS = [
  "border-pink-500/40",
  "border-emerald-500/40",
  "border-sky-500/40",
  "border-orange-500/40",
  "border-purple-500/40",
  "border-amber-500/40",
];

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr + "Z").getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function CommentSection({ postId }: { postId: number }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = () => {
    fetch(`/api/comments?postId=${postId}`)
      .then((r) => r.json())
      .then((data) => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  useEffect(() => {
    fetchComments();
    fetch("/api/auth/users")
      .then((r) => r.json())
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [postId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !content.trim()) return;

    setSubmitting(true);
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId,
        userId: Number(selectedUserId),
        content: content.trim(),
      }),
    });
    setSubmitting(false);
    setContent("");
    fetchComments();
  };

  return (
    <div className="mt-3">
      {/* Comment form */}
      <form
        onSubmit={handleSubmit}
        className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Comment as</span>
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
          >
            <option value="">select persona</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="What are your thoughts?"
          className="mb-2 w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm leading-relaxed text-zinc-100 placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !selectedUserId || !content.trim()}
            className="rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            {submitting ? "Posting..." : "Comment"}
          </button>
        </div>
      </form>

      {/* Comments list */}
      {comments.length === 0 ? (
        <p className="py-4 text-center text-xs text-zinc-600">
          No comments yet. Be the first to respond.
        </p>
      ) : (
        <div className="space-y-0.5">
          {comments.map((c, idx) => {
            const avatarColor = PERSONA_COLORS[c.username] || "bg-zinc-600";
            const threadColor = THREAD_COLORS[idx % THREAD_COLORS.length];
            return (
              <div
                key={c.id}
                className={`border-l-2 ${threadColor} py-2.5 pl-3`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ${avatarColor}`}>
                    {c.username.charAt(0)}
                  </span>
                  <span className="font-medium text-zinc-300">{c.username}</span>
                  <span className="text-zinc-600">&middot;</span>
                  <span className="text-zinc-500">{timeAgo(c.timestamp)} ago</span>
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-400">
                  {c.content}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
