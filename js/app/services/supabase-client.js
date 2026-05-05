/* ─────────────────────────────────────────────────────────────────────────────
   InstaRishta — Multi-Channel SaaS Service
   Stack: Supabase (DB + Auth) · Cloudinary (images) · Cloudflare R2 (audio)

   Exposes: window.IRService
   Requires: Supabase JS v2 CDN loaded before this script
   ───────────────────────────────────────────────────────────────────────────── */

(function (global) {
  "use strict";

  // ── CONFIG — replace all four TODO values ─────────────────────────────────
  const SUPABASE_URL = "https://cxgxyqxeakjrghfzkuko.supabase.co"; // TODO
  const SUPABASE_ANON = "sb_publishable_C2qwOBB0NvHL0KRGwpXBQg_UGZFoCis"; // TODO
  const CLOUD_NAME = "dkt6odvzv"; // TODO
  const UPLOAD_PRESET = "ml_default";
  // Cloudflare R2: admin pastes full public URL per upload, so no base URL needed here.

  const POST_PAGE_SIZE = 9;

  let _client = null;

  function db() {
    if (!_client) {
      if (!global.supabase) {
        throw new Error(
          "[IRService] Supabase SDK not loaded. Add the CDN <script> before supabase-client.js.",
        );
      }
      _client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        realtime: { params: { eventsPerSecond: 10 } },
      });
    }
    return _client;
  }

  // ── Channels ──────────────────────────────────────────────────────────────

  async function getChannels() {
    const { data, error } = await db()
      .from("ir_channels")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function getChannelBySlug(slug) {
    const { data, error } = await db()
      .from("ir_channels")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function createChannel({ name, description, coverImage }) {
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const { data, error } = await db()
      .from("ir_channels")
      .insert([{ name, slug, description, cover_image: coverImage || null }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ── Posts ─────────────────────────────────────────────────────────────────

  async function getPosts(channelId, page) {
    const from = page * POST_PAGE_SIZE;
    const to = from + POST_PAGE_SIZE - 1;
    const { data, error } = await db()
      .from("ir_posts")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw error;
    return data || [];
  }

  async function getRecentPosts(channelId, limit) {
    const { data, error } = await db()
      .from("ir_posts")
      .select("id, thumb, image, title, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit || 12);
    if (error) throw error;
    return data || [];
  }

  async function createPost({
    channelId,
    image,
    thumb,
    images,
    title,
    caption,
    audioUrl,
  }) {
    const { data, error } = await db()
      .from("ir_posts")
      .insert([
        {
          channel_id: channelId,
          image,
          thumb: thumb || null,
          images: images && images.length ? images : [],
          title: title || null,
          caption: caption || null,
          audio_url: audioUrl || null,
        },
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deletePost(postId) {
    const { error } = await db().from("ir_posts").delete().eq("id", postId);
    if (error) throw error;
  }

  async function incrementLikes(postId) {
    const { error } = await db().rpc("ir_increment_likes", { post_id: postId });
    if (error) console.warn("[IRService] increment_likes:", error.message);
  }

  async function incrementViews(postId) {
    const { error } = await db().rpc("ir_increment_views", { post_id: postId });
    if (error) console.warn("[IRService] increment_views:", error.message);
  }

  // ── Stories ───────────────────────────────────────────────────────────────

  async function getStories(channelId) {
    const cutoff = new Date(Date.now() - 86400000).toISOString(); // 24 h ago
    const { data, error } = await db()
      .from("ir_stories")
      .select("*")
      .eq("channel_id", channelId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function deleteExpiredStories(hoursOld) {
    const { data, error } = await db().rpc("ir_delete_expired_stories", {
      hours_old: hoursOld || 24,
    });
    if (error) throw error;
    return data || 0;
  }

  async function createStory({ channelId, image }) {
    const { data, error } = await db()
      .from("ir_stories")
      .insert([{ channel_id: channelId, image }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteStory(storyId) {
    const { error } = await db().from("ir_stories").delete().eq("id", storyId);
    if (error) throw error;
  }

  async function getAdminStories(channelId, limit) {
    const { data, error } = await db()
      .from("ir_stories")
      .select("id, image, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit || 18);
    if (error) throw error;
    return data || [];
  }

  // ── Highlights (permanent, manual-advance) ───────────────────────────────

  async function getHighlights() {
    const { data, error } = await db()
      .from("ir_highlights")
      .select("*")
      .order("order_index", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function createHighlight({ image, title, orderIndex }) {
    const { data, error } = await db()
      .from("ir_highlights")
      .insert([{ image, title: title || null, order_index: orderIndex || 0 }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteHighlight(id) {
    const { error } = await db().from("ir_highlights").delete().eq("id", id);
    if (error) throw error;
  }

  // ── Realtime ──────────────────────────────────────────────────────────────

  function subscribeChannel(channelId, onInsert) {
    return db()
      .channel("ir_realtime_" + channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ir_posts",
          filter: "channel_id=eq." + channelId,
        },
        (payload) => onInsert(payload.new),
      )
      .subscribe();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function signIn(email, password) {
    const { data, error } = await db().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await db().auth.signOut();
  }

  async function getSession() {
    const { data } = await db().auth.getSession();
    return data.session;
  }

  // ── Image upload: jSquash compress → Cloudinary REST API ─────────────────
  // NOTE: UPLOAD_PRESET must be set to "Unsigned" in your Cloudinary dashboard.
  // Settings → Upload → Upload presets → edit preset → Signing mode: Unsigned.

  // Pre-fetch the WebP encoder WASM in the background so first upload is fast.
  const _encoderReady = import("https://esm.sh/@jsquash/webp@1.3.0")
    .then((m) => m.encode)
    .catch(() => null);

  async function _compressToWebP(file) {
    const MAX_PX = 2000;
    const bitmap = await createImageBitmap(file);
    let w = bitmap.width,
      h = bitmap.height;
    if (w > MAX_PX || h > MAX_PX) {
      const s = MAX_PX / Math.max(w, h);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }

    const canvas = Object.assign(document.createElement("canvas"), {
      width: w,
      height: h,
    });
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    // Try jSquash WebP encoder (better compression than native canvas)
    try {
      const encode = await _encoderReady;
      if (encode) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const bytes = await encode(imageData, { quality: 82 });
        return new Blob([bytes], { type: "image/webp" });
      }
    } catch (e) {
      console.warn("[IRService] jSquash fallback to canvas:", e.message);
    }

    // Fallback: native canvas WebP (all modern browsers)
    return new Promise((res) => canvas.toBlob(res, "image/webp", 0.82));
  }

  function _uploadToast(text) {
    if (!document.getElementById("_ir_spin_kf")) {
      const s = document.createElement("style");
      s.id = "_ir_spin_kf";
      s.textContent =
        "@keyframes _ir_spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
      "background:#1c1c1c;border:1px solid #333;color:#f5f5f5;" +
      "padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;" +
      "z-index:9999;display:flex;align-items:center;gap:10px;" +
      "box-shadow:0 4px 20px rgba(0,0,0,.5);white-space:nowrap;";
    const spin = document.createElement("div");
    spin.style.cssText =
      "width:16px;height:16px;border:2.5px solid #444;" +
      "border-top-color:#e8534a;border-radius:50%;flex-shrink:0;" +
      "animation:_ir_spin 0.65s linear infinite;";
    const label = document.createElement("span");
    label.textContent = text;
    el.append(spin, label);
    document.body.appendChild(el);
    return {
      set(t) {
        label.textContent = t;
      },
      done(t) {
        label.textContent = t;
        spin.remove();
        setTimeout(() => el.remove(), 2200);
      },
      remove() {
        el.remove();
      },
    };
  }

  function uploadImage(folder, callback) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async function () {
      const file = input.files[0];
      input.remove();
      if (!file) return;

      const toast = _uploadToast("Compressing…");
      try {
        const blob = await _compressToWebP(file);
        const saved = Math.round((1 - blob.size / file.size) * 100);
        console.log(
          `[IRService] ${(file.size / 1024).toFixed(0)} KB → ` +
            `${(blob.size / 1024).toFixed(0)} KB (saved ${saved}%)`,
        );

        toast.set(`Uploading… (saved ${saved}%)`);

        const fd = new FormData();
        fd.append("file", blob, "photo.webp");
        fd.append("upload_preset", UPLOAD_PRESET);
        fd.append("folder", "instarishta/" + (folder || "posts"));

        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
          { method: "POST", body: fd },
        );
        const json = await res.json();
        if (!res.ok) {
          const msg = json.error?.message || "Upload failed (" + res.status + ")";
          if (msg.includes("preset") || msg.includes("unsigned")) {
            throw new Error(
              "Upload preset '" + UPLOAD_PRESET + "' must be set to Unsigned in " +
              "Cloudinary → Settings → Upload → Upload presets.",
            );
          }
          throw new Error(msg);
        }

        const url = json.secure_url;
        const thumb = url.replace("/upload/", "/upload/w_420,q_auto,f_auto/");
        toast.done("✓ Done — saved " + saved + "%");
        callback({ url, thumb });
      } catch (e) {
        toast.remove();
        console.error("[IRService] Upload error:", e);
        alert("Upload failed: " + e.message);
      }
    };

    input.click();
  }

  function uploadPostImage(callback) {
    uploadImage("posts", callback);
  }
  function uploadStoryImage(callback) {
    uploadImage("stories", callback);
  }
  function uploadCoverImage(callback) {
    uploadImage("covers", callback);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  global.IRService = {
    // channels
    getChannels,
    getChannelBySlug,
    createChannel,
    // posts
    getPosts,
    getRecentPosts,
    createPost,
    deletePost,
    incrementLikes,
    incrementViews,
    // stories
    getStories,
    getAdminStories,
    createStory,
    deleteStory,
    deleteExpiredStories,
    // highlights
    getHighlights,
    createHighlight,
    deleteHighlight,
    // realtime
    subscribeChannel,
    // auth
    signIn,
    signOut,
    getSession,
    // cloudinary
    uploadPostImage,
    uploadStoryImage,
    uploadCoverImage,
    // constants
    POST_PAGE_SIZE,
  };
})(window);
