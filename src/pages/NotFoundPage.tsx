import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { EmptyState } from '../components/ui/primitives';

export function NotFoundPage() {
  return (
    <div className="container page">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState icon="search" title="That page does not exist">
        The link may be out of date, or the address mistyped.
      </EmptyState>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Link to="/" className="btn btn--primary">
          <Icon name="map-pin" size={18} />
          Go to the map
        </Link>
      </div>
    </div>
  );
}
