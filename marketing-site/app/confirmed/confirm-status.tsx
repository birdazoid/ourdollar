'use client';

import { useEffect, useState } from 'react';

const APP_SIGN_IN_URL = 'ourdollar://sign-in';

/**
 * Only phones and tablets can have the app. On a computer the ourdollar://
 * link has nowhere to go, and Safari on a Mac shows an "address is invalid"
 * popup for it, which reads as if confirming failed. iPads report a Mac user
 * agent, so they're picked out by touch support instead.
 */
function canOpenApp() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Supabase lands here with the outcome in the URL fragment: tokens when the
 * email was confirmed, or error and error_description when the link was
 * expired or already used. The site has no account features, so it only reads
 * whether there was an error, then clears the fragment so a session token
 * isn't left sitting in the address bar or browser history.
 */
export function ConfirmStatus() {
  const [failed, setFailed] = useState(false);
  // null until the browser is known, so the page doesn't flash the wrong text.
  const [onPhone, setOnPhone] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
    const hasError = params.has('error') || params.has('error_code');
    // Reading the URL is a one-time sync from outside React, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(hasError);
    const phone = canOpenApp();
    setOnPhone(phone);
    if (window.location.hash || window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (hasError || !phone) return;

    // Give the confirmation message time to render before opening the app.
    const timeout = window.setTimeout(() => {
      window.location.assign(APP_SIGN_IN_URL);
    }, 700);
    return () => window.clearTimeout(timeout);
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
      {onPhone === true && (
        <>
          <p className="lead" style={{ margin: '0 auto' }}>
            Opening OurDollar so you can sign in with your email and password.
          </p>
          <a href={APP_SIGN_IN_URL} className="btn btn-primary" style={{ marginTop: 24 }}>
            Open OurDollar
          </a>
          <p style={{ marginTop: 16 }}>
            If the app doesn&rsquo;t open automatically, tap the button above. Make sure OurDollar is
            installed on this device.
          </p>
        </>
      )}
      {onPhone === false && (
        <p className="lead" style={{ margin: '0 auto' }}>
          Open OurDollar on your phone and sign in with your email and password.
        </p>
      )}
    </>
  );
}
