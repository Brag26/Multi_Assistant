export async function GET() {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, { cache: "no-store" });
  } catch {}
  return Response.json({ ok: true });
}