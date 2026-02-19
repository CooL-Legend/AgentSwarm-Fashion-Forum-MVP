import { NextRequest } from "next/server";
import {
  createComment,
  getComments,
} from "@/lib/controllers/commentController";

export async function GET(req: NextRequest) {
  return getComments(req);
}

export async function POST(req: NextRequest) {
  return createComment(req);
}
