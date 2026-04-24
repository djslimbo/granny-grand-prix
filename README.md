# Granny Grand Prix

Granny's late for the 87 bus. Alternate Left/Right as fast as you can to cover 100m in 12 seconds. Double-tap or smash the same key twice and she falls over.

**Play it:** https://djslimbo.github.io/granny-grand-prix/

## Controls

- **Desktop:** `←` `→` arrow keys, or `A` `D`
- **Mobile:** tap the left and right halves of the screen
- **Mute:** 🔊 button (top-right)

## Run locally

No build step, no dependencies. From the project directory:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Append `?debug=1` to the URL for an FPS / velocity / CPS / distance overlay.

You can also just double-click `index.html` — it works over `file://` too.

## Files

- `index.html` — markup, HUD, screens
- `style.css` — layout, buttons, HUD
- `game.js` — everything else (canvas render, physics, input, audio, animations)
