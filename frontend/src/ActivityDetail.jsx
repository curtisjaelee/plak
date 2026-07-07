import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getIdToken } from './authHelpers';
import { API_URL } from './apiConfig';

function formatDate(dateString) {
  if (!dateString) return null;
  const datePart = dateString.split('T')[0];
  const d = new Date(datePart + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function ActivityDetail() {
  const { id } = useParams();
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  async function fetchActivity() {
    try {
      const token = await getIdToken();
      const res = await fetch(API_URL + 'activities', {
        headers: { Authorization: token },
      });
      if (!res.ok) {
        throw new Error('Request failed: ' + res.status);
      }
      const data = await res.json();
      const found = data.find(function (a) { return String(a.id) === id; });
      if (!found) {
        throw new Error('Activity not found');
      }
      setActivity(found);
      setNotesDraft(found.notes || '');
      setDateDraft(found.date_occurred || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchActivity();
  }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(API_URL + 'activities/' + id, {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notesDraft, dateOccurred: dateDraft || null }),
      });
      if (!res.ok) {
        throw new Error('Failed to save: ' + res.status);
      }
      const updated = await res.json();
      setActivity(function (prev) { return { ...prev, notes: updated.notes, date_occurred: updated.date_occurred }; });
      setEditing(false);
    } catch (err) {
      alert('Could not save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTimesDoneChange(delta) {
    const newCount = activity.times_done + delta;
    if (newCount < 1) return;

    try {
      const token = await getIdToken();
      const res = await fetch(API_URL + 'activities/' + id, {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ timesDone: newCount }),
      });
      if (!res.ok) {
        throw new Error('Failed to update: ' + res.status);
      }
      const updated = await res.json();
      setActivity(function (prev) { return { ...prev, times_done: updated.times_done }; });
    } catch (err) {
      alert('Could not update: ' + err.message);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      handlePhotoUpload(file);
    }
  }

  async function handlePhotoUpload(file) {
    setUploading(true);
    try {
      const token = await getIdToken();

      const res = await fetch(
        API_URL + 'activities/' + id + '/photo?contentType=' + encodeURIComponent(file.type),
        { headers: { Authorization: token } }
      );
      if (!res.ok) {
        throw new Error('Failed to get upload URL');
      }
      const { uploadUrl } = await res.json();

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) {
        throw new Error('Upload to S3 failed: ' + uploadRes.status);
      }

      await fetchActivity();
    } catch (err) {
      alert('Could not upload photo: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="content">
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content">
        <p style={{ color: 'var(--coral)' }}>Error: {error}</p>
        <a href="/home" style={{ color: 'var(--ink)' }}>← Back to your dates</a>
      </div>
    );
  }

  const photos = activity.photos || [];

  return (
    <div className="content">
      <a href="/home" style={{ color: 'var(--ink-soft)', fontSize: '13px', textDecoration: 'none' }}>← Back</a>

      <h2 style={{ marginTop: '16px' }}>{activity.title}</h2>
      <p style={{ color: 'var(--ink-soft)', marginBottom: '4px' }}>{activity.category}</p>
      {formatDate(activity.date_occurred) && !editing && (
        <p style={{ color: 'var(--ink-soft)', fontSize: '13px', marginBottom: '16px' }}>
          {formatDate(activity.date_occurred)}
        </p>
      )}

      {photos.length > 0 && (
        <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', aspectRatio: '4/3', background: 'var(--line)', marginBottom: '8px' }}>
          <img
            src={photos[activeIndex] ? photos[activeIndex].url : photos[0].url}
            alt={activity.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.55)', color: 'white', fontSize: '12px', padding: '2px 8px', borderRadius: '100px' }}>
              {activeIndex + 1} / {photos.length}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '16px' }}>
        {photos.map(function (photo, i) {
          return (
            <img
              key={photo.id}
              src={photo.url}
              alt=""
              onClick={() => setActiveIndex(i)}
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '8px',
                objectFit: 'cover',
                flexShrink: 0,
                cursor: 'pointer',
                border: i === activeIndex ? '2px solid var(--coral)' : '2px solid transparent',
              }}
            />
          );
        })}

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <div
          onClick={() => fileInputRef.current.click()}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '8px',
            background: 'var(--bg-card)',
            border: '1.5px dashed var(--line)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '20px',
            color: 'var(--ink-soft)',
          }}
        >
          {uploading ? '...' : '+'}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
        <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Times done
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => handleTimesDoneChange(-1)}
            disabled={activity.times_done <= 1}
            style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid var(--line)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: '16px' }}
          >
            −
          </button>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: '20px', fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>
            {activity.times_done}
          </span>
          <button
            onClick={() => handleTimesDoneChange(1)}
            style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid var(--line)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: '16px' }}
          >
            +
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Details
        </label>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--coral)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div>
          <div className="field">
            <label>When?</label>
            <input
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea
              rows="4"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1.5px solid var(--line)', fontFamily: 'Inter, sans-serif', fontSize: '15px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-coral" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => {
                setEditing(false);
                setNotesDraft(activity.notes || '');
                setDateDraft(activity.date_occurred || '');
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : activity.notes ? (
        <p style={{ lineHeight: '1.5' }}>{activity.notes}</p>
      ) : (
        <p style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>No notes yet.</p>
      )}
    </div>
  );
}

export default ActivityDetail;