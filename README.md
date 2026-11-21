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

## Where your data lives

- `data/db.json` holds investments, saved links and document details.
- `data/uploads/` holds the uploaded files.

`data/` is listed in `.gitignore`, so your SAFEs and numbers are never committed to GitHub. **Back this folder up**, for example to an encrypted drive or a private cloud folder. To keep it somewhere else, start the app with `DATA_DIR=/path/to/folder npm start`.

## Tips

- **Updating value:** when a company raises a priced round, edit the investment and set *Current value*. Each change is saved as a mark, and the chart shows it. If you leave it blank, the value equals the amount you invested. A position marked *Written off* with no value counts as $0.
- **Better news results:** if a company has a common name, set *News search* on the investment, for example `"Acme Robotics"` or `"Acme" AND (startup OR raises)`.
- **LinkedIn:** LinkedIn doesn't allow automated reading of posts, so paste the post URL with **+ Save a link**.
