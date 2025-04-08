'use client';

import React, { useState } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../lib/supabase';

export default function AuthUI() {
  const [email, setEmail] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'standard' | 'otp'>('standard');
  
  // Get the current origin for redirects
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        }
      });
      
      if (error) {
        setError(error.message);
      } else {
        setOtpSent(true);
        setMessage('One-time password sent to your email');
      }
    } catch (err) {
      setError('Failed to send OTP. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otp) return;
    
    setLoading(true);
    setError('');
    setMessage('');
    
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      
      if (error) {
        setError(error.message);
      } else {
        setMessage('Login successful! Redirecting...');
        
        // Let the auth context handle navigation instead of direct navigation
        console.log('Authentication successful, letting context handler redirect');
        // The onAuthStateChange listener in SupabaseContext will handle the redirect
      }
    } catch (err) {
      setError('Failed to verify OTP. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleBackToEmail = () => {
    setOtpSent(false);
    setOtp('');
  };
  
  const switchTab = (tab: 'standard' | 'otp') => {
    setActiveTab(tab);
    setMessage('');
    setError('');
  };

  return (
    <div className="auth-container">
      <div className="auth-tabs">
        <button 
          className={`auth-tab-button ${activeTab === 'standard' ? 'active' : ''}`}
          onClick={() => switchTab('standard')}
          type="button"
        >
          Password Login
        </button>
        <button 
          className={`auth-tab-button ${activeTab === 'otp' ? 'active' : ''}`}
          onClick={() => switchTab('otp')}
          type="button"
        >
          OTP Login
        </button>
      </div>
      
      {activeTab === 'otp' ? (
        <div className="auth-options-container">
          {/* OTP Authentication Section */}
          <div className="otp-section">
            <h3>One-Time Password Login</h3>
            
            {message && <div className="auth-message success">{message}</div>}
            {error && <div className="auth-message error">{error}</div>}
            
            {!otpSent ? (
              <form onSubmit={handleSendOTP} className="otp-form">
                <div className="auth-field">
                  <label htmlFor="email-otp">Email</label>
                  <input
                    id="email-otp"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    required
                    disabled={loading}
                  />
                </div>
                <button 
                  type="submit" 
                  className="login-button otp-button"
                  disabled={loading}
                >
                  {loading ? 'Sending...' : 'Send One-Time Password'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOTP} className="otp-form">
                <div className="auth-field">
                  <label htmlFor="otp-code">Enter the code from your email</label>
                  <input
                    id="otp-code"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    required
                    disabled={loading}
                  />
                </div>
                <button 
                  type="submit" 
                  className="login-button otp-verify-button"
                  disabled={loading}
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button 
                  type="button" 
                  className="back-button"
                  onClick={handleBackToEmail}
                  disabled={loading}
                >
                  Back
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* Standard Auth UI */
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: 'var(--primary-color)',
                  brandAccent: 'var(--primary-dark)',
                },
                radii: {
                  borderRadiusButton: '4px',
                  buttonBorderRadius: '4px',
                  inputBorderRadius: '4px',
                },
              },
            },
            className: {
              container: 'supabase-auth-ui',
              button: 'login-button',
              input: 'auth-input',
            },
          }}
          theme="dark"
          providers={[]}
          redirectTo={`${origin}/editor`}
          onlyThirdPartyProviders={false}
        />
      )}
    </div>
  );
} 