import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../lib/api';

export function AppFooter() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__col">
          <p className="footer__heading">TickTracker UK</p>
          <p>
            A prototype tick sighting tracker built for the Elanco placement
            programme technical task, by Mirzo-Ulugbek Fazilov.
          </p>
          <p>
            Sighting data from the{' '}
            <a href={API_BASE_URL} target="_blank" rel="noopener noreferrer">
              Elanco Tick Sightings API
            </a>
            . Map tiles &copy;{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenStreetMap
            </a>{' '}
            contributors.
          </p>
        </div>

        <div className="footer__col">
          <p className="footer__heading">Important</p>
          <p>
            Risk ratings shown in this app are <strong>modelled by the app</strong>,
            not supplied by the API, which carries no severity field. Guidance
            here is general public-health information and not veterinary or
            medical advice.
          </p>
          <p>
            <Link to="/about">How this was built and what it assumes</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
