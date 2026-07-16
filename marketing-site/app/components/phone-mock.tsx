/**
 * A stylized in-CSS/SVG rendering of the app's Week screen — a stand-in visual
 * until real App Store screenshots are exported and dropped in. Mirrors the
 * app's drain-ring hero, ledger rows, and the §2 real-time spend-alert toast.
 */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <svg className="pm-ring" viewBox="0 0 62 62">
      <circle cx="31" cy="31" r={r} fill="none" stroke="rgba(61,64,91,0.1)" strokeWidth="7" />
      <circle
        cx="31"
        cy="31"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 31 31)"
      />
    </svg>
  );
}

export function PhoneMock() {
  return (
    <div className="hero-visual">
      <div className="phone">
        <div className="phone-screen">
          <div className="phone-notch" />
          <div className="pm-label">This week</div>
          <div className="pm-hero">
            <div>
              <div className="pm-amt">$247.50</div>
              <div className="pm-sub">left to spend · Sun–Sat</div>
            </div>
            <Ring pct={0.66} color="#5E8F77" />
          </div>

          <div className="pm-row">
            <span className="pm-emoji">🛒</span>
            <span>
              <div className="pm-t">Groceries</div>
              <div className="pm-d">Amy · Today</div>
            </span>
            <span className="pm-amt2">−$42.10</span>
          </div>
          <div className="pm-row">
            <span className="pm-emoji" style={{ background: 'rgba(242,204,143,0.35)' }}>
              ☕
            </span>
            <span>
              <div className="pm-t">Coffee</div>
              <div className="pm-d">You · Fun money</div>
            </span>
            <span className="pm-amt2">−$5.75</span>
          </div>

          <div className="pm-toast">
            <span style={{ fontSize: 18 }}>🔔</span>
            <span>
              <b>Amy</b> spent $42.10 on Groceries — $247.50 left this week
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
