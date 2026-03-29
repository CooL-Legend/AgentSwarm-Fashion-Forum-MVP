/**
 * Placeholder recommendation engine.
 *
 * --- SWAPPING IN A PYTHON/PYTORCH MODEL ---
 * 1. Stand up a Python service (FastAPI/Flask) that exposes:
 *      POST http://localhost:8000/recommend
 *      Body: { "userId": 1 }
 *      Response: { "postIds": [3, 1, 7, ...] }
 *
 * 2. Call the endpoint and return the ranked list of posts.
 *
 * 3. The Python service can use embeddings, collaborative filtering,
 *    or any PyTorch model to generate the ranked list of postIds.
 */
export function getRecommendedPosts(_userId: number): unknown[] {
  // TODO: plug in real recommendation model
  return [];
}
