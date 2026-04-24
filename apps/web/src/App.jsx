import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase.js";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:4000";
const workspaceTabs = ["upload", "gallery", "people"];
const requestTimeoutMs = 12000;

function formatAppError(error) {
  const raw = error?.message || String(error || "");

  if (raw.includes("This operation was aborted")) {
    return "The request took too long. The local API may still be starting up. Try the sync again.";
  }

  if (raw.includes("auth/configuration-not-found")) {
    return "Firebase Authentication is not configured for this project yet. In Firebase Console, open Authentication, click Get started, and enable Email/Password sign-in.";
  }

  if (raw.includes("auth/email-already-in-use")) {
    return "That email is already registered. Try signing in instead.";
  }

  if (raw.includes("auth/invalid-credential")) {
    return "The email or password looks incorrect.";
  }

  if (raw.includes("auth/weak-password")) {
    return "Use a stronger password with at least 6 characters.";
  }

  if (raw.includes("auth/invalid-api-key")) {
    return "The Firebase web config looks invalid. Recheck the API key in your Vite env file.";
  }

  return raw.replace(/^Firebase:\s*/i, "");
}

async function parseJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || payload.error || "Request failed");
  }
  return payload;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return await parseJson(response);
  } finally {
    clearTimeout(timeout);
  }
}

