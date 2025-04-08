'use client';

import React from 'react';
import { useSupabase } from '../context/SupabaseContext';

export default function SessionDebug() {
  const { user, session } = useSupabase();
  
  if (process.env.NODE_ENV !== 'development') return null;
  
  return (
    <div style={{ 
      position: 'fixed', 
      bottom: '10px', 
      right: '10px', 
      padding: '10px', 
      background: '#f0f0f0', 
      border: '1px solid #ccc',
      zIndex: 9999,
      fontSize: '12px',
      maxWidth: '300px',
      wordBreak: 'break-all'
    }}>
      <p><strong>Auth Debug:</strong></p>
      <p>User: {user ? `✅ ${user.id.substring(0, 8)}...` : '❌ None'}</p>
      <p>Session: {session ? '✅ Active' : '❌ None'}</p>
      <p>Email: {user?.email || 'N/A'}</p>
      <p>Last Sign-in: {session?.user?.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString() : 'N/A'}</p>
    </div>
  );
} 