import React from "react"
import { View, StyleSheet } from "react-native"
import { theme } from "../theme"

export default function CustomCard({ children, style = {}, variant = "default" }) {
  const getCardStyle = () => {
    const baseStyle = [styles.card, style]

    switch (variant) {
      case "success":
        return [...baseStyle, styles.successCard]
      case "warning":
        return [...baseStyle, styles.warningCard]
      case "error":
        return [...baseStyle, styles.errorCard]
      case "info":
        return [...baseStyle, styles.infoCard]
      default:
        return baseStyle
    }
  }

  return <View style={getCardStyle()}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  successCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.success,
    backgroundColor: "#f0fdf4",
  },
  warningCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.warning,
    backgroundColor: "#fffbeb",
  },
  errorCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
    backgroundColor: "#fef2f2",
  },
  infoCard: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.info,
    backgroundColor: "#f0f9ff",
  },
})
