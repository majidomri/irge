'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase, getChannels, getPosts, getStories, createChannel, deletePost, deleteStory, signIn, signOut, getSession, type IChannel, type IPost, type IStory } from '@/lib/supabase';

const CLOUD_NAME    = 'dkt6odvzv';
const UPLOAD_PRESET = 'ml_default';

async function uploadToCloud(file: File, folder: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', file); fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', 'instarishta/' + folder);
  const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? 'Upload failed');
  return json.secure_url as string;
}

type Tab = 'channels' | 'posts' | 'stories';

export default function AdminPage() {
  // ── Auth ──
  const [session,  setSession]  = useState<boolean | null>(null);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');

  // ── Channels ──
  const [channels,  setChannels]  = useState<IChannel[]>([]);
  const [active,    setActive]    = useState<IChannel | null>(null);
  const [newChName, setNewChName] = useState('');
  const [newChDesc, setNewChDesc] = useState('');

  // ── Posts / Stories ──
  const [posts,   setPosts]   = useState<IPost[]>([]);
  const [stories, setStories] = useState<IStory[]>([]);

  // ── New post form ──
  const [npTitle,   setNpTitle]   = useState('');
  const [npCaption, setNpCaption] = useState('');
  const [npImage,   setNpImage]   = useState('');
  const [npAudio,   setNpAudio]   = useState('');
  const [npThumb,   setNpThumb]   = useState('');

  // ── UI state ──
  const [tab,      setTab]      = useState<Tab>('channels');
  const [uploading,setUploading]= useState(false);
  const [toast,    setToast]    = useState('');

  const fileRef  = useRef<HTMLInputElement>(null);
  const storyRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Auth
  useEffect(() => {
    getSession().then(s => setSession(!!s));
    supabase.auth.onAuthStateChange((_, s) => setSession(!!s));
  }, []);

  useEffect(() => {
    if (session) getChannels().then(setChannels).catch(console.error);
  }, [session]);

  useEffect(() => {
    if (!active) return;
    getPosts(active.id, 0).then(setPosts).catch(console.error);
    getStories(active.id).then(setStories).catch(console.error);
  }, [active]);

  const doLogin  = async () => { setLoginErr(''); try { await signIn(email, password); } catch (e: unknown) { setLoginErr((e as Error).message); } };
  const doLogout = async () => { await signOut(); setSession(false); setChannels([]); setActive(null); };

  const addChannel = async () => {
    if (!newChName.trim()) return;
    try {
      const ch = await createChannel(newChName.trim(), newChDesc.trim());
      setChannels(prev => [ch, ...prev]);
      setNewChName(''); setNewChDesc('');
      showToast('Channel created ✓');
    } catch (e: unknown) { showToast('Error: ' + (e as Error).message); }
  };

  const uploadPostImg = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !active) return;
    setUploading(true);
    try {
      const url   = await uploadToCloud(file, 'posts');
      const thumb = url.replace('/upload/', '/upload/w_420,q_auto,f_auto/');
      setNpImage(url); setNpThumb(thumb);
      showToast('Image ready ✓');
    } catch (e: unknown) { showToast('Upload failed: ' + (e as Error).message); }
    finally { setUploading(false); }
  };

  const submitPost = async () => {
    if (!active || !npImage) { showToast('Select a channel and upload an image.'); return; }
    try {
      const { data, error } = await supabase.from('ir_posts').insert([{
        channel_id: active.id, image: npImage, thumb: npThumb || null,
        title: npTitle || null, caption: npCaption || null, audio_url: npAudio || null,
      }]).select().single();
      if (error) throw error;
      setPosts(prev => [data, ...prev]);
      setNpTitle(''); setNpCaption(''); setNpImage(''); setNpThumb(''); setNpAudio('');
      showToast('Post published ✓');
    } catch (e: unknown) { showToast('Error: ' + (e as Error).message); }
  };

  const removePost  = async (id: string) => { try { await deletePost(id);  setPosts(prev  => prev.filter(p => p.id !== id)); showToast('Post deleted'); }  catch (e: unknown) { showToast((e as Error).message); } };

  const uploadStory = async () => {
    if (!active) { showToast('Select a channel first'); return; }
    const file = storyRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToCloud(file, 'stories');
      const { data, error } = await supabase.from('ir_stories').insert([{ channel_id: active.id, image: url }]).select().single();
      if (error) throw error;
      setStories(prev => [data, ...prev]);
      showToast('Story added ✓');
    } catch (e: unknown) { showToast('Error: ' + (e as Error).message); }
    finally { setUploading(false); }
  };

  const removeStory = async (id: string) => { try { await deleteStory(id); setStories(prev => prev.filter(s => s.id !== id)); showToast('Story deleted'); } catch (e: unknown) { showToast((e as Error).message); } };

  // ── Login ──────────────────────────────────────────────────────────────────
  if (session === null) return <div className="flex justify-center py-20"><div className="spinner" /></div>;

  if (!session) return (
    <div style={{ background: '#F3F0EE', minHeight: '100vh' }} className="flex items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm bg-white rounded-[16px] p-10" style={{ boxShadow: '0px 4px 24px rgba(0,0,0,0.10)' }}>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em] mb-1" style={{ color: '#141413' }}>
          Insta<span style={{ color: '#00754A' }}>Rishta</span> Admin
        </h1>
        <p className="text-sm mb-8" style={{ color: '#696969' }}>Channel management & studio</p>
        <div className="flex flex-col gap-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-[10px] border px-4 py-3 text-sm outline-none" style={{ borderColor: '#D1CDC7' }} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" onKeyDown={e => e.key === 'Enter' && doLogin()} className="w-full rounded-[10px] border px-4 py-3 text-sm outline-none" style={{ borderColor: '#D1CDC7' }} />
          {loginErr && <p className="text-xs font-medium" style={{ color: '#CF4500' }}>{loginErr}</p>}
          <button onClick={doLogin} className="btn-primary w-full">Sign In</button>
        </div>
      </div>
    </div>
  );

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: 'channels', label: 'Channels' },
    { id: 'posts',    label: 'Posts'    },
    { id: 'stories',  label: 'Stories'  },
  ];

  return (
    <div style={{ background: '#F3F0EE', minHeight: '100vh' }}>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold" style={{ background: '#141413', color: '#F3F0EE', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      {/* Top bar */}
      <div style={{ background: '#141413' }} className="px-6 py-4 flex items-center justify-between">
        <span className="text-base font-extrabold" style={{ color: '#fff' }}>
          Insta<span style={{ color: '#00754A' }}>Rishta</span>
          <span className="text-xs font-medium ml-2" style={{ color: 'rgba(255,255,255,0.45)' }}>Admin</span>
        </span>
        <button onClick={doLogout} className="text-xs font-semibold border rounded-full px-3 py-1.5" style={{ borderColor: 'rgba(255,255,255,0.20)', color: 'rgba(255,255,255,0.65)' }}>Sign Out</button>
      </div>

      <div className="max-w-[1280px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">

        {/* ── Sidebar: Channel selector + new channel ── */}
        <aside>
          <h2 className="text-xs font-bold uppercase tracking-[0.06em] mb-4" style={{ color: '#696969' }}>Select Channel</h2>

          <div className="bg-white rounded-[12px] p-5 mb-4" style={{ boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' }}>
            <p className="text-xs font-bold uppercase tracking-[0.04em] mb-3" style={{ color: '#696969' }}>New Channel</p>
            <input value={newChName} onChange={e => setNewChName(e.target.value)} placeholder="Name" className="w-full rounded-[8px] border px-3 py-2 text-sm outline-none mb-2" style={{ borderColor: '#D1CDC7' }} />
            <input value={newChDesc} onChange={e => setNewChDesc(e.target.value)} placeholder="Description" className="w-full rounded-[8px] border px-3 py-2 text-sm outline-none mb-3" style={{ borderColor: '#D1CDC7' }} />
            <button onClick={addChannel} className="btn-brand w-full text-sm" style={{ padding: '8px 16px' }}>Create Channel</button>
          </div>

          <div className="flex flex-col gap-1.5">
            {channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => { setActive(ch); setTab('posts'); }}
                className="text-left px-4 py-3 rounded-[10px] border text-sm font-medium transition-all"
                style={{
                  background:  active?.id === ch.id ? '#141413' : '#fff',
                  color:       active?.id === ch.id ? '#fff'    : '#141413',
                  borderColor: active?.id === ch.id ? '#141413' : '#edebe9',
                }}
              >{ch.name}</button>
            ))}
          </div>
        </aside>

        {/* ── Main panel ── */}
        <main>
          {!active ? (
            <div className="text-center py-24" style={{ color: '#696969' }}>
              <p className="text-4xl mb-4">💍</p>
              <p className="font-medium text-lg">Select or create a channel</p>
              <p className="text-sm mt-1">All posts, stories, and studio tools appear here</p>
            </div>
          ) : (
            <>
              {/* Channel heading + tabs */}
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h2 className="text-xl font-extrabold tracking-[-0.02em]" style={{ color: '#141413' }}>{active.name}</h2>
                <div className="flex rounded-full overflow-hidden border" style={{ borderColor: '#D1CDC7' }}>
                  {TABS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="px-4 py-2 text-xs font-bold transition-colors"
                      style={{
                        background: tab === t.id ? '#141413' : '#fff',
                        color:      tab === t.id ? '#fff'    : '#696969',
                      }}
                    >{t.label}</button>
                  ))}
                </div>
              </div>

              {/* ── CHANNELS tab: channel info ── */}
              {tab === 'channels' && (
                <div className="bg-white rounded-[12px] p-7" style={{ boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' }}>
                  <p className="text-xs font-bold uppercase tracking-[0.04em] mb-4" style={{ color: '#696969' }}>Channel Info</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div><span className="font-semibold" style={{ color: '#141413' }}>Name: </span><span style={{ color: '#696969' }}>{active.name}</span></div>
                    <div><span className="font-semibold" style={{ color: '#141413' }}>Slug: </span><span style={{ color: '#696969' }}>/channels/{active.slug}</span></div>
                    <div className="col-span-full"><span className="font-semibold" style={{ color: '#141413' }}>Description: </span><span style={{ color: '#696969' }}>{active.description ?? '—'}</span></div>
                    <div><span className="font-semibold" style={{ color: '#141413' }}>Posts: </span><span style={{ color: '#696969' }}>{posts.length}</span></div>
                    <div><span className="font-semibold" style={{ color: '#141413' }}>Stories: </span><span style={{ color: '#696969' }}>{stories.length}</span></div>
                  </div>
                </div>
              )}

              {/* ── POSTS tab ── */}
              {tab === 'posts' && (
                <>
                  {/* Add post form */}
                  <div className="bg-white rounded-[12px] p-6 mb-6" style={{ boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' }}>
                    <p className="text-xs font-bold uppercase tracking-[0.04em] mb-4" style={{ color: '#696969' }}>New Post</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <input value={npTitle}   onChange={e => setNpTitle(e.target.value)}   placeholder="Title (optional)"     className="rounded-[8px] border px-3 py-2 text-sm outline-none" style={{ borderColor: '#D1CDC7' }} />
                      <input value={npAudio}   onChange={e => setNpAudio(e.target.value)}   placeholder="Audio URL (optional)" className="rounded-[8px] border px-3 py-2 text-sm outline-none" style={{ borderColor: '#D1CDC7' }} />
                    </div>
                    <textarea value={npCaption} onChange={e => setNpCaption(e.target.value)} placeholder="Caption (optional)" rows={2} className="w-full rounded-[8px] border px-3 py-2 text-sm outline-none resize-none mb-3" style={{ borderColor: '#D1CDC7' }} />
                    <div className="flex items-center gap-3 flex-wrap">
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadPostImg} />
                      <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-primary text-sm" style={{ padding: '8px 16px' }}>
                        {uploading ? 'Uploading…' : npImage ? '✓ Change Image' : 'Upload Image'}
                      </button>
                      {npImage && <img src={npImage} alt="" className="w-14 h-14 rounded-[8px] object-cover" />}
                      <button onClick={submitPost} className="btn-brand text-sm" style={{ padding: '8px 16px' }}>Publish Post</button>
                    </div>
                  </div>

                  {/* Posts grid */}
                  <p className="text-xs font-bold uppercase tracking-[0.04em] mb-4" style={{ color: '#696969' }}>All Posts ({posts.length})</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {posts.map(p => (
                      <div key={p.id} className="relative aspect-square rounded-[8px] overflow-hidden group" style={{ background: '#F3F0EE' }}>
                        <img src={p.thumb ?? p.image} alt={p.title ?? ''} className="w-full h-full object-cover" loading="lazy" />
                        {p.title && <span className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] font-semibold text-white truncate" style={{ background: 'rgba(0,0,0,0.55)' }}>{p.title}</span>}
                        <button
                          onClick={() => removePost(p.id)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-xs font-bold border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: '#CF4500', color: '#fff' }}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ── STORIES tab ── */}
              {tab === 'stories' && (
                <>
                  <div className="bg-white rounded-[12px] p-6 mb-6" style={{ boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-bold uppercase tracking-[0.04em]" style={{ color: '#696969' }}>Stories (24-hour)</p>
                      <div>
                        <input ref={storyRef} type="file" accept="image/*" className="hidden" onChange={uploadStory} />
                        <button onClick={() => storyRef.current?.click()} disabled={uploading} className="btn-brand text-xs" style={{ padding: '7px 16px' }}>
                          {uploading ? 'Uploading…' : '+ Add Story'}
                        </button>
                      </div>
                    </div>
                    {!stories.length && <p className="text-sm" style={{ color: '#696969' }}>No active stories. Stories expire after 24 hours.</p>}
                  </div>

                  {stories.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {stories.map(s => (
                        <div key={s.id} className="relative aspect-[9/16] rounded-[10px] overflow-hidden group" style={{ background: '#F3F0EE' }}>
                          <img src={s.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] text-white" style={{ background: 'rgba(0,0,0,0.5)' }}>
                            {new Date(s.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <button
                            onClick={() => removeStory(s.id)}
                            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full text-xs font-bold border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: '#CF4500', color: '#fff' }}
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
