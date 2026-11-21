# Angel Portfolio

A private, Robinhood-style dashboard for your angel investments. It runs on your own computer, and your data never leaves it.

It has three panels:

1. **Portfolio**: your total portfolio value (AUM), gain or loss, MOIC, invested capital, average check size, a value-over-time chart, progress toward your goal (10 investments by the end of 2027), and a list of holdings with their terms (instrument, valuation cap, discount).
2. **News**: press releases and articles about each company, pulled from Google News. You can also save LinkedIn posts, investor updates or any other link by hand.
3. **Data room**: upload SAFEs, side letters, cap tables, K-1s, wire confirmations and other documents. You can tag each one by company and type, then preview or download it later.

Click a holding to filter News and the Data room to that company.

## Run it

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start
```

Then open http://localhost:3000.

## Use it as an app on your phone

The app installs to your phone's home screen. It then opens full-screen like a regular app, with a tab bar for Portfolio, News and Documents. Your computer stays the server, and your phone connects to it privately through [Tailscale](https://tailscale.com), which is free for personal use. Nothing is exposed to the public internet.

1. **Set a password and start the app** on your computer:
   ```bash
   APP_PASSWORD='choose-a-long-password' TRUST_PROXY=1 npm start
   ```
2. **Install Tailscale** on your computer and your phone, and sign in to the same account on both.
3. **Give the app a private HTTPS address** by running this on your computer:
   ```bash
   tailscale serve --bg 3000
   ```
   It prints an address like `https://your-computer.tail1234.ts.net`.
4. **On your phone**, open that address and log in.
   - **iPhone:** in Safari, tap Share → **Add to Home Screen**.
   - **Android:** in Chrome, tap ⋮ → **Install app** (or **Add to Home screen**).

Your computer needs to be on, with the app running, for your phone to reach it. To keep it running in the background, use a process manager such as `pm2`, or a macOS login item.

If the password is missing, the app refuses to start whenever it's reachable from other devices (`HOST=0.0.0.0`). Logins last 90 days, and too many wrong passwords lock that device out for 15 minutes.

## Where your data lives

- `data/db.json` holds investments, saved links and document details.
- `data/uploads/` holds the uploaded files.

`data/` is listed in `.gitignore`, so your SAFEs and numbers are never committed to GitHub. **Back this folder up**, for example to an encrypted drive or a private cloud folder. To keep it somewhere else, start the app with `DATA_DIR=/path/to/folder npm start`.

## Tips

- **Updating value:** when a company raises a priced round, edit the investment and set *Current value*. Each change is saved as a mark, and the chart shows it. If you leave it blank, the value equals the amount you invested. A position marked *Written off* with no value counts as $0.
- **Better news results:** if a company has a common name, set *News search* on the investment, for example `"Acme Robotics"` or `"Acme" AND (startup OR raises)`.
- **LinkedIn:** LinkedIn doesn't allow automated reading of posts, so paste the post URL with **+ Save a link**.