async function syncSession(user) {
  const firebaseIdToken = await user.getIdToken();
  const payload = await fetchJson(`${apiBaseUrl}/api/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ firebaseIdToken }),
  });
  return { firebaseIdToken, appUser: payload.user };
}

export default function App() {
  const [activeTab, setActiveTab] = useState("auth");
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [appUser, setAppUser] = useState(null);
  const [sessionToken, setSessionToken] = useState("");
  const [status, setStatus] = useState("Waiting for sign-in.");
  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadMessage, setUploadMessage] = useState("Choose one or more images to start the upload flow.");
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [people, setPeople] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [reclustering, setReclustering] = useState(false);
  const [sessionSyncing, setSessionSyncing] = useState(false);
  const [clusterDrafts, setClusterDrafts] = useState({});
  const [selectedClusterPhotos, setSelectedClusterPhotos] = useState([]);
  const [selectedClusterId, setSelectedClusterId] = useState("");

  async function syncCurrentUser(user) {
    setSessionSyncing(true);
    setStatus("Syncing your Firebase session with the backend...");

    try {
      const session = await syncSession(user);
      setAppUser(session.appUser);
      setSessionToken(session.firebaseIdToken);
      setStatus("Signed in and linked to Supabase PostgreSQL.");
      setError("");
      setActiveTab("upload");
    } catch (syncError) {
      setAppUser(null);
      setSessionToken("");
      setError(formatAppError(syncError));
      setStatus("Firebase sign-in worked, but workspace sync failed.");
    } finally {
      setSessionSyncing(false);
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      if (!user) {
        setAppUser(null);
        setSessionToken("");
        setStatus("Waiting for sign-in.");
        setPhotos([]);
        setPeople([]);
        setActiveTab("upload");
        return;
      }

      await syncCurrentUser(user);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    if (activeTab === "gallery") {
      void loadGallery();
    }
    if (activeTab === "people") {
      void loadPeople();
    }
  }, [activeTab, sessionToken]);

  useEffect(() => {
    setError("");
  }, [activeTab]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setStatus(mode === "login" ? "Signing you in..." : "Creating your account...");

    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          form.email,
          form.password,
        );

        if (form.name.trim()) {
          await updateProfile(credential.user, { displayName: form.name.trim() });
        }
      } else {
        await signInWithEmailAndPassword(auth, form.email, form.password);
      }
    } catch (submitError) {
      setError(formatAppError(submitError));
      setStatus("Authentication needs a quick fix.");
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    setError("");
    setActiveTab("upload");
  }

  async function handleRetrySessionSync() {
    if (!firebaseUser) return;
    await syncCurrentUser(firebaseUser);
  }

  async function loadGallery() {
    if (!sessionToken) return;
    setGalleryLoading(true);

    try {
      const payload = await fetchJson(`${apiBaseUrl}/api/photos`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      setPhotos(payload.photos || []);
      setError("");
    } catch (fetchError) {
      setError(formatAppError(fetchError));
    } finally {
      setGalleryLoading(false);
    }
  }

  async function loadPeople() {
    if (!sessionToken) return;
    setPeopleLoading(true);

    try {
      const payload = await fetchJson(`${apiBaseUrl}/api/people`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      setPeople(payload.people || []);
      setError("");
    } catch (fetchError) {
      setError(formatAppError(fetchError));
    } finally {
      setPeopleLoading(false);
    }
  }

  async function loadClusterPhotos(clusterId) {
    if (!sessionToken) return;

    try {
      const payload = await fetchJson(`${apiBaseUrl}/api/people/${clusterId}/photos`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      setSelectedClusterPhotos(payload.photos || []);
      setSelectedClusterId(clusterId);
      setError("");
    } catch (fetchError) {
      setError(formatAppError(fetchError));
    }
  }

  async function handleReclusterPeople() {
    if (!sessionToken) return;

    setReclustering(true);
    setError("");
    setStatus("Rebuilding people albums from current photo embeddings...");

    try {
      const payload = await fetchJson(`${apiBaseUrl}/api/people/recluster`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      await Promise.all([loadGallery(), loadPeople()]);
      setSelectedClusterPhotos([]);
      setSelectedClusterId("");
      setStatus(payload.message || "People albums rebuilt.");
    } catch (reclusterError) {
      setError(formatAppError(reclusterError));
      setStatus("People album rebuild needs attention.");
    } finally {
      setReclustering(false);
    }
  }

  async function handleRenameCluster(clusterId) {
    const displayName = (clusterDrafts[clusterId] || "").trim();
    if (!displayName || !sessionToken) return;

    try {
      await fetchJson(`${apiBaseUrl}/api/people/${clusterId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ displayName }),
      });
      await loadPeople();
      setError("");
    } catch (renameError) {
      setError(formatAppError(renameError));
    }
  }

  async function handleDeletePhoto(photoId) {
    if (!sessionToken) return;

    try {
      await fetchJson(`${apiBaseUrl}/api/photos/${photoId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      await Promise.all([loadGallery(), loadPeople()]);
      setError("");
    } catch (deleteError) {
      setError(formatAppError(deleteError));
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!selectedFiles.length || !sessionToken) {
      setUploadMessage("Please sign in and choose one or more images first.");
      return;
    }

    setUploading(true);
    setError("");
    setUploadMessage(`Preparing ${selectedFiles.length} photo(s) for upload...`);

    try {
      let totalFaces = 0;

      for (const [index, selectedFile] of selectedFiles.entries()) {
        setUploadMessage(
          `Uploading ${index + 1} of ${selectedFiles.length}: ${selectedFile.name}`,
        );

        const uploadInit = await fetchJson(`${apiBaseUrl}/api/photos/upload`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            fileName: selectedFile.name,
            contentType: selectedFile.type || "image/jpeg",
          }),
        });

        const storageResponse = await fetch(uploadInit.signedUrl, {
          method: "PUT",
          headers: {
            "content-type": selectedFile.type || "image/jpeg",
          },
          body: selectedFile,
        });

        if (!storageResponse.ok) {
          throw new Error(`Storage upload failed for ${selectedFile.name}`);
        }

        setUploadMessage(
          `Processing ${index + 1} of ${selectedFiles.length}: ${selectedFile.name}`,
        );
        const completePayload = await fetchJson(`${apiBaseUrl}/api/photos/complete`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            objectPath: uploadInit.objectPath,
            contentType: selectedFile.type || "image/jpeg",
            fileSizeBytes: selectedFile.size,
          }),
        });

        totalFaces += completePayload.faceCount || 0;
      }

      setUploadMessage(
        `Batch finished. ${selectedFiles.length} photo(s) uploaded and ${totalFaces} face(s) processed.`,
      );
      setSelectedFiles([]);
      await Promise.all([loadGallery(), loadPeople()]);
      setActiveTab("gallery");
    } catch (uploadError) {
      setUploadMessage(formatAppError(uploadError));
    } finally {
      setUploading(false);
    }
  }

  const isAuthenticated = Boolean(firebaseUser && sessionToken);

  if (!isAuthenticated) {
    return (
      <main className="auth-screen">
        <section className="auth-hero">
          <div className="auth-hero-copy">
            <p className="eyebrow">Smart Photo Cloud</p>
            <h1>Turn raw photos into organized people albums.</h1>
            <p className="lede auth-lede">
              Sign in to open the workspace for uploads, gallery review, and clustered face albums.
            </p>
          </div>

          <div className="auth-value-list">
            <div className="auth-value-card">
              <span className="label">Flow</span>
              <strong>Upload, process, cluster</strong>
              <p>One clean pipeline from storage to searchable people albums.</p>
            </div>
            <div className="auth-value-card">
              <span className="label">Detection</span>
              <strong>MTCNN face extraction</strong>
              <p>Faces are detected before embeddings are created for clustering.</p>
            </div>
            <div className="auth-value-card">
              <span className="label">Workspace</span>
              <strong>Separate product views</strong>
              <p>Authentication stays isolated from the main gallery and people experience.</p>
            </div>
          </div>
        </section>

        <section className="auth-stage">
          <article className="panel auth-stage-panel">
            <div className="auth-stage-header">
              <div>
                <p className="section-kicker">Account Access</p>
                <h2>{mode === "login" ? "Welcome back" : "Create your workspace account"}</h2>
              </div>

              <div className="mode-switch">
                <button
                  className={mode === "login" ? "active" : ""}
                  onClick={() => setMode("login")}
                  type="button"
                >
                  Login
                </button>
                <button
                  className={mode === "register" ? "active" : ""}
                  onClick={() => setMode("register")}
                  type="button"
                >
                  Register
                </button>
              </div>
            </div>

            {error ? (
              <div className="banner error">
                <strong>Authentication issue</strong>
                <span>{error}</span>
              </div>
            ) : null}

            <div className="auth-stage-grid">
              <form className="auth-form auth-form-card" onSubmit={handleSubmit}>
                {mode === "register" ? (
                  <label>
                    Name
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      placeholder="Japmanpreet Singh"
                    />
                  </label>
                ) : null}

                <label>
                  Email
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="you@example.com"
                    required
                  />
                </label>

                <label>
                  Password
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="Minimum 6 characters"
                    required
                  />
                </label>

                <button className="primary-button" type="submit">
                  {mode === "login" ? "Enter Workspace" : "Create Account"}
                </button>
              </form>

              <div className="auth-info-stack">
                <article className="session-card auth-session-card">
                  <h3>Session Preview</h3>
                  <p>
                    <span className="label">Status</span>
                    <strong>{status}</strong>
                  </p>
                  <p>
                    <span className="label">Firebase user</span>
                    <strong>{firebaseUser?.email || "Not signed in"}</strong>
                  </p>
                  <p>
                    <span className="label">Workspace link</span>
                    <strong>{appUser?.id || "Awaiting backend sync"}</strong>
                  </p>
                  {firebaseUser && !sessionToken ? (
                    <button
                      className="secondary-button"
                      onClick={() => void handleRetrySessionSync()}
                      type="button"
                      disabled={sessionSyncing}
                    >
                      {sessionSyncing ? "Syncing..." : "Retry Workspace Sync"}
                    </button>
                  ) : null}
                </article>

                <article className="auth-help auth-help-card">
                  <h4>Firebase Fix</h4>
                  <p>
                    If you still see a configuration error, open Firebase Console, go to
                    Authentication, click <strong>Get started</strong>, then enable
                    <strong> Email/Password</strong>.
                  </p>
                </article>
              </div>
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Smart Photo Cloud</p>
          <h1>Smart photo cloud workspace.</h1>
          <p className="lede">Authentication, upload, gallery, and people albums in one place.</p>
        </div>

        <nav className="tab-rail" aria-label="Application views">
          {workspaceTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-button ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              <span className="tab-title">
                {tab === "upload" && "Upload"}
                {tab === "gallery" && "Gallery"}
                {tab === "people" && "People"}
              </span>
              <span className="tab-caption">
                {tab === "upload" && "Send photos into AI processing"}
                {tab === "gallery" && "Browse uploaded images"}
                {tab === "people" && "Review clustered faces"}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <div className="mini-stat">
            <span className="label">Status</span>
            <strong>{status}</strong>
          </div>
          <div className="mini-stat">
            <span className="label">Signed in</span>
            <strong>{firebaseUser?.email || "No active user"}</strong>
          </div>
          <div className="mini-stat">
            <span className="label">Workspace</span>
            <strong>{appUser?.id ? "Backend linked" : "Awaiting session sync"}</strong>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="section-kicker">Current Interface</p>
            <h2>
              {activeTab === "upload" && "Upload Pipeline"}
              {activeTab === "gallery" && "Gallery"}
              {activeTab === "people" && "People Albums"}
            </h2>
          </div>

          <div className="topbar-actions">
            <div className="pill">
              <span className="label">Photos</span>
              <strong>{photos.length}</strong>
            </div>
            <div className="pill">
              <span className="label">People</span>
              <strong>{people.length}</strong>
            </div>
            {isAuthenticated ? (
              <button className="secondary-button" onClick={handleSignOut} type="button">
                Sign Out
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="banner error">
            <strong>Setup issue</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {activeTab === "upload" ? (
          <section className="panel-grid">
            <article className="panel">
              <h3>Upload Console</h3>
              <p className="panel-copy">
                Push a photo into storage, trigger the AI service, and automatically populate
                gallery and people-album records.
              </p>

              <form className="upload-form" onSubmit={handleUpload}>
                <label className="file-picker">
                  <span>Choose photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))}
                    disabled={!isAuthenticated || uploading}
                  />
                </label>

                <div className="upload-meta">
                  <div className="mini-stat">
                    <span className="label">Files</span>
                    <strong>
                      {selectedFiles.length ? `${selectedFiles.length} selected` : "No files selected"}
                    </strong>
                  </div>
                  <div className="mini-stat">
                    <span className="label">Total size</span>
                    <strong>
                      {selectedFiles.length
                        ? `${Math.round(selectedFiles.reduce((total, file) => total + file.size, 0) / 1024)} KB`
                        : "N/A"}
                    </strong>
                  </div>
                </div>

                <button className="primary-button" type="submit" disabled={!isAuthenticated || uploading}>
                  {uploading ? "Processing..." : "Upload Batch"}
                </button>
              </form>

              <div className="banner neutral">{uploadMessage}</div>
            </article>

            <article className="panel">
              <h3>Pipeline</h3>
              <ol className="timeline-list">
                <li>Request a signed Supabase Storage upload URL.</li>
                <li>Upload the file directly from the browser.</li>
                <li>Confirm upload completion with the API.</li>
                <li>Run AI face detection and ResNet embeddings.</li>
                <li>Persist faces and assign clusters.</li>
              </ol>
            </article>
          </section>
        ) : null}

        {activeTab === "gallery" ? (
          <section className="panel">
            <div className="section-row">
              <div>
                <h3>Gallery View</h3>
                <p className="panel-copy">Your processed photo library appears here.</p>
              </div>
              <button className="secondary-button" onClick={() => void loadGallery()} type="button">
                Refresh
              </button>
            </div>

            {galleryLoading ? <div className="banner neutral">Loading gallery...</div> : null}

            <div className="gallery-grid">
              {photos.length ? (
                photos.map((photo) => (
                  <article className="gallery-card" key={photo.id}>
                    <div className="gallery-image-wrap">
                      <img src={photo.thumbnail_url || photo.file_url} alt={photo.storage_key} />
                    </div>
                    <div className="gallery-card-body">
                      <strong>{photo.file_type || "image"}</strong>
                      <span>{photo.upload_status}</span>
                      <button
                        className="secondary-button compact-button"
                        onClick={() => void handleDeletePhoto(photo.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">No photos yet. Upload one from the Upload tab.</div>
              )}
            </div>
          </section>
        ) : null}

        {activeTab === "people" ? (
          <section className="panel">
            <div className="section-row">
              <div>
                <h3>People Albums</h3>
                <p className="panel-copy">
                  Face clusters generated from the AI processing pipeline appear here.
                </p>
              </div>
              <button className="secondary-button" onClick={() => void loadPeople()} type="button">
                Refresh
              </button>
              <button
                className="primary-button"
                onClick={() => void handleReclusterPeople()}
                type="button"
                disabled={reclustering}
              >
                {reclustering ? "Rebuilding..." : "Rebuild Albums"}
              </button>
            </div>

            {peopleLoading ? <div className="banner neutral">Loading people albums...</div> : null}

            <div className="people-grid">
              {people.length ? (
                people.map((person) => (
                  <article className="person-card" key={person.id}>
                    <div className="person-avatar">
                      {person.representative_thumbnail_url ? (
                          <img
                            src={person.representative_thumbnail_url}
                            alt={person.display_name || "Unnamed cluster"}
                        />
                      ) : (
                        <span>{(person.display_name || "P").slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="person-body">
                      <strong>{person.display_name || "Unnamed person"}</strong>
                      <span>{person.face_count} linked face(s)</span>
                      <div className="person-actions">
                        <input
                          type="text"
                          value={clusterDrafts[person.id] ?? person.display_name ?? ""}
                          onChange={(event) =>
                            setClusterDrafts((current) => ({
                              ...current,
                              [person.id]: event.target.value,
                            }))
                          }
                          placeholder="Rename person"
                        />
                        <div className="person-action-row">
                          <button
                            className="secondary-button compact-button"
                            onClick={() => void handleRenameCluster(person.id)}
                            type="button"
                          >
                            Save Name
                          </button>
                          <button
                            className="secondary-button compact-button"
                            onClick={() => void loadClusterPhotos(person.id)}
                            type="button"
                          >
                            View Photos
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">No people albums yet. Process a photo first.</div>
              )}
            </div>

            {selectedClusterId ? (
              <div className="cluster-detail">
                <div className="section-row">
                  <div>
                    <h3>Cluster Photos</h3>
                    <p className="panel-copy">Photos linked to the selected person cluster.</p>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setSelectedClusterId("");
                      setSelectedClusterPhotos([]);
                    }}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                <div className="gallery-grid">
                  {selectedClusterPhotos.length ? (
                    selectedClusterPhotos.map((photo) => (
                      <article className="gallery-card" key={photo.id}>
                        <div className="gallery-image-wrap">
                          <img src={photo.thumbnail_url || photo.file_url} alt={photo.id} />
                        </div>
                        <div className="gallery-card-body">
                          <strong>{photo.file_type || "image"}</strong>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state">No photos returned for this cluster yet.</div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
