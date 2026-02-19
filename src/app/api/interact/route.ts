import { NextRequest } from "next/server";
import { recordInteraction } from "@/lib/controllers/interactionController";

export async function POST(req: NextRequest) {
  return recordInteraction(req);
}
