import React, { useState } from 'react';
import { auth } from '../../firebase'; // Import Firebase auth instance
import { signInWithEmailAndPassword } from 'firebase/auth';
import './Auth.css';

function Login({ onClose, onSwitchToSignup }) { 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      console.log('Login successful for:', email);
      onClose();
      console.log('Firebase auth.currentUser after login:', auth.currentUser);
    } catch (err) {
      setError('Failed to log in. Please check your credentials. Error: ' + err.message);
      console.error('Login error:', err);
    }
    setLoading(false);
  };

  const handleSwitchToSignup = () => {
    onClose(); // Close current modal
    onSwitchToSignup(); // Open signup modal
  };

  return (
    <div className="auth-container modal-active">
      <div className="auth-form-wrapper">
        <button onClick={onClose} className="auth-close-button">&times;</button>
        <h2>Login</h2>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="auth-switch">
          Don't have an account? <a href="#" onClick={handleSwitchToSignup} className="auth-switch-link">Sign Up</a>
        </p>
      </div>
    </div>
  );
}

export default Login;
