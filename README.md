# AFM Referral Tracker

A small static site for GitHub Pages:

- **`index.html`**: a form to refer an AFM (name, phone, optional email, plus optional "your name" and notes). Each submission is saved to a Google Sheet and emailed to your boss. People can also upload a screenshot of a text conversation, and Claude fills in the AFM's name and phone number for them to check before submitting.
- **`tracker.html`**: a password-protected page that lists every referral from the sheet, with search.

GitHub Pages can only host static files, so a Google Apps Script attached to the sheet acts as the backend. It saves rows, sends the email, and checks the password. **The password lives only in Google (Script Properties), never in this repo**, so nobody can find it by viewing the page source.

```
Browser (GitHub Pages)  ──POST──▶  Apps Script Web App  ──▶  "Referral Tracker" Google Sheet
                                           └──────────▶  Email to boss (MailApp)
```

## Setup (about 10 minutes)

### 1. Create the sheet and paste the script
1. Go to [sheets.new](https://sheets.new) and name the spreadsheet **Referral Tracker**.
2. Open **Extensions → Apps Script**.
3. Delete the starter code in `Code.gs` and paste in the contents of [`apps-script/Code.gs`](apps-script/Code.gs). Save.

### 2. Set the password and email
1. In the Apps Script editor, open **Project Settings** (gear icon) → **Script Properties** → **Add script property**.
2. Add:
   | Property | Value |
   |---|---|
   | `TRACKER_PASSWORD` | the password for the tracker page |
   | `BOSS_EMAIL` | your boss's email (optional for now; separate several with commas) |
   | `ANTHROPIC_API_KEY` | a Claude API key from [platform.claude.com](https://platform.claude.com/settings/keys), for screenshot reading (optional; without it, the upload shows "isn't set up yet") |

   Until `BOSS_EMAIL` is set, referral emails go to **your** Google account, so you can test first.

### 3. Authorize and deploy
1. Back in the editor, pick the **`setup`** function from the dropdown and click **Run**. Approve the permissions prompt (Google warns that the app is unverified: click *Advanced → Go to project*). This creates a **Referrals** tab with headers.
2. Click **Deploy → New deployment**, choose type **Web app**, and set:
   - **Execute as:** Me
   - **Who has access:** Anyone
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).

### 4. Connect the site
Open [`config.js`](config.js) and paste the URL:
```js
SCRIPT_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
```

### 5. Publish on GitHub Pages
Commit and push, then in the GitHub repo go to **Settings → Pages**, set **Source: Deploy from a branch**, **Branch: `main` / root**, and save. The site will be at `https://<your-username>.github.io/afm-referral-tracker/`.

## Making changes later
- **Change the boss's email or the password:** edit the Script Properties. No redeploy needed.
- **Change `Code.gs`:** after saving, go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. This keeps the same URL. Creating a *new* deployment gives you a new URL, which you'd then have to paste into `config.js`.

### Adding screenshot reading to an existing deployment
If you deployed before the screenshot feature existed:
1. Paste the new `Code.gs` over the old one and save.
2. Add the `ANTHROPIC_API_KEY` Script Property.
3. Run `setup` again and approve the new permission ("Connect to an external service"). The script needs it to call Claude.
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.**

## Screenshot reading
- The screenshot goes from the browser to your Apps Script, then to Claude (`claude-opus-5-5`). It is not saved anywhere; only the fields the person submits are stored.
- Claude only fills in the form. The person still reviews it and clicks Submit.
- Screenshot reading is capped at 40 per hour across all visitors (`MAX_EXTRACTS_PER_HOUR` in `Code.gs`) so a public page can't run up your API bill. Each read costs roughly a cent or two.
- If Claude's safety checks decline a request, the API automatically retries on another suitable model (`fallbacks: "default"`).

## Notes
- The sheet itself stays private to your Google account. Visitors only reach it through the script.
- After 10 wrong passwords in 10 minutes, the tracker locks for a few minutes to slow down guessing.
- A hidden "honeypot" field quietly drops most spam bots.
- Gmail accounts can send about 100 emails/day through Apps Script, which is plenty for this.
