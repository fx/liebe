# ❤️

Liebe is a custom panel for [Home Assistant](https://github.com/home-assistant)

**DISCLAIMER**: This is not ready for consumption. I'm just overcoming the anxiety of making my first open source commit in years. If you stumble upon this, might want to wait until I post about it on the forums, or fork away to use it as a base for your own panel.

### Develop

Liebe uses a pretty straightforward, minimal Parcel configuration to build a single-file bundle.

```
yarn start
```

Then add to your `configuration.yaml`

```
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:work
    url_path: liebe
    module_url: http://localhost:1234/index.js
    config:
      who: world
```

And hit `<your home assistant URL>/liebe`
