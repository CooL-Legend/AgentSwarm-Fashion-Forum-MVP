import { getStore } from "../db";
import type { PostWithMeta } from "../services/postService";

/**
 * Placeholder recommendation engine.
 * Currently ranks posts by a weighted score of likes and recency.
 *
 * --- SWAPPING IN A PYTHON/PYTORCH MODEL ---
 * 1. Stand up a Python service (FastAPI/Flask) that exposes:
 *      POST http://localhost:8000/recommend
 *      Body: { "userId": 1 }
 *      Response: { "postIds": [3, 1, 7, ...] }
 *
 * 2. Replace the scoring below with:
 *      const res = await fetch('http://localhost:8000/recommend', {
 *        method: 'POST',
 *        headers: { 'Content-Type': 'application/json' },
 *        body: JSON.stringify({ userId }),
 *      });
 *      const { postIds } = await res.json();
 *      // Then fetch full post rows in that order
 *
 * 3. The Python service can use embeddings, collaborative filtering,
 *    or any PyTorch model to generate the ranked list of postIds.
 */
export function getRecommendedPosts(userId: number): PostWithMeta[] {
  void userId; // will be used once the real model is plugged in

  const store = getStore();

  const scored = store.posts.map((post) => {
    const user = store.users.find((u) => u.id === post.userId);
    const likeCount = store.interactions.filter(
      (i) => i.postId === post.id && i.type === "like",
    ).length;
    const commentCount = store.comments.filter(
      (c) => c.postId === post.id,
    ).length;

    const ageHours =
      (Date.now() - new Date(post.timestamp + "Z").getTime()) / 3_600_000;
    const score = likeCount * 2 + 1 / (1 + ageHours);

    return {
      ...post,
      username: user?.username ?? "unknown",
      likeCount,
      commentCount,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
