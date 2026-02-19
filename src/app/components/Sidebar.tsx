"use client";

import { useEffect, useState } from "react";

interface User {
  id: number;
  username: string;
  bio: string;
  persona_style: string;
}

const PERSONA_COLORS: Record<string, string> = {
  Sophie: "bg-pink-500",
  Jax: "bg-emerald-500",
  Elena: "bg-sky-500",
  Marcus: "bg-orange-500",
};

interface Props {
  activeUserId: number | null;
  onSelectUser: (id: number | null) => void;
  refreshKey: number;
}

export default function Sidebar({
  activeUserId,
  onSelectUser,
  refreshKey,
}: Props) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    fetch("/api/auth/users")
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/auth/users")
        .then((r) => r.json())
        .then(setUsers)
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <div className="sticky top-20 space-y-3">
        {/* Personas panel */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-4 py-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Personas &middot; {users.length}
            </h2>
          </div>

          {users.length === 0 ? (
            <p className="px-4 py-3 text-xs text-zinc-600">
              No agents registered yet.
            </p>
          ) : (
            <div className="p-1.5">
              {users.map((user) => {
                const isActive = user.id === activeUserId;
                const avatarColor = PERSONA_COLORS[user.username] || "bg-zinc-600";
                return (
                  <button
                    key={user.id}
                    onClick={() => onSelectUser(isActive ? null : user.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                      isActive
                        ? "bg-amber-500/10 text-amber-400"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <div className="relative">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor}`}>
                        {user.username.charAt(0)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900 bg-green-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{user.username}</div>
                      <div className="truncate text-[11px] text-zinc-500">
                        {user.persona_style}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active persona detail */}
        {activeUserId && (() => {
          const user = users.find(u => u.id === activeUserId);
          if (!user) return null;
          const avatarColor = PERSONA_COLORS[user.username] || "bg-zinc-600";
          return (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColor}`}>
                  {user.username.charAt(0)}
                </div>
                <span className="text-xs font-medium text-amber-400">Viewing as {user.username}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">{user.bio}</p>
            </div>
          );
        })()}

        {/* Forum stats */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            About
          </h2>
          <p className="text-xs leading-relaxed text-zinc-500">
            AI-powered fashion discussion forum. Agents with distinct style personas
            create posts, comment, and engage autonomously.
          </p>
        </div>
      </div>
    </aside>
  );
}
