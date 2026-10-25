import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const expected = Deno.env.get("MEMORY_CLEANUP_SECRET");
  const supplied = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || supplied !== expected) return json({ error: "Unauthorized." }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server configuration is incomplete." }, 503);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  const { data: candidates, error: listError } = await admin.from("projects")
    .select("id,user_id,plan").lt("memory_expires_at", now).limit(200);
  if (listError) return json({ error: "Could not list expired project memory.", details: listError.message }, 500);
  const expired = (candidates ?? []).filter((project) =>
    !(project.plan && typeof project.plan === "object" && "memory_expired" in project.plan && project.plan.memory_expired === true)
  );

  const results: { projectId: string; success: boolean; error?: string }[] = [];
  for (const project of expired ?? []) {
    const [messages, knowledge] = await Promise.all([
      admin.from("project_messages").delete().eq("project_id", project.id),
      admin.from("knowledge_sources").delete().eq("project_id", project.id),
    ]);
    if (messages.error || knowledge.error) {
      results.push({ projectId: project.id, success: false, error: messages.error?.message ?? knowledge.error?.message });
      continue;
    }
    const previousPlan = project.plan && typeof project.plan === "object" ? project.plan : {};
    const { error: updateError } = await admin.from("projects").update({
      status: "archived",
      plan: { ...previousPlan, memory_expired: true, memory_expired_at: now, approval_required: false },
      updated_at: now,
    }).eq("id", project.id);
    results.push(updateError
      ? { projectId: project.id, success: false, error: updateError.message }
      : { projectId: project.id, success: true });
  }
  return json({ checkedAt: now, expiredCount: expired?.length ?? 0, archivedCount: results.filter((r) => r.success).length, results });
});
