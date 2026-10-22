import IndiaMap from "./IndiaMap";

export default function Integrations() {
  return (
    <section className="integrations dark-section" id="integrations">
      <div className="integration-copy">
        <p className="eyebrow">04 / A LAND OF LIVING STORIES</p>
        <h2>
          Many cultures.
          <br />
          One living heritage.
        </h2>
        <p>
          Every region holds its own world of traditions. Explore the lasting stories and wisdom that shape us. 
        </p>
        <a className="text-link" href="/explore">
          Explore a connected workflow{" "}
          <span className="arrow" aria-hidden={true}>
            ↗
          </span>
        </a>
      </div>
      <div className="integration-graphic">
        <IndiaMap />
      </div>
    </section>
  );
}
