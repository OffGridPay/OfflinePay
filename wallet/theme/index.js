export const theme = {
  colors: {
    primary: "#3b82f6",
    primaryDark: "#2563eb",
    secondary: "#8b5cf6",
    background: "#f8fafc",
    card: "#ffffff",
    text: "#1e293b",
    textSecondary: "#64748b",
    border: "#e2e8f0",
    success: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#0ea5e9",

    // Connectivity status colors
    online: "#10b981",
    limited: "#f59e0b",
    offline: "#ef4444",

    // BLE status colors
    bleActive: "#059669",
    bleOnline: "#64748b",
    bleOffline: "#ef4444",
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },

  typography: {
    h1: {
      fontSize: 24,
      fontWeight: "700",
    },
    h2: {
      fontSize: 20,
      fontWeight: "600",
    },
    h3: {
      fontSize: 18,
      fontWeight: "600",
    },
    body: {
      fontSize: 16,
      fontWeight: "400",
    },
    caption: {
      fontSize: 14,
      fontWeight: "400",
    },
    small: {
      fontSize: 12,
      fontWeight: "400",
    },
  },

  shadows: {
    sm: {
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 1,
      },
      shadowOpacity: 0.22,
      shadowRadius: 2.22,
      elevation: 3,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.27,
      shadowRadius: 4.65,
      elevation: 6,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 5,
      },
      shadowOpacity: 0.34,
      shadowRadius: 6.27,
      elevation: 10,
    },
  },
}

export default theme
