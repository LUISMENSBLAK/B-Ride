import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5001/api"}/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al iniciar sesión");
      if (data.data?.role !== "ADMIN")
        throw new Error("Acceso denegado. Se requiere rol ADMIN.");
      localStorage.setItem("adminToken", data.data.accessToken);
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        .login-root {
          min-height: 100vh;
          display: flex;
          background: #0D0520;
          font-family: 'DM Sans', sans-serif;
          overflow: hidden;
        }

        /* ── LEFT PANEL ── */
        .left {
          width: 480px;
          min-width: 480px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 60px 56px;
          background: #0D0520;
          position: relative;
          z-index: 2;
        }

        .left::after {
          content: '';
          position: absolute;
          right: 0; top: 0; bottom: 0;
          width: 1px;
          background: linear-gradient(to bottom, transparent, rgba(245,197,24,0.4), rgba(0,212,200,0.3), transparent);
        }

        .logo-wrap {
          width: 100px;
          height: 100px;
          border-radius: 24px;
          overflow: hidden;
          margin-bottom: 28px;
          box-shadow: 0 0 0 1px rgba(245,197,24,0.3), 0 20px 60px rgba(245,197,24,0.15);
          animation: logoGlow 3s ease-in-out infinite alternate;
        }

        @keyframes logoGlow {
          from { box-shadow: 0 0 0 1px rgba(245,197,24,0.3), 0 20px 60px rgba(245,197,24,0.15); }
          to   { box-shadow: 0 0 0 1px rgba(245,197,24,0.6), 0 20px 80px rgba(245,197,24,0.30); }
        }

        .logo-wrap img { width: 100%; height: 100%; object-fit: cover; }

        .brand-name {
          font-family: 'Syne', sans-serif;
          font-size: 28px;
          font-weight: 800;
          color: #fff;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }

        .brand-sub {
          font-size: 13px;
          color: #7B6B9A;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 48px;
        }

        .form-group { width: 100%; margin-bottom: 18px; }

        .form-label {
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: #7B6B9A;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .form-input {
          width: 100%;
          height: 50px;
          background: #1A0A35;
          border: 1px solid rgba(245,197,24,0.15);
          border-radius: 12px;
          padding: 0 18px;
          font-size: 15px;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }

        .form-input::placeholder { color: #3D2E5A; }

        .form-input:focus {
          border-color: rgba(245,197,24,0.5);
          box-shadow: 0 0 0 3px rgba(245,197,24,0.08);
        }

        .error-msg {
          background: rgba(255,87,34,0.1);
          border: 1px solid rgba(255,87,34,0.3);
          border-radius: 10px;
          padding: 12px 16px;
          color: #FF5722;
          font-size: 13px;
          margin-bottom: 18px;
          width: 100%;
        }

        .btn-login {
          width: 100%;
          height: 52px;
          background: #F5C518;
          border: none;
          border-radius: 12px;
          font-family: 'Syne', sans-serif;
          font-size: 15px;
          font-weight: 700;
          color: #0D0520;
          cursor: pointer;
          letter-spacing: 0.02em;
          transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
          margin-top: 6px;
          position: relative;
          overflow: hidden;
        }

        .btn-login:hover:not(:disabled) {
          background: #D4A800;
          box-shadow: 0 8px 32px rgba(245,197,24,0.3);
          transform: translateY(-1px);
        }

        .btn-login:active:not(:disabled) { transform: translateY(0); }

        .btn-login:disabled { opacity: 0.6; cursor: not-allowed; }

        .spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(13,5,32,0.3);
          border-top-color: #0D0520;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
          vertical-align: middle;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── RIGHT PANEL ── */
        .right {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          overflow: hidden;
          background: #080112;
        }

        .right-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 50% at 60% 40%, rgba(83,74,183,0.18) 0%, transparent 70%),
            radial-gradient(ellipse 40% 40% at 80% 70%, rgba(0,212,200,0.08) 0%, transparent 60%),
            radial-gradient(ellipse 50% 60% at 20% 60%, rgba(245,197,24,0.05) 0%, transparent 60%);
        }

        .wixarika-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0.18;
        }

        .right-content {
          position: relative;
          z-index: 2;
          text-align: center;
          padding: 48px;
          max-width: 520px;
        }

        .right-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(245,197,24,0.08);
          border: 1px solid rgba(245,197,24,0.2);
          border-radius: 99px;
          padding: 6px 16px;
          font-size: 11px;
          font-weight: 500;
          color: #F5C518;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 32px;
        }

        .right-eyebrow::before {
          content: '';
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #F5C518;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }

        .right-title {
          font-family: 'Syne', sans-serif;
          font-size: 44px;
          font-weight: 800;
          color: #fff;
          line-height: 1.1;
          letter-spacing: -1px;
          margin-bottom: 20px;
        }

        .right-title span { color: #F5C518; }

        .right-desc {
          font-size: 16px;
          color: #7B6B9A;
          line-height: 1.7;
          margin-bottom: 48px;
        }

        .stats {
          display: flex;
          gap: 32px;
          justify-content: center;
        }

        .stat {
          text-align: center;
        }

        .stat-num {
          font-family: 'Syne', sans-serif;
          font-size: 28px;
          font-weight: 800;
          color: #F5C518;
          display: block;
        }

        .stat-label {
          font-size: 11px;
          color: #7B6B9A;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .stat-divider {
          width: 1px;
          background: rgba(245,197,24,0.15);
          align-self: stretch;
        }

        .bottom-text {
          position: absolute;
          bottom: 32px;
          font-size: 12px;
          color: #3D2E5A;
          letter-spacing: 0.06em;
        }

        @media (max-width: 900px) {
          .right { display: none; }
          .left { width: 100%; min-width: unset; }
        }
      `}</style>

      <div className="login-root">
        {/* LEFT */}
        <div className="left">
          <div className="logo-wrap">
            <img src="/ride.png" alt="B-Ride" />
          </div>
          <div className="brand-name">B-Ride Admin</div>
          <div className="brand-sub">Panel de Operaciones</div>

          <form onSubmit={handleSubmit} style={{ width: "100%" }}>
            <div className="form-group">
              <label className="form-label">Correo electrónico</label>
              <input
                className="form-input"
                type="email"
                placeholder="admin@bride.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                className="form-input"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button className="btn-login" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : "Iniciar sesión"}
            </button>
          </form>

          <div className="bottom-text">B-Ride · Nayarit, México</div>
        </div>

        {/* RIGHT */}
        <div className="right">
          <div className="right-bg" />

          <svg className="wixarika-svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="diamond" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
                <polygon points="40,4 76,40 40,76 4,40" fill="none" stroke="rgba(245,197,24,0.6)" strokeWidth="0.8"/>
                <polygon points="40,16 64,40 40,64 16,40" fill="none" stroke="rgba(0,212,200,0.4)" strokeWidth="0.5"/>
                <circle cx="40" cy="40" r="3" fill="rgba(245,197,24,0.5)"/>
                <circle cx="40" cy="4" r="2" fill="rgba(0,212,200,0.4)"/>
                <circle cx="76" cy="40" r="2" fill="rgba(0,212,200,0.4)"/>
                <circle cx="40" cy="76" r="2" fill="rgba(0,212,200,0.4)"/>
                <circle cx="4" cy="40" r="2" fill="rgba(0,212,200,0.4)"/>
              </pattern>
              <pattern id="cross" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <line x1="20" y1="0" x2="20" y2="40" stroke="rgba(255,87,34,0.15)" strokeWidth="0.5"/>
                <line x1="0" y1="20" x2="40" y2="20" stroke="rgba(255,87,34,0.15)" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="800" height="600" fill="url(#cross)"/>
            <rect width="800" height="600" fill="url(#diamond)"/>
            <polygon points="400,60 500,160 400,260 300,160" fill="none" stroke="rgba(245,197,24,0.25)" strokeWidth="1.5"/>
            <polygon points="400,80 480,160 400,240 320,160" fill="none" stroke="rgba(0,212,200,0.2)" strokeWidth="1"/>
            <polygon points="600,300 700,400 600,500 500,400" fill="none" stroke="rgba(245,197,24,0.15)" strokeWidth="1"/>
            <polygon points="100,350 180,430 100,510 20,430" fill="none" stroke="rgba(245,197,24,0.15)" strokeWidth="1"/>
          </svg>

          <div className="right-content">
            <div className="right-eyebrow">Sistema activo</div>
            <h1 className="right-title">
              Centro de<br />control <span>B-Ride</span>
            </h1>
            <p className="right-desc">
              Gestiona conductores, supervisa operaciones<br />
              y mantén la plataforma funcionando.
            </p>
            <div className="stats">
              <div className="stat">
                <span className="stat-num">24/7</span>
                <span className="stat-label">Operación</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-num">100%</span>
                <span className="stat-label">Wixárika</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-num">MX</span>
                <span className="stat-label">Nayarit</span>
              </div>
            </div>
          </div>

          <div className="bottom-text">Acceso exclusivo para operadores autorizados</div>
        </div>
      </div>
    </>
  );
}
