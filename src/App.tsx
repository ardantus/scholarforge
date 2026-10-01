import { useState, useEffect } from 'react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { Plus, BookOpen, FileText, CheckCircle2, User as UserIcon, LogOut, Loader2 } from 'lucide-react';
import Editor from './components/Editor.tsx';
import { cn } from './lib/utils.ts';
import { FileDown, Eye, X, History, Save, RotateCcw, ShieldCheck } from 'lucide-react';

type View = 'journals' | 'submissions' | 'editor';

interface Journal {
  id: string;
  name: string;
  slug: string;
  description: string;
}

interface Submission {
  id: string;
  title: string;
  journalId: string;
  status: string;
  metadata: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('journals');
  const [journals, setJournals] = useState<Journal[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [currentSubmission, setCurrentSubmission] = useState<Submission | null>(null);
  const [preFlightLoading, setPreFlightLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionLoading, setVersionLoading] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        fetchJournals();
        fetchSubmissions();
      }
    });
    return unsubscribe;
  }, []);

  const fetchJournals = async () => {
    const res = await fetch('/api/journals');
    const data = await res.json();
    setJournals(data);
  };

  const fetchSubmissions = async () => {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/submissions', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setSubmissions(data);
  };

  const createSubmission = async (journalId: string) => {
    const title = prompt('Enter submission title:');
    if (!title) return;
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ title, journalId })
    });
    const data = await res.json();
    setSubmissions([data, ...submissions]);
    openSubmission(data);
  };

  const openSubmission = (s: Submission) => {
    setCurrentSubmission(s);
    setView('editor');
  };

  const runPreFlight = async () => {
    if (!currentSubmission) return;
    setPreFlightLoading(true);
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/submissions/${currentSubmission.id}/pre-flight`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setCurrentSubmission({ ...currentSubmission, metadata: { ...currentSubmission.metadata, preFlight: data } });
    setPreFlightLoading(false);
  };

  const runAnonymize = async () => {
    if (!currentSubmission || !editorInstance) return;
    if (!confirm('This will permanently replace names and affiliations in the manuscript with [BLINDED]. Continue?')) return;
    
    setAnonymizing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const content = editorInstance.getText();
      const res = await fetch(`/api/submissions/${currentSubmission.id}/anonymize`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ content })
      });
      const data = await res.json();
      editorInstance.commands.setContent(`<p>${data.content.replace(/\n/g, '</p><p>')}</p>`);
    } catch (error) {
      console.error('Anonymization failed:', error);
    } finally {
      setAnonymizing(false);
    }
  };

  const generatePdf = async () => {
    if (!currentSubmission || !editorInstance) return;
    setPdfLoading(true);
    setShowPdfPreview(true);
    setShowVersionHistory(false);
    try {
      const token = await auth.currentUser?.getIdToken();
      const content = editorInstance.getText();
      const res = await fetch(`/api/submissions/${currentSubmission.id}/typeset`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ content })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (error) {
      console.error('PDF generation failed:', error);
    } finally {
      setPdfLoading(false);
    }
  };

  const fetchVersions = async () => {
    if (!currentSubmission) return;
    setVersionLoading(true);
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/submissions/${currentSubmission.id}/versions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setVersions(data);
    setVersionLoading(false);
  };

  const saveVersion = async () => {
    if (!currentSubmission || !editorInstance) return;
    const name = prompt('Enter version name:', `Save at ${new Date().toLocaleTimeString()}`);
    if (!name) return;
    
    const token = await auth.currentUser?.getIdToken();
    const content = editorInstance.getJSON();
    const res = await fetch(`/api/submissions/${currentSubmission.id}/versions`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ name, content })
    });
    const data = await res.json();
    setVersions([data, ...versions]);
  };

  const restoreVersion = async (v: any) => {
    if (!currentSubmission || !editorInstance) return;
    if (!confirm(`Restore version "${v.name}"? Current unsaved changes will be lost.`)) return;
    
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/submissions/${currentSubmission.id}/restore`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ content: v.content })
    });
    
    if (res.ok) {
      // Reload the content into the editor
      editorInstance.commands.setContent(v.content);
      setShowVersionHistory(false);
    }
  };

  const login = () => signInWithPopup(auth, googleAuthProvider);
  const logout = () => auth.signOut();

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  if (!user) return (
    <div className="flex h-screen items-center justify-center bg-white p-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 font-display">ScholarForge</h1>
          <p className="text-slate-500">Next-generation academic publishing.</p>
        </div>
        <button 
          onClick={login}
          className="w-full py-3 px-4 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
        >
          <UserIcon className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    </div>
  );

  const userColor = user ? (() => {
    const hash = Array.from(user.uid).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'];
    return colors[hash % colors.length];
  })() : '#6366f1';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">ScholarForge</h1>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button 
            onClick={() => setView('journals')}
            className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors", 
              view === 'journals' ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50")}
          >
            <BookOpen className="w-4 h-4" />
            Journals
          </button>
          <button 
            onClick={() => setView('submissions')}
            className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors", 
              view === 'submissions' ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50")}
          >
            <FileText className="w-4 h-4" />
            My Submissions
          </button>
        </nav>
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
              {user.displayName?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user.displayName}</p>
              <button onClick={logout} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 mt-0.5">
                <LogOut className="w-3 h-3" /> Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {view === 'journals' && (
          <div className="p-8 max-w-5xl mx-auto space-y-8">
            <header>
              <h2 className="text-2xl font-bold text-slate-900">Academic Journals</h2>
              <p className="text-slate-500 mt-1">Browse available journals and start your submission.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {journals.map(j => (
                <div key={j.id} className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-slate-300 transition-colors shadow-sm group">
                  <h3 className="text-lg font-semibold text-slate-900">{j.name}</h3>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">{j.description}</p>
                  <button 
                    onClick={() => createSubmission(j.id)}
                    className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-900 bg-slate-50 px-4 py-2 rounded-lg group-hover:bg-slate-100 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Start Submission
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'submissions' && (
          <div className="p-8 max-w-5xl mx-auto space-y-8">
            <header className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Your Submissions</h2>
                <p className="text-slate-500 mt-1">Manage your active manuscripts.</p>
              </div>
            </header>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {submissions.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-900">{s.title}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("px-2 py-1 rounded text-xs font-semibold", 
                          s.status === 'draft' ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700")}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button 
                          onClick={() => openSubmission(s)}
                          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          Open Editor
                        </button>
                      </td>
                    </tr>
                  ))}
                  {submissions.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                        No submissions yet. Start one from the Journals tab.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'editor' && currentSubmission && (
          <div className="h-full flex flex-col">
            <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={() => setView('submissions')} className="text-slate-400 hover:text-slate-600">
                  <FileText className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-slate-900">{currentSubmission.title}</h2>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={runAnonymize}
                  disabled={anonymizing}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-amber-600 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 disabled:opacity-50 transition-all shadow-sm"
                  title="Replace author identities with [BLINDED]"
                >
                  {anonymizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Anonymize
                </button>
                <button 
                  onClick={() => {
                    setShowVersionHistory(!showVersionHistory);
                    if (!showVersionHistory) fetchVersions();
                    setShowPdfPreview(false);
                  }}
                  className={cn("flex items-center gap-2 px-4 py-2 text-sm font-semibold border rounded-lg transition-all shadow-sm",
                    showVersionHistory ? "bg-slate-100 border-slate-300 text-slate-900" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")}
                >
                  <History className="w-4 h-4" />
                  History
                </button>
                <button 
                  onClick={generatePdf}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
                >
                  <Eye className="w-4 h-4" />
                  Preview PDF
                </button>
                <button 
                  onClick={runPreFlight}
                  disabled={preFlightLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm"
                >
                  {preFlightLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  AI Pre-Flight
                </button>
              </div>
            </header>
            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 p-8 overflow-auto">
                <div className="max-w-4xl mx-auto h-full">
                  <Editor 
                    submissionId={currentSubmission.id} 
                    userName={user.displayName || 'Anonymous'} 
                    userColor={userColor}
                    onEditorReady={setEditorInstance}
                  />
                </div>
              </div>
              {/* PDF Preview Panel */}
              {showPdfPreview && (
                <aside className="w-1/2 bg-slate-100 border-l border-slate-200 flex flex-col">
                  <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                      <FileDown className="w-4 h-4 text-slate-500" />
                      PDF Preview (Typst Mock)
                    </h3>
                    <button onClick={() => setShowPdfPreview(false)} className="p-1 hover:bg-slate-100 rounded">
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </header>
                  <div className="flex-1 p-4 overflow-hidden flex items-center justify-center">
                    {pdfLoading ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Compiling Typst...</p>
                      </div>
                    ) : pdfUrl ? (
                      <iframe src={pdfUrl} className="w-full h-full rounded-lg shadow-xl bg-white" />
                    ) : (
                      <p className="text-sm text-slate-400 font-medium">Failed to load preview</p>
                    )}
                  </div>
                </aside>
              )}
              {/* Version History Panel */}
              {showVersionHistory && (
                <aside className="w-80 bg-white border-l border-slate-200 flex flex-col">
                  <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                      <History className="w-4 h-4 text-slate-500" />
                      Version History
                    </h3>
                    <button onClick={saveVersion} title="Save current snapshot" className="p-1 hover:bg-slate-100 rounded text-slate-500">
                      <Save className="w-4 h-4" />
                    </button>
                  </header>
                  <div className="flex-1 overflow-auto">
                    {versionLoading ? (
                      <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {versions.map(v => (
                          <div key={v.id} className="p-4 hover:bg-slate-50 transition-colors group">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{v.name}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">
                                  {new Date(v.createdAt).toLocaleString()}
                                </p>
                              </div>
                              <button 
                                onClick={() => restoreVersion(v)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-slate-200 rounded text-indigo-600 transition-all"
                                title="Restore this version"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {versions.length === 0 && (
                          <div className="p-8 text-center text-xs text-slate-400">
                            No snapshots yet. Click the disk icon to save a version.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </aside>
              )}
              {/* Pre-flight Results Panel */}
              {currentSubmission.metadata?.preFlight && (
                <aside className="w-80 bg-white border-l border-slate-200 overflow-auto p-6 space-y-6">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Pre-Flight Analysis
                  </h3>
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl">
                      <p className="text-xs font-semibold text-slate-500 uppercase">Integrity Score</p>
                      <p className="text-2xl font-bold text-slate-900">{currentSubmission.metadata.preFlight.integrity_score}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Summary</p>
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed">{currentSubmission.metadata.preFlight.summary}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Issues Flagged</p>
                      <ul className="mt-2 space-y-2">
                        {currentSubmission.metadata.preFlight.potential_issues.map((issue: string, i: number) => (
                          <li key={i} className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
