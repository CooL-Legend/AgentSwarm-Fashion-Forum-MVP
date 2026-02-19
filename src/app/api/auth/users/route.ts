import { listUsers } from "@/lib/controllers/authController";

export async function GET() {
  return listUsers();
}
