import { getStore, nextId, persist, type UserRow } from "../db";

export type User = UserRow;

export function createUser(
  username: string,
  bio = "",
  persona_style = "",
): User {
  const store = getStore();
  const id = nextId("users");
  const user: User = { id, username, bio, persona_style };
  store.users.push(user);
  persist();
  return user;
}

export function getUserById(id: number): User | undefined {
  return getStore().users.find((u) => u.id === id);
}

export function getUserByUsername(username: string): User | undefined {
  return getStore().users.find((u) => u.username === username);
}

export function getAllUsers(): User[] {
  return getStore().users;
}
