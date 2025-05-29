import React from 'react';
import './Auth.css'; // Assuming styles will be in Auth.css

const PasswordStrengthIndicator = ({ password }) => {
  const getStrength = () => {
    let score = 0;
    if (!password) return score;

    // Add points for length
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Add points for variety
    if (/[a-z]/.test(password)) score++; // Lowercase
    if (/[A-Z]/.test(password)) score++; // Uppercase
    if (/[0-9]/.test(password)) score++; // Numbers
    if (/[^a-zA-Z0-9]/.test(password)) score++; // Special characters

    return Math.min(score, 5); // Max score of 5 for 5 levels
  };

  const strength = getStrength();
  const strengthLevels = [
    { label: 'Very Weak', color: '#dc3545' },
    { label: 'Weak', color: '#fd7e14' },
    { label: 'Medium', color: '#ffc107' },
    { label: 'Strong', color: '#20c997' },
    { label: 'Very Strong', color: '#198754' },
  ];

  if (!password) return null;

  return (
    <div className="password-strength-meter">
      <div className="password-strength-meter-bar-container">
        {strengthLevels.map((level, index) => (
          <div
            key={level.label}
            className={`password-strength-meter-segment ${strength > index ? 'filled' : ''}`}
            style={{ backgroundColor: strength > index ? strengthLevels[strength -1].color : '#e9ecef' }}
          />
        ))}
      </div>
      {password.length > 0 && (
         <p className="password-strength-meter-label" style={{ color: strengthLevels[strength > 0 ? strength -1 : 0].color }}>
           Strength: {strengthLevels[strength > 0 ? strength -1 : 0].label}
         </p>
      )}
    </div>
  );
};

export default PasswordStrengthIndicator;
