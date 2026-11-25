import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/chatApi';
import './AuthPanel.css';

/**
 * AuthPanel Component
 * Provides Sign In (SimpleJWT /api/token/) and Create Account (/api/accounts/register/)
 * tabs matching the GeoChat dark theme, with clear validation and token management.
 */
export const AuthPanel = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState(null);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setFieldErrors({});
    setSuccessMsg(null);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await loginUser({ email: cleanEmail, password });
      setPassword('');
      setConfirmPassword('');
      onAuthSuccess?.({
        access: result.access,
        refresh: result.refresh,
      });
    } catch (err) {
      setErrorMsg(err.message || 'Sign in failed. Please check your credentials.');
      if (err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setFieldErrors({});
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    const cleanMobile = mobileNumber.trim();

    if (!cleanEmail) {
      setErrorMsg('Email address is required.');
      return;
    }
    if (!cleanMobile) {
      setErrorMsg('Mobile number is required.');
      return;
    }
    if (cleanMobile.length > 15) {
      setErrorMsg('Mobile number must be 15 characters or fewer.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerUser({
        email: cleanEmail,
        mobile_number: cleanMobile,
        password,
      });

      if (result.hasTokens && result.access) {
        setPassword('');
        setConfirmPassword('');
        onAuthSuccess?.({
          access: result.access,
          refresh: result.refresh,
          user: result.user,
        });
      } else {
        const assignedHandle = result.user?.handle;
        setMode('login');
        setEmail(result.user?.email || cleanEmail);
        setPassword('');
        setConfirmPassword('');
        setSuccessMsg(
          assignedHandle
            ? `Account created! Your anonymous handle is ${assignedHandle}. Sign in below to populate your JWT access token.`
            : 'Account created! Sign in below to populate your JWT access token.'
        );
      }
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed. Please check your details.');
      if (err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-view">
      <section className="auth-card" aria-labelledby="auth-card-heading">
        <div className="auth-card__header">
          <div className="auth-card__brand">
            <div className="auth-card__icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h2 id="auth-card-heading" className="auth-card__title">
                Welcome to GeoChat
              </h2>
              <p className="auth-card__subtitle">
                Sign in or create an account to join nearby geo-rooms and chat in real time.
              </p>
            </div>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="auth-tabs" role="tablist" aria-label="Authentication Mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => switchMode('login')}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'auth-tab--active' : ''}`}
            onClick={() => switchMode('register')}
          >
            Create Account
          </button>
        </div>

        {/* Feedback Banners */}
        {successMsg && (
          <div className="auth-alert auth-alert--success" role="status">
            {successMsg}
          </div>
        )}

        {errorMsg && (
          <div className="auth-alert auth-alert--error" role="alert">
            {errorMsg}
          </div>
        )}

        {/* Sign In Form */}
        {mode === 'login' ? (
          <form className="auth-form" onSubmit={handleLoginSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="auth-login-email" className="auth-field__label">
                Email Address
              </label>
              <input
                id="auth-login-email"
                type="email"
                className="auth-field__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isSubmitting}
                required
              />
              {fieldErrors.email && (
                <span className="auth-field__error">{fieldErrors.email}</span>
              )}
            </div>

            <div className="auth-field">
              <div className="auth-field__label-row">
                <label htmlFor="auth-login-password" className="auth-field__label">
                  Password
                </label>
                <button
                  type="button"
                  className="auth-text-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="auth-login-password"
                type={showPassword ? 'text' : 'password'}
                className="auth-field__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isSubmitting}
                required
              />
              {fieldErrors.password && (
                <span className="auth-field__error">{fieldErrors.password}</span>
              )}
            </div>

            <button
              type="submit"
              className="auth-btn auth-btn--primary auth-btn--full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing In...' : 'Sign In & Continue'}
            </button>

            <p className="auth-form__footer">
              New to GeoChat?{' '}
              <button
                type="button"
                className="auth-text-btn"
                onClick={() => switchMode('register')}
              >
                Create an account
              </button>
            </p>
          </form>
        ) : (
          /* Create Account Form */
          <form className="auth-form" onSubmit={handleRegisterSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="auth-register-email" className="auth-field__label">
                Email Address
              </label>
              <input
                id="auth-register-email"
                type="email"
                className="auth-field__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isSubmitting}
                required
              />
              {fieldErrors.email && (
                <span className="auth-field__error">{fieldErrors.email}</span>
              )}
            </div>

            <div className="auth-field">
              <label htmlFor="auth-register-mobile" className="auth-field__label">
                Mobile Number
              </label>
              <input
                id="auth-register-mobile"
                type="tel"
                className="auth-field__input"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="9876543210"
                maxLength={15}
                autoComplete="tel"
                disabled={isSubmitting}
                required
              />
              {fieldErrors.mobile_number && (
                <span className="auth-field__error">{fieldErrors.mobile_number}</span>
              )}
            </div>

            <div className="auth-field-grid">
              <div className="auth-field">
                <div className="auth-field__label-row">
                  <label htmlFor="auth-register-password" className="auth-field__label">
                    Password
                  </label>
                  <button
                    type="button"
                    className="auth-text-btn"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="auth-register-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-field__input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  required
                />
                {fieldErrors.password && (
                  <span className="auth-field__error">{fieldErrors.password}</span>
                )}
              </div>

              <div className="auth-field">
                <label htmlFor="auth-register-confirm" className="auth-field__label">
                  Confirm Password
                </label>
                <input
                  id="auth-register-confirm"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-field__input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <p className="auth-handle-note">
              An anonymous chat handle (e.g. <code>SilentFalcon_42</code>) is automatically assigned on registration.
            </p>

            <button
              type="submit"
              className="auth-btn auth-btn--primary auth-btn--full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>

            <p className="auth-form__footer">
              Already have an account?{' '}
              <button
                type="button"
                className="auth-text-btn"
                onClick={() => switchMode('login')}
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </section>
    </div>
  );
};

export default AuthPanel;
