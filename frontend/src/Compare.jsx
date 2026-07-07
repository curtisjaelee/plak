import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIdToken } from './authHelpers';
import { API_URL } from './apiConfig';

const moodLabels = {
  loved: 'Loved it',
  fine: 'It was fine',
  skip: "Wouldn't repeat",
};

function Compare() {
  const { activityId, bucket } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newActivity, setNewActivity] = useState(null);
  const [bucketList, setBucketList] = useState([]);
  const [low, setLow] = useState(0);
  const [high, setHigh] = useState(0);
  const [finished, setFinished] = useState(false);
  const [finalRank, setFinalRank] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const token = await getIdToken();

        const [activitiesRes, bucketRes] = await Promise.all([
          fetch(API_URL + 'activities', { headers: { Authorization: token } }),
          fetch(API_URL + 'activities/bucket/' + bucket, { headers: { Authorization: token } }),
        ]);

        if (!activitiesRes.ok || !bucketRes.ok) {
          throw new Error('Failed to load comparison data');
        }

        const allActivities = await activitiesRes.json();
        const found = allActivities.find(function (a) { return String(a.id) === activityId; });
        if (!found) {
          throw new Error('Activity not found');
        }
        setNewActivity(found);

        const list = await bucketRes.json();
        // Exclude the new activity itself if it somehow already has a rank
        const filtered = list.filter(function (a) { return String(a.id) !== activityId; });
        setBucketList(filtered);

        if (filtered.length === 0) {
          // First item in this bucket — no comparisons needed
          await finalizeRank(1);
          return;
        }

        setLow(0);
        setHigh(filtered.length);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function finalizeRank(position) {
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(API_URL + 'activities/bucket-rank', {
        method: 'PUT',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: Number(activityId), bucket, position }),
      });
      if (!res.ok) {
        throw new Error('Failed to save rank: ' + res.status);
      }
      setFinalRank(position);
      setFinished(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  function handleAnswer(newIsBetter) {
    const mid = Math.floor((low + high) / 2);

    if (low >= high) {
      finalizeRank(low + 1);
      return;
    }

    if (newIsBetter) {
      setHigh(mid);
    } else {
      setLow(mid + 1);
    }
  }

  useEffect(() => {
    if (!loading && !finished && bucketList.length > 0 && low >= high) {
      finalizeRank(low + 1);
    }
  }, [low, high]);

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

  if (finished) {
    return (
      <div className="content">
        <div style={{ textAlign: 'center', padding: '30px 0 10px' }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: '64px', fontWeight: 700, color: 'var(--coral)' }}>
            #{finalRank}
          </div>
          <p style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
            in {moodLabels[bucket] || bucket}
          </p>
          <h3 style={{ marginTop: '14px' }}>{newActivity.title} is ranked!</h3>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/home')} style={{ marginTop: '20px' }}>
          Done
        </button>
      </div>
    );
  }

  const mid = Math.floor((low + high) / 2);
  const comparisonItem = bucketList[mid];

  if (!comparisonItem) {
    return (
      <div className="content">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="content compare-wrap">
      <div className="compare-prompt">
        <div className="step">{moodLabels[bucket] || bucket} · finding its rank</div>
        <h2>Which was the <em>better</em> date?</h2>
      </div>

      <div className="journal-pair">
        <div className="journal-card" onClick={() => handleAnswer(true)} style={{ cursor: submitting ? 'default' : 'pointer' }}>
          <div className="emoji-big">📍</div>
          <div className="jname">{newActivity.title}</div>
          <div className="jdate">New</div>
        </div>
        <div className="vs-divider">— versus —</div>
        <div className="journal-card" onClick={() => handleAnswer(false)} style={{ cursor: submitting ? 'default' : 'pointer' }}>
          <div className="tape"></div>
          <div className="emoji-big">📍</div>
          <div className="jname">{comparisonItem.title}</div>
          <div className="jdate">currently #{comparisonItem.rank_position}</div>
        </div>
      </div>
    </div>
  );
}

export default Compare;