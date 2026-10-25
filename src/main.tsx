import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Activity, ArrowUpLeft, Bot, BrainCircuit, CheckCircle2, CircleHelp, Code2, Command, Database, GitBranch, Github, Globe2, Layers3, LockKeyhole, LogIn, Plus, Rocket, Search, Settings2, ShieldCheck, Sparkles, Users, Workflow, X } from 'lucide-react';
import './style.css';

type Project = { id: string; name: string; description: string; status: string; updated_at: string; };
type CouncilMessage = { id?: string; role: string; agent_name?: string | null; content: string; created_at?: string; };
type CouncilResult = { summary: string; discussion: { agent: string; role: string; content: string }[]; requiresApproval: boolean; };
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase: SupabaseClient | null = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const seedProjects: Project[] = [
  { id: 'demo-1', name: 'أول مشروع لك', description: 'ابدأ من فكرتك ودع المجلس يجهز خطة التنفيذ.', status: 'planning', updated_at: new Date().toISOString() },
];

function App() {
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [councilInput, setCouncilInput] = useState('');
  const [councilLoading, setCouncilLoading] = useState(false);
  const [councilMessages, setCouncilMessages] = useState<CouncilMessage[]>([]);
  const [councilResult, setCouncilResult] = useState<CouncilResult | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setUserEmail(data.session?.user.email ?? ''); setUserId(data.session?.user.id ?? ''); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { setUserEmail(session?.user.email ?? ''); setUserId(session?.user.id ?? ''); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !userEmail) return;
    supabase.from('projects').select('id,name,description,status,updated_at').order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setNotice('تعذر تحميل المشاريع من قاعدة البيانات: ' + error.message);
        else setProjects((data ?? []) as Project[]);
      });
  }, [userEmail]);

  const filteredProjects = useMemo(() => projects.filter(p => (p.name + ' ' + p.description).toLowerCase().includes(search.toLowerCase())), [projects, search]);
  const connected = Boolean(supabase);

  async function signIn(signUp: boolean) {
    if (!supabase) { setNotice('قاعدة البيانات غير مربوطة بعد. أضف أسرار Supabase في GitHub Actions ثم أعد النشر.'); return; }
    setLoading(true);
    const result = signUp
      ? await supabase.auth.signUp({ email: authEmail, password: authPassword })
      : await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    setLoading(false);
    if (result.error) setNotice(result.error.message);
    else { setAuthOpen(false); setNotice(signUp ? 'تم إنشاء الحساب. افحص بريدك إذا طُلب تأكيده.' : 'تم تسجيل الدخول.'); }
  }

  async function openProject(project: Project) {
    if (!supabase || !userEmail || project.id.startsWith('demo-')) {
      setNotice('حتى تفتح مجلساً محفوظاً، اربط Supabase وسجّل الدخول أولاً.');
      return;
    }
    setSelectedProject(project);
    setCouncilResult(null);
    setCouncilMessages([]);
    const { data, error } = await supabase.from('project_messages')
      .select('id,role,agent_name,content,created_at')
      .eq('project_id', project.id).order('created_at', { ascending: true }).limit(100);
    if (error) setNotice('تعذر تحميل محادثة المشروع: ' + error.message);
    else setCouncilMessages((data ?? []) as CouncilMessage[]);
  }

  async function sendToCouncil() {
    if (!supabase || !selectedProject || !councilInput.trim()) return;
    setCouncilLoading(true);
    setCouncilResult(null);
    const message = councilInput.trim();
    setCouncilInput('');
    const { data, error } = await supabase.functions.invoke('council', {
      body: { projectId: selectedProject.id, message },
    });
    setCouncilLoading(false);
    if (error || data?.error) {
      setCouncilInput(message);
      const details = data?.missingProviders?.length ? ' المفاتيح الناقصة: ' + data.missingProviders.join(', ') : '';
      setNotice((data?.error || error?.message || 'تعذر تشغيل المجلس.') + details);
      return;
    }
    setCouncilResult(data as CouncilResult);
    const { data: saved } = await supabase.from('project_messages')
      .select('id,role,agent_name,content,created_at')
      .eq('project_id', selectedProject.id).order('created_at', { ascending: true }).limit(100);
    if (saved) setCouncilMessages(saved as CouncilMessage[]);
    setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, status: 'planning', updated_at: new Date().toISOString() } : p));
  }

  async function approvePlan() {
    if (!supabase || !selectedProject) return;
    setCouncilLoading(true);
    const { data, error } = await supabase.functions.invoke('approve-plan', {
      body: { projectId: selectedProject.id, approved: true },
    });
    setCouncilLoading(false);
    if (error || data?.error) {
      setNotice(data?.error || error?.message || 'تعذر حفظ الموافقة.');
      return;
    }
    setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, status: 'approved', updated_at: new Date().toISOString() } : p));
    setSelectedProject({ ...selectedProject, status: 'approved' });
    setNotice('تم حفظ موافقتك على الخطة. ربط التنفيذ الفعلي بمستودع GitHub ما زال يحتاج إعداد تكامل GitHub الآمن.');
  }

  async function createProject() {
    if (!projectName.trim()) return;
    const row = { name: projectName.trim(), description: projectDescription.trim(), status: 'planning' };
    if (supabase && userEmail) {
      const { data, error } = await supabase.from('projects').insert({ ...row, user_id: userId }).select('id,name,description,status,updated_at').single();
      if (error) { setNotice('لم يُحفظ المشروع: ' + error.message); return; }
      setProjects(prev => [data as Project, ...prev]);
    } else {
      setProjects(prev => [{ ...row, id: crypto.randomUUID(), updated_at: new Date().toISOString() }, ...prev]);
      setNotice('تم إنشاء مشروع تجريبي على هذا الجهاز. اربط Supabase لحفظه بحسابك ومزامنته.');
    }
    setProjectName(''); setProjectDescription(''); setProjectOpen(false);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-mark"><BrainCircuit size={24}/></span><span>Ai-kom<small>AI COLLABORATION STUDIO</small></span></a>
      <button className="workspace-select"><span className="workspace-avatar">D</span><span><b>مساحة العمل</b><small>{userEmail || 'مساحة شخصية'}</small></span><Layers3 size={16}/></button>
      <div className="nav-label">مساحة العمل</div>
      <nav>
        <a className="nav-item active" href="#"><Command size={18}/> لوحة التحكم <span className="nav-dot"/></a>
        <a className="nav-item" href="#projects"><Code2 size={18}/> المشاريع</a>
        <a className="nav-item" href="#council"><Users size={18}/> مجلس الذكاء الاصطناعي</a>
        <a className="nav-item" href="#memory"><BrainCircuit size={18}/> الذاكرة والمعرفة</a>
        <a className="nav-item" href="#github"><Github size={18}/> مستودعات GitHub</a>
      </nav>
      <div className="nav-label">الإعدادات</div>
      <nav><a className="nav-item" href="#integrations"><Workflow size={18}/> التكاملات</a><a className="nav-item" href="#settings"><Settings2 size={18}/> الإعدادات</a></nav>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={18}/><span><b>خصوصيتك أولاً</b><small>بيانات كل مستخدم معزولة</small></span></div><button className="profile-row" onClick={() => userEmail ? supabase?.auth.signOut() : setAuthOpen(true)}><span className="profile-avatar">{userEmail ? userEmail[0].toUpperCase() : '؟'}</span><span><b>{userEmail || 'تسجيل الدخول'}</b><small>{userEmail ? 'تسجيل الخروج' : 'حسابك الشخصي'}</small></span>{userEmail ? <ArrowUpLeft size={16}/> : <LogIn size={16}/>}</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs">مساحة العمل <span>/</span> <b>لوحة التحكم</b></div><div className="top-actions"><span className={'connection-pill ' + (connected ? 'online' : 'offline')}><i/>{connected ? 'إعداد قاعدة البيانات' : 'قاعدة البيانات غير مربوطة'}</span><button className="icon-button" title="المساعدة"><CircleHelp size={18}/></button><button className="avatar-mini" onClick={() => setAuthOpen(true)}>{userEmail ? userEmail[0].toUpperCase() : 'D'}</button></div></header>
      <section className="welcome-row"><div><div className="eyebrow"><Sparkles size={15}/> مساحة بناء مدعومة بالذكاء الاصطناعي</div><h1>خلّي فكرتك <span>تصير حقيقة.</span></h1><p>مجلس ذكاء اصطناعي يناقش، يخطط، ثم يبني معك — خطوة بخطوة.</p></div><button className="primary-button" onClick={() => setProjectOpen(true)}><Plus size={18}/> مشروع جديد</button></section>
      {!connected && <div className="setup-banner"><div className="banner-icon"><Database size={20}/></div><div><b>خطوة الربط التالية: قاعدة البيانات</b><p>الواجهة جاهزة كبداية. حتى تعمل الحسابات والذاكرة السحابية، يلزم إنشاء مشروع Supabase مستقل وإضافة مفاتيحه إلى أسرار GitHub.</p></div><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">فتح Supabase <ArrowUpLeft size={15}/></a></div>}
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice('')}><X size={16}/></button></div>}
      <section className="stats-grid">
        <div className="stat-card"><div className="stat-top"><span>مشاريعك</span><span className="stat-icon purple"><Code2 size={18}/></span></div><strong>{projects.length.toString().padStart(2,'0')}</strong><small>مشاريع في مساحة العمل</small></div>
        <div className="stat-card"><div className="stat-top"><span>أعضاء المجلس</span><span className="stat-icon blue"><Users size={18}/></span></div><strong>04</strong><small>مخطط لدعم عدة مزوّدين</small></div>
        <div className="stat-card"><div className="stat-top"><span>مستودعات GitHub</span><span className="stat-icon green"><GitBranch size={18}/></span></div><strong>—</strong><small>بانتظار ربط GitHub OAuth</small></div>
        <div className="stat-card"><div className="stat-top"><span>حالة المنصة</span><span className="stat-icon amber"><Activity size={18}/></span></div><strong className="status-text">قيد التأسيس</strong><small>نجهّز الأساس الآمن أولاً</small></div>
      </section>
      <section className="section-block" id="projects"><div className="section-heading"><div><h2>مشاريع مساحة العمل</h2><p>كل مشروع يحتفظ بخطته وسياقه وذاكرته بشكل مستقل.</p></div><div className="search-box"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن مشروع..."/></div></div>
        {filteredProjects.length ? <div className="project-grid">{filteredProjects.map(p => <article className="project-card" key={p.id}><div className="project-card-top"><span className="project-icon"><Code2 size={20}/></span><button className="more-button">•••</button></div><h3>{p.name}</h3><p>{p.description || 'لا يوجد وصف بعد.'}</p><div className="project-meta"><span className="status-chip"><i/>{p.status === 'planning' ? 'تخطيط' : p.status}</span><span>{new Date(p.updated_at).toLocaleDateString('ar-IQ')}</span></div><button className="open-project" onClick={() => void openProject(p)}>فتح مساحة المشروع <ArrowUpLeft size={15}/></button></article>)}
          <button className="new-project-card" onClick={() => setProjectOpen(true)}><span><Plus size={22}/></span><b>ابدأ مشروعاً جديداً</b><small>موقع، تطبيق، لعبة أو نظام متكامل</small></button></div> : <div className="empty-state"><Code2 size={28}/><b>ماكو مشاريع تطابق البحث</b><button onClick={() => setSearch('')}>مسح البحث</button></div>}
      </section>
      <section className="section-block" id="council"><div className="section-heading"><div><h2>مجلس الذكاء الاصطناعي</h2><p>أربعة أدوار تتعاون قبل بدء التنفيذ.</p></div><span className="planned-tag"><LockKeyhole size={14}/> يحتاج مفاتيح API</span></div><div className="council-grid">
        <div className="agent-card"><span className="agent-symbol gpt">G</span><div><b>GPT</b><small>التخطيط والهندسة</small></div><span className="agent-state">مخطط</span></div>
        <div className="agent-card"><span className="agent-symbol claude">C</span><div><b>Claude</b><small>مراجعة وتحليل</small></div><span className="agent-state">مخطط</span></div>
        <div className="agent-card"><span className="agent-symbol gemini">✦</span><div><b>Gemini</b><small>بحث وبدائل</small></div><span className="agent-state">مخطط</span></div>
        <div className="agent-card"><span className="agent-symbol fourth">4</span><div><b>النموذج الرابع</b><small>اختبارات وتدقيق</small></div><span className="agent-state">اختيار لاحق</span></div>
      </div><div className="approval-flow"><span className="flow-step done"><CheckCircle2 size={16}/> فهم الفكرة</span><span className="flow-line"/><span className="flow-step"><Users size={16}/> نقاش المجلس</span><span className="flow-line"/><span className="flow-step"><ShieldCheck size={16}/> موافقتك</span><span className="flow-line"/><span className="flow-step"><Rocket size={16}/> التنفيذ</span></div></section>
      <footer><span>Ai-kom © 2026</span><span>مصممة لتبني أفكارك، مو بس تكتب لك كود.</span><a href="https://github.com/irdreed95-bot/Ai-kom" target="_blank" rel="noreferrer"><Github size={15}/> المستودع</a></footer>
    </main>
    {projectOpen && <div className="modal-backdrop" onClick={() => setProjectOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setProjectOpen(false)}><X size={18}/></button><span className="modal-icon"><Sparkles size={22}/></span><h2>مشروع جديد</h2><p>ابدأ باسم ووصف بسيط. لاحقاً يراجع المجلس فكرتك ويعرض خطة قبل التنفيذ.</p><label>اسم المشروع<input autoFocus value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="مثلاً: منصة تعليم ذكية"/></label><label>وصف الفكرة<textarea value={projectDescription} onChange={e => setProjectDescription(e.target.value)} placeholder="شنو تريد تبني؟" rows={4}/></label><button className="primary-button full" onClick={createProject} disabled={!projectName.trim()}><Plus size={17}/> إنشاء المشروع</button></div></div>}
    {selectedProject && <div className="modal-backdrop council-backdrop" onClick={() => setSelectedProject(null)}><div className="modal council-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedProject(null)}><X size={18}/></button><span className="modal-icon"><Users size={22}/></span><h2>{selectedProject.name}</h2><p>{selectedProject.description || 'مجلس المشروع: اشرح فكرتك وسيحللها الأعضاء قبل أي تنفيذ.'}</p><div className="council-transcript">{councilMessages.map((m, i) => <article className={'transcript-message ' + m.role} key={m.id || i}><b>{m.role === 'user' ? 'أنت' : m.agent_name || (m.role === 'assistant' ? 'خلاصة المجلس' : 'Ai-kom')}</b><p>{m.content}</p></article>)}{councilResult && <article className="transcript-message assistant"><b>الخلاصة الحالية</b><p>{councilResult.summary}</p></article>}{councilLoading && <div className="council-loading"><span className="loading-dot"/> المجلس يحلل الفكرة ويقارن الآراء…</div>}</div><label>رسالتك للمجلس<textarea value={councilInput} onChange={e => setCouncilInput(e.target.value)} placeholder="اشرح المطلوب، القيود، والنتيجة التي تريدها..." rows={3}/></label><button className="primary-button full" onClick={() => void sendToCouncil()} disabled={councilLoading || !councilInput.trim()}><Users size={17}/>{councilLoading ? 'جارٍ النقاش...' : 'ابدأ نقاش المجلس'}</button>{councilResult?.requiresApproval && selectedProject.status !== 'approved' && <button className="secondary-button full" onClick={() => void approvePlan()} disabled={councilLoading}><ShieldCheck size={17}/> أوافق على الخطة</button>}<small className="approval-note">المجلس يخطط فقط. الموافقة تحفظ قرارك، ولا تعني أن مستودع GitHub عُدّل بالفعل.</small></div></div>}
    {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAuthOpen(false)}><X size={18}/></button><span className="modal-icon"><LockKeyhole size={22}/></span><h2>دخول إلى Ai-kom</h2><p>سجّل دخولك حتى تبقى مشاريعك وذاكرتها مرتبطة بحسابك.</p><label>البريد الإلكتروني<input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com"/></label><label>كلمة المرور<input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••"/></label><button className="primary-button full" disabled={loading || !authEmail || authPassword.length < 6} onClick={() => signIn(false)}><LogIn size={17}/>{loading ? 'جارٍ...' : 'تسجيل الدخول'}</button><button className="secondary-button full" disabled={loading || !authEmail || authPassword.length < 6} onClick={() => signIn(true)}>إنشاء حساب جديد</button></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
