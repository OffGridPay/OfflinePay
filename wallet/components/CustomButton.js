import React from "react"
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native"
import { theme } from "../theme"

export default function CustomButton({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style = {},
  textStyle = {},
}) {
  const getButtonStyle = () => {
    const baseStyle = [styles.button, style]

    if (disabled) {
      return [...baseStyle, styles.disabledButton]
    }

    switch (variant) {
      case "secondary":
        return [...baseStyle, styles.secondaryButton]
      case "outline":
        return [...baseStyle, styles.outlineButton]
      case "text":
        return [...baseStyle, styles.textButton]
      default:
        return [...baseStyle, styles.primaryButton]
    }
  }

  const getTextStyle = () => {
    const baseTextStyle = [styles.buttonText, textStyle]

    if (disabled) {
      return [...baseTextStyle, styles.disabledButtonText]
    }

    switch (variant) {
      case "secondary":
        return [...baseTextStyle, styles.secondaryButtonText]
      case "outline":
        return [...baseTextStyle, styles.outlineButtonText]
      case "text":
        return [...baseTextStyle, styles.textButtonText]
      default:
        return [...baseTextStyle, styles.primaryButtonText]
    }
  }

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "outline" || variant === "text" ? theme.colors.primary : "#ffffff"}
        />
      ) : (
        <Text style={getTextStyle()}>{title}</Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  secondaryButton: {
    backgroundColor: theme.colors.secondary,
    ...theme.shadows.sm,
  },
  outlineButton: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  textButton: {
    backgroundColor: "transparent",
  },
  disabledButton: {
    backgroundColor: theme.colors.border,
  },
  buttonText: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: "600",
  },
  primaryButtonText: {
    color: "#ffffff",
  },
  secondaryButtonText: {
    color: "#ffffff",
  },
  outlineButtonText: {
    color: theme.colors.primary,
  },
  textButtonText: {
    color: theme.colors.primary,
  },
  disabledButtonText: {
    color: theme.colors.textSecondary,
  },
})
