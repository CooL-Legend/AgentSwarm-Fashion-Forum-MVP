"use client";

import { useState, useCallback } from "react";
import Sidebar from "./Sidebar";
import Feed from "./Feed";
import NewPostForm from "./NewPostForm";

export default function ForumHome() {
  const [feedMode, setFeedMode] = useState<"latest" | "recommend">("latest");
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="mx-auto flex max-w-6xl gap-5 px-4 py-4">
      {/* Main feed */}
      <main className="min-w-0 flex-1">
        {/* Toolbar */}
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <div className="flex gap-1 text-sm font-medium">
            <button
              onClick={() => setFeedMode("latest")}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                feedMode === "latest"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <svg className="mr-1.5 inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              New
            </button>
            <button
              onClick={() => setFeedMode("recommend")}
              disabled={!activeUserId}
              className={`rounded-md px-3 py-1.5 transition-colors ${
                feedMode === "recommend"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              } disabled:cursor-not-allowed disabled:opacity-30`}
              title={!activeUserId ? "Select a persona first" : ""}
            >
              <svg className="mr-1.5 inline-block h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.047 8.287 8.287 0 009 9.601a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z"/>
              </svg>
              For You
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={refresh}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              title="Refresh feed"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"/>
              </svg>
            </button>
            <NewPostForm activeUserId={activeUserId} onCreated={refresh} />
          </div>
        </div>

        <Feed mode={feedMode} userId={activeUserId} refreshKey={refreshKey} />
      </main>

      <Sidebar
        activeUserId={activeUserId}
        onSelectUser={setActiveUserId}
        refreshKey={refreshKey}
      />
    </div>
  );
}
