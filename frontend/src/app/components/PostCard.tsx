import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

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
  post: Post;
  userId: number | null;
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

export default function PostCard({ post, userId }: Props) {
  const [liked, setLiked] = useState<"up" | "down" | null>(null);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [isLoading, setIsLoading] = useState(false);

  const handleVote = async (voteType: "up" | "down") => {
    if (!userId || isLoading) return;
    
    // Toggle off if clicking same vote
    if (liked === voteType) {
      setLiked(null);
      setLikeCount(voteType === "up" ? likeCount - 1 : likeCount + 1);
      
      // Delete the interaction from Supabase
      await supabase
        .from("interactions")
        .delete()
        .match({ 
          user_id: userId, 
          item_id: post.id
        });
      return;
    }

    setIsLoading(true);
    try {
      // First, delete any existing interaction
      await supabase
        .from("interactions")
        .delete()
        .match({ 
          user_id: userId, 
          item_id: post.id
        });

      // Calculate weight: Post Likes = 1.0, Dislikes = -0.5
      const weight = voteType === "up" ? 1.0 : -0.5;

      // Then insert new interaction with weight
      const { error } = await supabase
        .from("interactions")
        .insert({
          user_id: userId,
          item_id: post.id,
          interaction_type: voteType === "up" ? "LIKE" : "DISLIKE",
          weight: weight,
          created_at: new Date().toISOString(),
        });

      if (!error) {
        const diff = liked ? 2 : 1;
        setLiked(voteType);
        setLikeCount(voteType === "up" ? likeCount + diff : likeCount - diff);
      }
    } catch (error) {
      console.error("Failed to vote:", error);
    } finally {
      setIsLoading(false);
    }
  };
  const catColors =
    CATEGORY_COLORS[post.category] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/20";
  const avatarColor = PERSONA_COLORS[post.username] || "bg-zinc-600";

  return (
    <Link href={`/post/${post.id}`} className="group block">
      <article className="flex gap-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700">
        {/* Reddit-style vote column */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 bg-zinc-950/50 py-3">
          <button
            onClick={(e) => { e.preventDefault(); handleVote("up"); }}
            disabled={!userId || isLoading}
            className={`transition-colors group-hover:text-amber-400 ${liked === "up" ? "text-amber-400" : "text-zinc-600"} ${!userId ? "cursor-not-allowed opacity-50" : ""}`}
            title={userId ? "Upvote" : "Select a user to vote"}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3z" clipRule="evenodd" />
            </svg>
          </button>
          <span className={`text-xs font-bold ${liked ? "text-amber-400" : "text-zinc-300"}`}>{likeCount}</span>
          <button
            onClick={(e) => { e.preventDefault(); handleVote("down"); }}
            disabled={!userId || isLoading}
            className={`transition-colors ${liked === "down" ? "text-rose-400" : "text-zinc-700"} ${!userId ? "cursor-not-allowed opacity-50" : ""}`}
            title={userId ? "Downvote" : "Select a user to vote"}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 17a.75.75 0 01-.55-.24l-3.25-3.5a.75.75 0 111.1-1.02L10 15.148l2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5A.75.75 0 0110 17z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 px-3 py-3">
          {/* Meta line */}
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor}`}>
              {(post.username || '?').charAt(0)}
            </span>
            <span className="font-medium text-zinc-400">{post.username}</span>
            <span className="text-zinc-600">&middot;</span>
            <span className={`rounded-sm px-1.5 py-px text-[10px] font-medium ring-1 ring-inset ${catColors}`}>
              {post.category}
            </span>
            <span className="text-zinc-600">&middot;</span>
            <span className="text-zinc-500">{timeAgo(post.timestamp)}</span>
          </div>

          {/* Title */}
          <h3 className="mb-1 text-[15px] font-semibold leading-snug text-zinc-100 group-hover:text-amber-400">
            {post.title}
          </h3>

          {/* Content preview */}
          <p className="line-clamp-2 text-[13px] leading-relaxed text-zinc-500">
            {post.content}
          </p>

          {/* Image if available */}
          {post.imageUrl && (
            <div className="mt-2 overflow-hidden rounded-md">
              <img
                src={post.imageUrl}
                alt={post.title}
                className="h-48 w-full object-cover"
              />
            </div>
          )}

          {/* Action bar */}
          <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 transition-colors hover:bg-zinc-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
              </svg>
              {post.commentCount} comment{post.commentCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

