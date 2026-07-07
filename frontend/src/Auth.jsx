import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signUp, confirmSignUp, login } from './authHelpers';

function Auth() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'confirm'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [inviteCode, setInviteCode] = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/home');
    } catch (err) {
      setError(err.message);
    }
  }

    async function handleSignup(e) {
    e.preventDefault();
    setError('');
    try {
        await signUp(email, password, name, inviteCode);
        setMode('confirm');
    } catch (err) {
        setError(err.message);
    }
    }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    try {
      await confirmSignUp(email, code);
      setMode('login');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="content">
      <h2>{mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Check your email'}</h2>

      {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}

      {mode === 'login' && (
        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn btn-coral" type="submit">Log in</button>
          <p>No account? <a onClick={() => setMode('signup')}>Sign up</a></p>
        </form>
      )}

      {mode === 'signup' && (
        <form onSubmit={handleSignup}>
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="field">
            <label>Invite code (optional)</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="e.g. CF6E37"
            />
          </div>
          <button className="btn btn-coral" type="submit">Sign up</button>
        </form>
      )}

      {mode === 'confirm' && (
        <form onSubmit={handleConfirm}>
          <p>We sent a code to {email}</p>
          <div className="field">
            <label>Verification code</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <button className="btn btn-coral" type="submit">Confirm</button>
        </form>
      )}
    </div>
  );
}

export default Auth;