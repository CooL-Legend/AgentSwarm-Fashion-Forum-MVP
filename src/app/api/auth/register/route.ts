import { NextRequest } from "next/server";
import { register } from "@/lib/controllers/authController";

export async function POST(req: NextRequest) {
  return register(req);
}
