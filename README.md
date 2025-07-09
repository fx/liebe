# 🥰 Liebe

A beautiful, touch-optimized dashboard for Home Assistant.

## Installation

Add to your Home Assistant `configuration.yaml`:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: https://fx.github.io/liebe/panel.js
```

Restart Home Assistant and find "Liebe" in the sidebar.

## Features

- Touch-optimized interface
- Flexible grid-based layouts
- Drag & drop configuration
- Dark mode support
- YAML import/export

## Requirements

- Home Assistant 2024.1 or newer
- Modern web browser

## Liebe?

Liebe is [German for "love"](https://en.wiktionary.org/wiki/Liebe). Home Assistant's most used acronym is `hass`, which is [German for "hate"](https://en.wiktionary.org/wiki/Hass)

## Why?

Don't enjoy retrieving RTSP URLs and manually creating WebRTC cards via YAML? Tired of crafting custom cards with obscure CSS classes, dropping CSS files onto your Home Assistant installation, and going back and forth trying to align separators that still look misaligned? Fed up with configurations that look decent on one display but horrible on different aspect ratios? Your spouse doesn't speak YAML?

If you answered yes to any of these purely fictional scenarios, then you need some Liebe 💖

Over the years of my Home Assistant adoption journey, I've tried finding time to build something like this, and had my hopes of someone else building a satisfactory version of this shattered, multiple times (shoutout to [ha-fusion](https://github.com/matt8707/ha-fusion)).

So this is my latest attempt to build this again. But this time, with the help of AI! As of writing this, 99% of the code in this repository is written by AI. My personal current favorite being Claude Code. Whatever your feelings are on AI assistance, without it, this would not exist.


## License

MIT