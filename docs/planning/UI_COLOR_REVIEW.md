# UI Color Accessibility Review

## Executive Summary

**Date**: February 5, 2026
**Visual Standard**: WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text)

The initial Light/Dark mode implementation successfully establishes a semantic theming system. However, the **Light Mode** status colors, which were derived directly from Dark Mode neon values, are **too light** to provide sufficient contrast against a white background. Dark Mode colors are compliant.

## Contrast Analysis

### Light Mode (Background: `oklch(98% 0.01 250)`)

| Semantic Token    | Value            | L (Lightness) | Contrast Est. | Status                    |
| :---------------- | :--------------- | :------------ | :------------ | :------------------------ |
| `text-foreground` | `oklch(20% ...)` | 20%           | **~15:1**     | ✅ AAA Pass               |
| `status-success`  | `oklch(65% ...)` | 65%           | **~2.5:1**    | ❌ Fail (Needs < 50%)     |
| `status-alert`    | `oklch(60% ...)` | 60%           | **~3.2:1**    | ⚠️ Weak (Fail Small Text) |
| `status-pending`  | `oklch(70% ...)` | 70%           | **~2.0:1**    | ❌ Fail                   |

### Dark Mode (Background: `oklch(15% 0.02 250)`)

| Semantic Token    | Value            | L (Lightness) | Contrast Est. | Status      |
| :---------------- | :--------------- | :------------ | :------------ | :---------- |
| `text-foreground` | `oklch(98% ...)` | 98%           | **~15:1**     | ✅ AAA Pass |
| `status-success`  | `oklch(70% ...)` | 70%           | **~9:1**      | ✅ AAA Pass |
| `status-alert`    | `oklch(65% ...)` | 65%           | **~7:1**      | ✅ AA Pass  |
| `status-pending`  | `oklch(75% ...)` | 75%           | **~10:1**     | ✅ AAA Pass |

## Remediation Plan

We must untie the Light Mode status colors from their "neon" counterparts and define darker, pigment-based variants for readability on white.

**Proposed Light Mode Updates**:

- **Success**: `oklch(65% ...)` -> `oklch(50% 0.18 150)` (Darker Green)
- **Alert**: `oklch(60% ...)` -> `oklch(55% 0.20 30)` (Crimson Red)
- **Pending**: `oklch(70% ...)` -> `oklch(55% 0.15 60)` (Burnt Orange)

These changes maintain the semantic hue (`h`) and chroma (`c`) logic but significantly reduce lightness (`l`) to meet WCAG AA standards.
