import { useNavigate } from "react-router-dom";
import "../styles/theme.css";

function Landing() {
  const navigate = useNavigate();

  return (
    <main className="landing-page">
      <section className="hero-card">
        <div className="live-badge">LIVE COMMERCE ASSISTANT</div>

        <h1 className="hero-title">
          Connect<span>Hive</span> Live
        </h1>

        <p className="hero-subtitle">
          Sell smarter. Capture every order. Support sellers across TikTok,
          Facebook, Instagram and YouTube Live.
        </p>

        <div className="hero-actions">
          <button className="primary-btn" onClick={() => navigate("/signup")}>
            Start Building
          </button>

          <button className="secondary-btn" onClick={() => navigate("/plans")}>
            View Plans
          </button>
        </div>

        <div className="preview-phone">
          <div className="phone-bar"></div>

          <h2>Today’s Live</h2>
          <p>24 orders captured • KES 48,250</p>

          <div className="order-card">
            <span>Grace Wanjiku</span>
            <strong>KES 2,500</strong>
          </div>

          <div className="order-card">
            <span>Brian Mwangi</span>
            <strong>KES 2,800</strong>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Landing;