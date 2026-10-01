import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils.ts';

interface EditorProps {
  submissionId: string;
  userName: string;
  userColor: string;
  onEditorReady?: (editor: any) => void;
}

export default function Editor({ submissionId, userName, userColor, onEditorReady }: EditorProps) {
  const [status, setStatus] = useState('connecting');
  const [ydoc] = useState(() => new Y.Doc());
  
  const provider = new WebsocketProvider(
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/submission/${submissionId}`,
    submissionId,
    ydoc
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider: provider,
        user: {
          name: userName,
          color: userColor,
        },
      }),
    ],
    onUpdate: ({ editor }) => {
      // Could notify parent here if needed
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  useEffect(() => {
    provider.on('status', (event: any) => {
      setStatus(event.status);
    });

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [submissionId]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full border rounded-2xl overflow-hidden bg-white shadow-sm border-slate-200">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", status === 'connected' ? "bg-emerald-500" : "bg-amber-500")} />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{status}</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => editor.chain().focus().toggleBold().run()} 
            className={cn("p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-700", editor.isActive('bold') && "bg-slate-200")}
          >
            <span className="font-bold text-sm">B</span>
          </button>
          <button 
            onClick={() => editor.chain().focus().toggleItalic().run()} 
            className={cn("p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-700", editor.isActive('italic') && "bg-slate-200")}
          >
            <span className="italic text-sm">I</span>
          </button>
          <div className="w-px h-4 bg-slate-300 mx-1" />
          <button 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
            className={cn("p-1.5 hover:bg-slate-200 rounded-md transition-colors text-slate-700", editor.isActive('heading', { level: 1 }) && "bg-slate-200")}
          >
            <span className="font-bold text-xs">H1</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-slate-50/30">
        <EditorContent editor={editor} className="min-h-full p-12 lg:p-20 bg-white shadow-sm mx-auto max-w-[800px] border-x border-slate-100 focus:outline-none prose prose-slate" />
      </div>
    </div>
  );
}
