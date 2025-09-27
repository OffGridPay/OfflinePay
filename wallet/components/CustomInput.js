import React from "react"
import { TextInput, StyleSheet } from "react-native"
import { theme } from "../theme"

export default function CustomInput({
  style = {},
  placeholderTextColor = theme.colors.textSecondary,
  ...props
}) {
  return (
    <TextInput
      style={[styles.input, style]}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.text,
    backgroundColor: theme.colors.card,
    marginBottom: theme.spacing.md,
  },
})
