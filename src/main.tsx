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
  const [selectedProject, setSelectedProject] = useState<Project | null>({ id: 'local-chat', name: 'محادثة جديدة', description: '', status: 'planning', updated_at: new Date().toISOString() });
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
    setSelectedProject(project);
    setCouncilResult(null);
    setCouncilMessages([]);
    setCouncilInput('');
    if (!supabase || !userEmail || project.id.startsWith('demo-') || project.id.startsWith('local-')) {
      setNotice('المحادثة فتحت. حتى يشتغل مجلس الذكاء الاصطناعي وتنحفظ المحادثة، سجّل الدخول أو أنشئ حساباً.');
      return;
    }
    const { data, error } = await supabase.from('project_messages')
      .select('id,role,agent_name,content,created_at')
      .eq('project_id', project.id).order('created_at', { ascending: true }).limit(100);
    if (error) setNotice('تعذر تحميل محادثة المشروع: ' + error.message);
    else setCouncilMessages((data ?? []) as CouncilMessage[]);
  }

  async function sendToCouncil() {
    if (!selectedProject || !councilInput.trim()) return;
    if (!supabase || !userEmail || selectedProject.id.startsWith('local-') || selectedProject.id.startsWith('demo-')) {
      setNotice('حتى يرد عليك مجلس الذكاء الاصطناعي فعلياً، سجّل الدخول أو أنشئ حساباً من زر الحساب. محادثتك مفتوحة، لكن الردود تحتاج حساباً محفوظاً.');
      setAuthOpen(true);
      return;
    }
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
    const cleanName = projectName.trim();
    if (!cleanName) { setNotice('اكتب اسم المشروع أولاً، وبعدها اضغط إنشاء المشروع.'); return; }
    setNotice('');
    const row = { name: cleanName, description: projectDescription.trim(), status: 'planning' };
    if (supabase && userEmail) {
      const { data, error } = await supabase.from('projects').insert({ ...row, user_id: userId }).select('id,name,description,status,updated_at').single();
      if (error) { setNotice('لم يُحفظ المشروع: ' + error.message); return; }
      const created = data as Project;
      setProjects(prev => [created, ...prev]);
      setSelectedProject(created);
      setCouncilMessages([]);
      setCouncilResult(null);
      setCouncilInput('');
    } else {
      const created: Project = { ...row, id: 'local-' + crypto.randomUUID(), updated_at: new Date().toISOString() };
      setProjects(prev => [created, ...prev]);
      setSelectedProject(created);
      setCouncilMessages([]);
      setCouncilResult(null);
      setCouncilInput('');
      setNotice('انفتح مشروعك كمحادثة. سجّل الدخول حتى تقدر تشغّل المجلس وتحفظ المحادثة بشكل دائم.');
    }
    setProjectName(''); setProjectDescription(''); setProjectOpen(false);
  }

  return <div className="direct-chat" dir="rtl">
    <header className="chat-header">
      <div className="chat-brand"><span className="brand-mark"><BrainCircuit size={22}/></span><b>Ai-kom</b></div>
      <button className="chat-account" onClick={() => userEmail ? supabase?.auth.signOut() : setAuthOpen(true)} title={userEmail || 'تسجيل الدخول'}>{userEmail ? userEmail[0].toUpperCase() : <LogIn size={19}/>}</button>
    </header>
    <main className="direct-chat-main">
      <div className="chat-scroll">
        {councilMessages.length === 0 && !councilResult && !councilLoading ? <div className="chat-welcome"><span className="welcome-orb"><Sparkles size={28}/></span><h1>هلا بيك، شنو نشتغل اليوم؟</h1><p>اكتب فكرتك مباشرة، ومجلس Ai-kom يساعدك بتحليلها ووضع خطة قبل أي تنفيذ.</p></div> : null}
        {councilMessages.map((m, i) => <article className={'chat-message ' + (m.role === 'user' ? 'from-user' : 'from-ai')} key={m.id || i}><b>{m.role === 'user' ? 'أنت' : m.agent_name || (m.role === 'assistant' ? 'خلاصة المجلس' : 'Ai-kom')}</b><p>{m.content}</p></article>)}
        {councilResult && <article className="chat-message from-ai"><b>خلاصة المجلس</b><p>{councilResult.summary}</p>{councilResult.discussion?.map((m,i)=><div className="agent-reply" key={i}><b>{m.agent}</b><p>{m.content}</p></div>)}</article>}
        {councilLoading && <div className="chat-thinking"><span className="loading-dot"/> المجلس يفكر ويقارن الآراء…</div>}
      </div>
      {notice && <div className="chat-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="إغلاق">×</button></div>}
      <form className="chat-composer" onSubmit={e => { e.preventDefault(); void sendToCouncil(); }}>
        <textarea value={councilInput} onChange={e => setCouncilInput(e.target.value)} placeholder="اكتب رسالتك هنا..." rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendToCouncil(); } }} />
        <button type="submit" disabled={councilLoading || !councilInput.trim()} aria-label="إرسال"><ArrowUpLeft size={21}/></button>
        <small>قدّم فكرتك بالتفصيل. لن يبدأ التنفيذ إلا بعد موافقتك.</small>
      </form>
      {councilResult?.requiresApproval && selectedProject?.status !== 'approved' && <button className="approve-chat" onClick={() => void approvePlan()} disabled={councilLoading}><ShieldCheck size={17}/> أوافق على الخطة</button>}
    </main>
    {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAuthOpen(false)}><X size={18}/></button><span className="modal-icon"><LockKeyhole size={22}/></span><h2>دخول إلى Ai-kom</h2><p>سجّل دخولك حتى يقدر المجلس يرد وتحفظ محادثاتك.</p><label>البريد الإلكتروني<input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com"/></label><label>كلمة المرور<input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••"/></label><button className="primary-button full" disabled={loading || !authEmail || authPassword.length < 6} onClick={() => signIn(false)}><LogIn size={17}/>{loading ? 'جارٍ...' : 'تسجيل الدخول'}</button><button className="secondary-button full" disabled={loading || !authEmail || authPassword.length < 6} onClick={() => signIn(true)}>إنشاء حساب جديد</button></div></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
