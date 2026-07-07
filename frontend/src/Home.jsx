import { useEffect, useState, useRef } from 'react';
import { getIdToken } from './authHelpers';
import { API_URL } from './apiConfig';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function formatDate(dateString) {
  if (!dateString) return null;
  const datePart = dateString.split('T')[0];
  const d = new Date(datePart + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SortableRankItem({ activity, index, onDelete, onPhotoUpload, uploadingId, dragDisabled }) {
  const sortable = useSortable({ id: activity.id, disabled: dragDisabled });
  const fileInputRef = useRef(null);

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.6 : 1,
  };

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) {
      onPhotoUpload(activity.id, file);
    }
  }

  const metaParts = [activity.category];
  if (formatDate(activity.date_occurred)) {
    metaParts.push(formatDate(activity.date_occurred));
  }
  if (activity.times_done > 1) {
    metaParts.push(activity.times_done + 'x');
  }

  return (
    <div ref={sortable.setNodeRef} style={style} className="rank-item">
      <div
        {...sortable.attributes}
        {...sortable.listeners}
        className="drag-handle"
        style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: dragDisabled ? 'default' : 'grab' }}
      >
        <div className="rank-num">{index + 1}</div>

        {activity.photos && activity.photos.length > 0 ? (
          <img
            src={activity.photos[0].url}
            alt={activity.title}
            style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <div className="thumb">📍</div>
        )}
      </div>

      <div
        className="info"
        onClick={() => { window.location.href = '/activity/' + activity.id; }}
        style={{ cursor: 'pointer', flex: 1 }}
      >
        <div className="name">{activity.title}</div>
        <div className="meta">{metaParts.join(' · ')}</div>
      </div>

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => fileInputRef.current.click()}
        disabled={uploadingId === activity.id}
        style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer', padding: '4px 6px' }}
        aria-label="Add photo"
      >
        {uploadingId === activity.id ? '...' : '📷'}
      </button>

      <button
        onClick={() => onDelete(activity.id)}
        style={{ background: 'transparent', border: 'none', color: 'var(--ink-soft)', fontSize: '18px', cursor: 'pointer', padding: '4px 8px' }}
        aria-label="Delete activity"
      >
        ×
      </button>
    </div>
  );
}

function Home() {
  const [activities, setActivities] = useState([]);
  const [couple, setCouple] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadingId, setUploadingId] = useState(null);
  const [sortBy, setSortBy] = useState('rank');
  const [filterCategory, setFilterCategory] = useState('all');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  async function fetchData() {
    try {
      const token = await getIdToken();

      const [activitiesRes, coupleRes] = await Promise.all([
        fetch(API_URL + 'activities', { headers: { Authorization: token } }),
        fetch(API_URL + 'couple', { headers: { Authorization: token } }),
      ]);

      if (!activitiesRes.ok) {
        throw new Error('Request failed: ' + activitiesRes.status);
      }

      const activitiesData = await activitiesRes.json();
      setActivities(activitiesData);

      if (coupleRes.ok) {
        const coupleData = await coupleRes.json();
        setCouple(coupleData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleDragEnd(event) {
    const active = event.active;
    const over = event.over;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = activities.findIndex(function (i) { return i.id === active.id; });
    const newIndex = activities.findIndex(function (i) { return i.id === over.id; });
    const newOrder = arrayMove(activities, oldIndex, newIndex);

    setActivities(newOrder);

    try {
      const token = await getIdToken();
      await fetch(API_URL + 'activities/reorder', {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: newOrder.map(function (a) { return a.id; }) }),
      });
    } catch (err) {
      console.error('Failed to save order:', err);
    }
  }

  async function handleDelete(activityId) {
    const confirmed = window.confirm('Delete this date? This can\'t be undone.');
    if (!confirmed) return;

    try {
      const token = await getIdToken();
      const res = await fetch(API_URL + 'activities/' + activityId, {
        method: 'DELETE',
        headers: { Authorization: token },
      });

      if (!res.ok) {
        throw new Error('Failed to delete: ' + res.status);
      }

      setActivities(function (items) {
        return items.filter(function (a) { return a.id !== activityId; });
      });
    } catch (err) {
      alert('Could not delete: ' + err.message);
    }
  }

  async function handlePhotoUpload(activityId, file) {
    setUploadingId(activityId);
    try {
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

      await fetchData();
    } catch (err) {
      alert('Could not upload photo: ' + err.message);
    } finally {
      setUploadingId(null);
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
      </div>
    );
  }

  const categories = [];
  activities.forEach(function (a) {
    if (a.category && categories.indexOf(a.category) === -1) {
      categories.push(a.category);
    }
  });

  const filteredActivities = filterCategory === 'all'
    ? activities
    : activities.filter(function (a) { return a.category === filterCategory; });

  let sortedActivities = filteredActivities;

  if (sortBy === 'frequency') {
    sortedActivities = [...filteredActivities].sort(function (a, b) {
      return b.times_done - a.times_done;
    });
  } else if (sortBy === 'date') {
    sortedActivities = [...filteredActivities].sort(function (a, b) {
      if (!a.date_occurred && !b.date_occurred) return 0;
      if (!a.date_occurred) return 1;
      if (!b.date_occurred) return -1;
      return new Date(b.date_occurred) - new Date(a.date_occurred);
    });
  }

  return (
    <div className="content">
      <h2>Your dates</h2>
      <p>{activities.length} dates ranked together</p>

      {couple && Number(couple.member_count) < 2 && (
        <div style={{
          background: 'var(--coral-soft)',
          border: '1.5px dashed var(--coral)',
          borderRadius: '14px',
          padding: '14px 16px',
          margin: '14px 0',
        }}>
          <p style={{ fontWeight: 600, marginBottom: '4px' }}>Invite your partner</p>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '8px' }}>
            Share this code so they can join your couple and see the same list.
          </p>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: '24px', fontWeight: 600, color: 'var(--coral)', letterSpacing: '0.06em' }}>
            {couple.invite_code}
          </div>
        </div>
      )}

      <a href="/add" className="btn btn-coral" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: '16px' }}>
        + Add a date
      </a>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px' }}
        >
          <option value="rank">Sort by: Rank</option>
          <option value="frequency">Sort by: Most frequent</option>
          <option value="date">Sort by: Date</option>
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '10px', border: '1.5px solid var(--line)', fontSize: '13px' }}
        >
          <option value="all">All categories</option>
          {categories.map(function (cat) {
            return <option key={cat} value={cat}>{cat}</option>;
          })}
        </select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedActivities.map(function (a) { return a.id; })} strategy={verticalListSortingStrategy}>
          <div className="rank-list">
            {sortedActivities.map(function (activity, i) {
              return (
                <SortableRankItem
                  key={activity.id}
                  activity={activity}
                  index={i}
                  onDelete={handleDelete}
                  onPhotoUpload={handlePhotoUpload}
                  uploadingId={uploadingId}
                  dragDisabled={sortBy !== 'rank' || filterCategory !== 'all'}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

export default Home;