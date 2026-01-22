# Midnight Cyber Design System

## Core Theme

- **Background**: Deep Space / Midnight (`#020617` to `#1e1b4b`)
- **Primary Aesthetic**: Glassmorphism with Neon Glows
- **Animations**: Subtle twinkles, soft pulsating glows

## Color Palette

### Base Colors

- **Surface**: `rgba(30, 41, 59, 0.4)` (Glass look)
- **Overlay**: `rgba(15, 23, 42, 0.95)`
- **Border**: `rgba(255, 255, 255, 0.1)` or `rgba(255, 255, 255, 0.05)`

### Neon Accents (Tetrominoes & Highlights)

- **Cyan**: `#22d3ee` (I-Piece, Active Buttons)
- **Yellow**: `#facc15` (O-Piece, Gold Trophies)
- **Purple**: `#c084fc` (T-Piece)
- **Green**: `#4ade80` (S-Piece)
- **Rose**: `#fb7185` (Z-Piece, Warnings)
- **Blue**: `#60a5fa` (J-Piece)
- **Orange**: `#fb923c` (L-Piece)

## Typography

- **Headings**: Extra Bold / 900 weight, Letter Spacing: 2, uppercase
- **Body**: SemiBold / 600 weight, color: `rgba(255, 255, 255, 0.8)`
- **Secondary**: Color: `rgba(255, 255, 255, 0.5)`
- **Numbers**: Tabular-nums for timers and scores

## Component Patterns

### 1. Glass Card

- `backgroundColor`: `rgba(15, 23, 42, 0.3)`
- `borderRadius`: `16` or `24`
- `borderWidth`: `1`
- `borderColor`: `rgba(255, 255, 255, 0.05)`

### 2. Glass Pill (Headers)

- `backgroundColor`: `rgba(30, 41, 59, 0.4)`
- `borderRadius`: `30`
- `paddingVertical`: `8`, `paddingHorizontal`: `20`
- `borderWidth`: `1`
- `borderColor`: `rgba(255, 255, 255, 0.1)`

### 3. Neon Glow

- `shadowColor`: [Neon Accent Color]
- `shadowRadius`: `15` to `30`
- `shadowOpacity`: `0.5` to `0.9`
- `elevation`: `8` to `20`

### 4. Background

- Use `LinearGradient` for screens: `["#020617", "#0f172a", "#1e1b4b", "#0f172a", "#020617"]`
- Add `StarParticles` (twinkling) and `GridBackground` (subtle pulse)
