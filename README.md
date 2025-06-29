# Liebe Dashboard

A custom Home Assistant dashboard built with TanStack Start and React in SPA mode.

## Features

- **TanStack Start** - Modern React framework with file-based routing
- **SPA Mode** - Client-side rendering for easy deployment
- **Radix UI** - Unstyled, accessible component library
- **Home Assistant Integration** - Native panel integration

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run typecheck
```

## Project Structure

```
src/
├── components/     # Reusable components
├── routes/        # File-based routes
├── styles/        # Global styles
└── utils/         # Utility functions
```

## Home Assistant Integration

This dashboard is designed to be integrated as a custom panel in Home Assistant. After building, the output can be deployed to your Home Assistant `www` directory.