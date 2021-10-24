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

#### HMR is broke

`--port` doesn't correctly translate to `HMR_PORT`, it'll always be `null` for us and as such default to the browser port (which will most likely not be the same.) If you run parcel on the same port as your home assistant instance, you can skip this.

See https://github.com/parcel-bundler/parcel/issues/7164#issuecomment-950051451

Just edit `node_modules/@parcel/runtime-browser-hmr/lib/HMRRuntime.js` for now, as per the above comment (or hardcode the port if you're in there anyway, I guess.)

```
code: `var HMR_HOST = ${JSON.stringify(host != null ? host : null)};` + `var HMR_PORT = "1234";
```

##### Why `Liebe`?

Home Assistant's abbreviation `hass` is the German word for hate. Liebe is the German word for love. With local DNS, I can access this panel via `http://hass/liebe` :)
