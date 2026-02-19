import { getStore, nextId, persist, now, type CommentRow } from "../db";

export type Comment = CommentRow;

export interface CommentWithUser extends Comment {
  username: string;
}

export function createComment(
  postId: number,
  userId: number,
  content: string,
): Comment {
  const store = getStore();
  const id = nextId("comments");
  const comment: Comment = { id, postId, userId, content, timestamp: now() };
  store.comments.push(comment);
  persist();
  return comment;
}

export function getCommentsByPostId(postId: number): CommentWithUser[] {
  const store = getStore();
  return store.comments
    .filter((c) => c.postId === postId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((c) => {
      const user = store.users.find((u) => u.id === c.userId);
      return { ...c, username: user?.username ?? "unknown" };
    });
}
