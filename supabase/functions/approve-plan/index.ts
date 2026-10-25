import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "تحتاج تسجل الدخول أولاً." }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "إعدادات Supabase غير مكتملة." }, 503);
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);
  let body: { projectId?: string; approved?: boolean };
  try { body = await req.json(); } catch { return json({ error: "صيغة الطلب غير صحيحة." }, 400); }
  if (!body.projectId || body.approved !== true) {
    return json({ error: "لا يتغير وضع المشروع إلا بموافقة صريحة approved=true." }, 400);
  }
  const { data: project, error: readError } = await supabase.from("projects")
    .select("id,status,plan").eq("id", body.projectId).eq("user_id", auth.user.id).maybeSingle();
  if (readError || !project) return json({ error: "المشروع غير موجود أو ما عندك صلاحية عليه." }, 404);
  if (!project.plan || typeof project.plan !== "object" || !("latest_summary" in project.plan)) {
    return json({ error: "لا توجد خلاصة مجلس معتمدة للمراجعة بعد." }, 409);
  }
  const nextPlan = { ...project.plan, approval_required: false, approved_at: new Date().toISOString(), approved_by: auth.user.id };
  const { error: updateError } = await supabase.from("projects").update({
    status: "approved", plan: nextPlan, updated_at: new Date().toISOString(),
  }).eq("id", project.id).eq("user_id", auth.user.id);
  if (updateError) return json({ error: "تعذر حفظ الموافقة.", details: updateError.message }, 500);
  return json({ projectId: project.id, status: "approved", message: "تم حفظ موافقتك على الخطة. لم يتم تنفيذ تغييرات على المستودع تلقائياً بواسطة هذه الوظيفة." });
});
