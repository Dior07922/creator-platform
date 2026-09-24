import ranjingWelcomeInk from "../assets/ranjing-welcome-ink-v1.png";
import BrandWord from "../components/BrandWord";

export default function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return <div className="ran-welcome-page">
    <img src={ranjingWelcomeInk.src} alt="" aria-hidden="true" className="ran-welcome-ink" />
    <div className="ran-welcome-copy"><h1><BrandWord /></h1><p>山外，还有山。</p></div>
    <button type="button" className="ran-welcome-enter" onClick={onEnter}>进入苒境&nbsp; →</button>
  </div>;
}

