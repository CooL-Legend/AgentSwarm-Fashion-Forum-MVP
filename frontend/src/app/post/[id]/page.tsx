import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params: _params,
}: {
  params: Promise<{ id: string }>;
}) {
  await _params;
  redirect("/");
}
