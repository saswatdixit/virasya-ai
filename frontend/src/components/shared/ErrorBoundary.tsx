import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Virasya ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 24px",
            background: "linear-gradient(145deg, #18130f 0%, #221814 40%, #1a1310 100%)",
            color: "#F0E4D0",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              padding: "40px 32px",
              border: "1px solid rgba(201,166,107,.25)",
              borderRadius: 16,
              background: "rgba(45,33,25,.85)",
              boxShadow: "0 24px 60px rgba(0,0,0,.45)",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                margin: "0 auto 20px",
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                border: "1px solid rgba(201,166,107,.4)",
                color: "#C9A66B",
                fontSize: 24,
              }}
            >
              ⚜
            </div>
            <h1
              style={{
                fontSize: 24,
                marginBottom: 12,
                color: "#F0E4D0",
                fontFamily: "Libre Baskerville, serif",
                fontWeight: 400,
              }}
            >
              Preservation Interruption
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "#9C8E80",
                lineHeight: 1.6,
                marginBottom: 24,
              }}
            >
              An unexpected display issue occurred in the archive interface. Your preserved stories and recordings are intact.
            </p>
            {this.state.error?.message && (
              <pre
                style={{
                  fontSize: 11,
                  padding: "10px 14px",
                  background: "rgba(0,0,0,0.3)",
                  borderRadius: 8,
                  color: "#E8836E",
                  textAlign: "left",
                  overflowX: "auto",
                  marginBottom: 24,
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 20px",
                  border: "1px solid rgba(201,166,107,.45)",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#C9A66B",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: 8,
                  background: "#B85D32",
                  color: "#FFF",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
