import React, { useState } from 'react';
import { auth } from '../../firebase'; // Firebase auth instance
import { signInWithEmailAndPassword } from 'firebase/auth';
import PasswordStrengthIndicator from './PasswordStrengthIndicator'; 
import './Auth.css';

function Signup({ onClose, onSwitchToLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState(''); // Optional
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return setError('Passwords do not match.');
    }
    setError('');
    setLoading(true);
    try {
      // const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // if (displayName) {
      //   await updateProfile(userCredential.user, { displayName });
      // }
      // console.log('Signup successful (placeholder)');
      // onClose(); // Close modal on success

      // Call your backend:
      const response = await fetch('/api/users/register', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to sign up');
      }
      console.log('Signup successful via backend:', data);

      // Step 2: Automatically sign in the user on the client-side
      try {
        await signInWithEmailAndPassword(auth, email, password);
        console.log('Auto-login successful after signup for:', email);
        onClose(); // Close modal on successful auto-login
      } catch (signInError) {
        // If auto-login fails, the user is registered but not logged in.
        // This might happen if Firebase rules are very strict or network issue after backend call.
        console.error('Auto-login after signup failed:', signInError);
        setError('Registered successfully, but auto-login failed. Please log in manually. Error: ' + signInError.message);
        // Don't close modal here, let user see the error, or redirect to login with a message.
        // For now, we'll leave the modal open with the error.
      }

    } catch (err) {
      // This catches errors from the backend registration step
      setError(err.message || 'Failed to create an account.');
      console.error('Signup process error:', err);
    }
    setLoading(false);
  };

  const handleSwitchToLogin = () => {
    onClose(); // Close current modal
    onSwitchToLogin(); // Open login modal
  };

  return (
    <div className="auth-container modal-active">
      <div className="auth-form-wrapper">
        <button onClick={onClose} className="auth-close-button">&times;</button>
        <h2>Sign Up</h2>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="displayName">Display Name (Optional)</label>
            <input type="text" id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <PasswordStrengthIndicator password={password} />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input type="password" id="confirmPassword" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <p className="auth-switch">
          Already have an account? <a href="#" onClick={handleSwitchToLogin} className="auth-switch-link">Login</a>
        </p>
      </div>
    </div>
  );
}

export default Signup;
