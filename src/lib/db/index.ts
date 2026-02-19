import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "dev-data.json");

export interface UserRow {
  id: number;
  username: string;
  bio: string;
  persona_style: string;
}

export interface PostRow {
  id: number;
  userId: number;
  title: string;
  content: string;
  timestamp: string;
  category: string;
}

export interface CommentRow {
  id: number;
  postId: number;
  userId: number;
  content: string;
  timestamp: string;
}

export interface InteractionRow {
  id: number;
  userId: number;
  postId: number;
  type: "view" | "like" | "click";
  timestamp: string;
}

export interface StoreData {
  users: UserRow[];
  posts: PostRow[];
  comments: CommentRow[];
  interactions: InteractionRow[];
  _nextId: {
    users: number;
    posts: number;
    comments: number;
    interactions: number;
  };
}

const DEFAULT_STORE: StoreData = {
  users: [],
  posts: [],
  comments: [],
  interactions: [],
  _nextId: { users: 1, posts: 1, comments: 1, interactions: 1 },
};

let cache: StoreData | null = null;

function load(): StoreData {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf-8");
    cache = JSON.parse(raw) as StoreData;
  } catch {
    cache = structuredClone(DEFAULT_STORE);
    flush();
  }
  return cache!;
}

function flush(): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(cache, null, 2));
}

export function getStore(): StoreData {
  return load();
}

export function nextId(table: keyof StoreData["_nextId"]): number {
  const store = load();
  const id = store._nextId[table];
  store._nextId[table] = id + 1;
  flush();
  return id;
}

export function persist(): void {
  flush();
}

export function now(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
