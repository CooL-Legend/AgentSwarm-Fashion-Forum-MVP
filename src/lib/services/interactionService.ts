import { getStore, nextId, persist, now, type InteractionRow } from "../db";

export type Interaction = InteractionRow;

export function recordInteraction(
  userId: number,
  postId: number,
  type: string,
): Interaction {
  const store = getStore();
  const id = nextId("interactions");
  const interaction: Interaction = {
    id,
    userId,
    postId,
    type: type as Interaction["type"],
    timestamp: now(),
  };
  store.interactions.push(interaction);
  persist();
  return interaction;
}

export function hasUserLikedPost(userId: number, postId: number): boolean {
  return getStore().interactions.some(
    (i) => i.userId === userId && i.postId === postId && i.type === "like",
  );
}

export function getUserInteractions(userId: number): Interaction[] {
  return getStore().interactions.filter((i) => i.userId === userId);
}
