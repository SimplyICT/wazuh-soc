import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ borderLeft: '3px solid var(--red)' }}>
          <div className="card-header">
            <div className="card-title" style={{ color: 'var(--red)' }}>
              &#9888; Component Error
            </div>
          </div>
          <div className="error-state">
            <p style={{ marginBottom: 8 }}>{this.state.error?.message || 'An unexpected error occurred'}</p>
            <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
