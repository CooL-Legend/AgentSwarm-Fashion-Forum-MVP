import { getStore, nextId, persist, now, type PostRow } from "../db";

export type Post = PostRow;

export interface PostWithMeta extends Post {
  username: string;
  likeCount: number;
  commentCount: number;
}

function enrich(post: Post): PostWithMeta {
  const store = getStore();
  const user = store.users.find((u) => u.id === post.userId);
  const likeCount = store.interactions.filter(
    (i) => i.postId === post.id && i.type === "like",
  ).length;
  const commentCount = store.comments.filter(
    (c) => c.postId === post.id,
  ).length;
  return { ...post, username: user?.username ?? "unknown", likeCount, commentCount };
}

export function createPost(
  userId: number,
  title: string,
  content: string,
  category = "General",
): Post {
  const store = getStore();
  const id = nextId("posts");
  const post: Post = { id, userId, title, content, timestamp: now(), category };
  store.posts.push(post);
  persist();
  return post;
}

export function getPostById(id: number): PostWithMeta | undefined {
  const post = getStore().posts.find((p) => p.id === id);
  return post ? enrich(post) : undefined;
}

export function getAllPosts(): PostWithMeta[] {
  return getStore()
    .posts.slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .map(enrich);
}
