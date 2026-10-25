import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Agent = { name: string; role: string; run: (prompt: string) => Promise<string> };

async function responseText(response: Response, provider: string): Promise<string> {
  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? data?.message ?? `${provider} request failed (${response.status})`;
    throw new Error(String(message).slice(0, 500));
  }
  if (provider === "OpenAI") return data?.choices?.[0]?.message?.content ?? "";
  if (provider === "Claude") return (data?.content ?? []).map((part: { text?: string }) => part.text ?? "").join("\n");
  if (provider === "Gemini") return (data?.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? "").join("\n");
  return data?.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "تحتاج تسجل الدخول أولاً." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "إعدادات Supabase غير مكتملة." }, 503);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

  let body: { projectId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "صيغة الطلب غير صحيحة." }, 400);
  }
  const projectId = body.projectId?.trim();
  const message = body.message?.trim();
  if (!projectId || !message || message.length > 12000) {
    return json({ error: "أرسل projectId ورسالة بين 1 و12000 حرف." }, 400);
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name,description,status,plan")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (projectError || !project) return json({ error: "المشروع غير موجود أو ما عندك صلاحية عليه." }, 404);

  const keys = {
    openai: Deno.env.get("OPENAI_API_KEY"),
    anthropic: Deno.env.get("ANTHROPIC_API_KEY"),
    google: Deno.env.get("GOOGLE_AI_API_KEY"),
    openrouter: Deno.env.get("OPENROUTER_API_KEY"),
  };
  const missing = Object.entries(keys).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    return json({
      error: "المجلس يحتاج مفاتيح مزوّدي الذكاء الاصطناعي قبل بدء النقاش.",
      missingProviders: missing,
      requiredSecrets: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY", "OPENROUTER_API_KEY"],
    }, 503);
  }

  const projectContext = [
    "أنت عضو في مجلس تخطيط تقني متعدد النماذج.",
    "حلّل الفكرة فقط ولا تنفذ كوداً ولا تدّعِ أنك عدّلت مستودعاً.",
    "أعطِ: فهم المتطلبات، المخاطر، الخيارات، أسئلة النقص الضرورية، وخطة قابلة للتحقق.",
    "اكتب بالعربية الواضحة، وحافظ على أسماء التقنيات كما هي.",
    `اسم المشروع: ${project.name}`,
    `الوصف الحالي: ${project.description || "غير محدد"}`,
    `حالة المشروع: ${project.status}`,
    `الرسالة الجديدة من المستخدم: ${message}`,
  ].join("\n\n");

  const agents: Agent[] = [
    {
      name: "GPT",
      role: "المهندس المعماري: قسّم العمل إلى مراحل ومخرجات قابلة للاختبار.",
      run: async (prompt) => responseText(await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${keys.openai}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4.1-mini", temperature: 0.3, messages: [{ role: "system", content: "أنت مهندس برمجيات خبير. " + agents[0].role }, { role: "user", content: prompt }] }),
      }), "OpenAI"),
    },
    {
      name: "Claude",
      role: "المراجع الناقد: اكتشف التناقضات والثغرات والمخاطر الأمنية.",
      run: async (prompt) => responseText(await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": keys.anthropic!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-3-7-sonnet-latest", max_tokens: 1800, temperature: 0.3, system: agents[1].role, messages: [{ role: "user", content: prompt }] }),
      }), "Claude"),
    },
    {
      name: "Gemini",
      role: "الباحث عن البدائل: اقترح حلولاً أبسط وقارن الخيارات.",
      run: async (prompt) => responseText(await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(keys.google!), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: agents[2].role }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1800 } }),
      }), "Gemini"),
    },
    {
      name: "المراجع الرابع",
      role: "مدقق الجودة: صمّم اختبارات قبول وخطوات تحقق واضحة.",
      run: async (prompt) => responseText(await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${keys.openrouter}`, "Content-Type": "application/json", "HTTP-Referer": "https://irdreed95-bot.github.io/Ai-kom/", "X-Title": "Ai-kom" },
        body: JSON.stringify({ model: "deepseek/deepseek-chat-v3-0324", temperature: 0.3, messages: [{ role: "system", content: agents[3].role }, { role: "user", content: prompt }] }),
      }), "OpenRouter"),
    },
  ];

  const { error: saveUserError } = await supabase.from("project_messages").insert({
    project_id: project.id, user_id: user.id, role: "user", content: message,
  });
  if (saveUserError) return json({ error: "تعذر حفظ رسالتك.", details: saveUserError.message }, 500);

  const results = await Promise.allSettled(agents.map(async (agent) => ({
    agent: agent.name,
    role: agent.role,
    content: await agent.run(projectContext),
  })));
  const discussion = results.map((result, index) => result.status === "fulfilled"
    ? result.value
    : { agent: agents[index].name, role: agents[index].role, content: "تعذر الحصول على رد هذا النموذج: " + String(result.reason?.message ?? result.reason) });

  const successful = discussion.filter((item) => !item.content.startsWith("تعذر الحصول على رد"));
  if (!successful.length) return json({ error: "فشلت جميع النماذج في الرد.", discussion }, 502);

  const summaryPrompt = [
    "أنت منسق مجلس تخطيط. اجمع الردود التالية في خلاصة عربية متوازنة.",
    "اعرض: فهم الفكرة، نقاط الاتفاق، الخلافات والقرارات المطلوبة، خطة مراحل، اختبارات القبول، والمخاطر.",
    "لا تبدأ التنفيذ ولا تزعم إجراء أي تغييرات. اذكر النواقص التي تحتاج قرار المستخدم.",
    `المشروع: ${project.name}`,
    `رسالة المستخدم: ${message}`,
    ...discussion.map((item) => `\n### ${item.agent} — ${item.role}\n${item.content}`),
  ].join("\n");
  let summary = "اكتمل نقاش المجلس. راجع آراء الأعضاء أعلاه واختر الخطة المناسبة قبل التنفيذ.";
  try {
    summary = await responseText(await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${keys.openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1-mini", temperature: 0.2, messages: [{ role: "system", content: "لخّص النقاش دون إضافة حقائق غير موجودة." }, { role: "user", content: summaryPrompt }] }),
    }), "OpenAI");
  } catch (error) {
    summary += "\n\nملاحظة: تعذر إنشاء خلاصة موحّدة؛ الردود الفردية محفوظة.";
  }

  const agentRows = discussion.map((item) => ({
    project_id: project.id, user_id: user.id, role: "agent", agent_name: item.agent,
    content: item.content, metadata: { role: item.role, stage: "planning" },
  }));
  const { error: agentSaveError } = await supabase.from("project_messages").insert([
    ...agentRows,
    { project_id: project.id, user_id: user.id, role: "assistant", content: summary, metadata: { stage: "council_summary", requires_user_approval: true } },
  ]);
  if (agentSaveError) return json({ error: "اكتمل النقاش لكن تعذر حفظ كل الردود.", discussion, summary }, 500);

  await supabase.from("projects").update({
    last_user_message_at: new Date().toISOString(),
    status: "planning",
    plan: { ...((project.plan && typeof project.plan === "object") ? project.plan : {}), latest_summary: summary, approval_required: true },
  }).eq("id", project.id).eq("user_id", user.id);

  return json({ projectId: project.id, status: "planning", discussion, summary, requiresApproval: true });
});
