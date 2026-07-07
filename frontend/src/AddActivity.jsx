import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIdToken } from './authHelpers';
import { API_URL } from './apiConfig';

const categories = ['Food', 'Outdoors', 'Activities', 'Trips'];

const moods = [
  { value: 'loved', label: 'Loved it' },
  { value: 'fine', label: 'It was fine' },
  { value: 'skip', label: "Wouldn't repeat" },
];

function AddActivity() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [notes, setNotes] = useState('');
  const [dateOccurred, setDateOccurred] = useState('');
  const [mood, setMood] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
    }
  }

  async function uploadPhoto(activityId, file) {
    const token = await getIdToken();

    const res = await fetch(
      API_URL + 'activities/' + activityId + '/photo?contentType=' + encodeURIComponent(file.type),
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
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!mood) {
      setError('Please choose how it went');
      return;
    }

    setSubmitting(true);

    try {
      const token = await getIdToken();
      const res = await fetch(API_URL + 'activities', {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, category, notes, dateOccurred, bucket: mood }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Request failed: ' + res.status);
      }

      const created = await res.json();

      if (photoFile) {
        await uploadPhoto(created.id, photoFile);
      }

      navigate('/compare/' + created.id + '/' + mood);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="content">
      <h2>New date</h2>

      {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>What did you do?</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Rooftop ramen night"
            required
          />
        </div>

        <div className="field">
          <label>When?</label>
          <input
            type="date"
            value={dateOccurred}
            onChange={(e) => setDateOccurred(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Category</label>
          <div className="category-row">
            {categories.map((cat) => (
              <div
                key={cat}
                className={`cat-chip ${category === cat ? 'active' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label>How was it?</label>
          <div className="category-row">
            {moods.map((m) => (
              <div
                key={m.value}
                className={`cat-chip ${mood === m.value ? 'active' : ''}`}
                onClick={() => setMood(m.value)}
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Photo (optional)</label>
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
          {photoFile && (
            <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginTop: '6px' }}>
              {photoFile.name} selected
            </p>
          )}
        </div>

        <div className="field">
          <label>Notes (optional)</label>
          <textarea
            rows="3"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you want to remember..."
          />
        </div>

        <button className="btn btn-coral" type="submit" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add date'}
        </button>
      </form>
    </div>
  );
}

export default AddActivity;