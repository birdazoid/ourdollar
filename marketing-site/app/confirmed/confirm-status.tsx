'use client';

import { useEffect, useState } from 'react';

/**
 * Supabase lands here with the outcome in the URL fragment: tokens when the
 * email was confirmed, or error and error_description when the link was
 * expired or already used. The site has no account features, so it only reads
 * whether there was an error, then clears the fragment so a session token
 * isn't left sitting in the address bar or browser history.
 */
export function ConfirmStatus() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    // Reading the URL is a one-time sync from outside React, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(params.has('error') || params.has('error_code'));
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  if (failed) {
    return (
      <>
        <p className="eyebrow">Link expired</p>
        <h2 style={{ marginBottom: 14 }}>That confirmation link didn&rsquo;t work</h2>
        <p className="lead" style={{ margin: '0 auto' }}>
          Links only work once and expire after a while. Open OurDollar and sign in with your email
          and password. If your email still isn&rsquo;t confirmed, the app will let you send a new
          link.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow">You&rsquo;re all set</p>
      <h2 style={{ marginBottom: 14 }}>Your email is confirmed</h2>
      <p className="lead" style={{ margin: '0 auto' }}>
        Go back to the OurDollar app and sign in with your email and password.
      </p>
    </>
  );
}
