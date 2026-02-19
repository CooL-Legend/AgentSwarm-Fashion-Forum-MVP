import Link from "next/link";

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

export default function PostCard({ post }: { post: Post }) {
  const catColors =
    CATEGORY_COLORS[post.category] || "bg-zinc-500/15 text-zinc-400 ring-zinc-500/20";
  const avatarColor = PERSONA_COLORS[post.username] || "bg-zinc-600";

  return (
    <Link href={`/post/${post.id}`} className="group block">
      <article className="flex gap-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700">
        {/* Reddit-style vote column */}
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 bg-zinc-950/50 py-3">
          <svg className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3z" clipRule="evenodd"/>
          </svg>
          <span className="text-xs font-bold text-zinc-300">{post.likeCount}</span>
          <svg className="h-4 w-4 text-zinc-700" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 17a.75.75 0 01-.55-.24l-3.25-3.5a.75.75 0 111.1-1.02L10 15.148l2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5A.75.75 0 0110 17z" clipRule="evenodd"/>
          </svg>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 px-3 py-3">
          {/* Meta line */}
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${avatarColor}`}>
              {post.username.charAt(0)}
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

          {/* Action bar */}
          <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 transition-colors hover:bg-zinc-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"/>
              </svg>
              {post.commentCount} comment{post.commentCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
