# Proposal 3: Google Service Accounts
**Goal:** Replace expiring OAuth tokens for Gmail, Google Calendar, and Drive with non-expiring service account credentials.  
**Why:** OAuth user tokens can be revoked or expire if unused for ~6 months. Service account key files last indefinitely and never require interactive re-authorization.  
**Time:** ~45–60 minutes. Requires access to the Google Cloud Console and (if using Google Workspace) the Admin Console.  
**Prerequisite:** Your email `nanaec@nychesolutions.com` must be on **Google Workspace** (a paid Google account linked to a custom domain). If it's a personal @gmail.com account, service accounts require additional steps — flag this and we can adjust the plan.

---

## How It Works
Instead of the user logging in via a browser to grant access (OAuth flow), a service account acts as a "robot account" issued by Google. It uses a downloaded JSON key file to authenticate automatically — no browser, no login prompt, no token expiry.

---

## Step-by-Step Setup

### Part A — Create a Google Cloud Project and Enable APIs

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com).
2. Click the project dropdown at the top → **New Project**.
   - Name it something like `zazu-assistant`
   - Click **Create**.
3. Make sure this new project is selected in the top dropdown.
4. Enable the required APIs (do each one):
   - Go to **APIs & Services → Library**
   - Search for and enable each of:
     - **Gmail API**
     - **Google Calendar API**
     - **Google Drive API**

---

### Part B — Create the Service Account

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → Service Account**.
3. Fill in:
   - **Name:** `zazu-service-account`
   - **ID:** (auto-filled, leave as-is)
   - Click **Create and Continue**.
4. On the "Grant access" screen, skip role assignment for now → click **Continue → Done**.
5. Back on the Credentials page, click the service account email you just created.
6. Go to the **Keys** tab → **Add Key → Create new key → JSON** → **Create**.
   - A `.json` file downloads automatically. **This is your key file — treat it like a password.**
7. Move the key file to the server:
   ```bash
   # Secure location, not inside the git repo
   mkdir -p ~/.zazu-credentials
   mv ~/Downloads/zazu-service-account-*.json ~/.zazu-credentials/google-service-account.json
   chmod 600 ~/.zazu-credentials/google-service-account.json
   ```
8. Note the service account's email address — it looks like:
   `zazu-service-account@zazu-assistant.iam.gserviceaccount.com`

---

### Part C — Grant Domain-Wide Delegation (Google Workspace Only)

This allows the service account to act on behalf of your user account (access your Gmail, Calendar, etc.).

1. In the Google Cloud Console, go back to your service account → **Details** tab.
2. Scroll to "Domain-wide delegation" → click **Edit** → check **Enable Google Workspace domain-wide delegation** → Save.
3. Note the **Client ID** shown (a long number).
4. Now go to **[Google Workspace Admin Console](https://admin.google.com)** → Security → Access and data control → **API controls → Manage domain-wide delegation**.
5. Click **Add new** and enter:
   - **Client ID:** (the number from step 3)
   - **OAuth scopes** (paste all at once):
     ```
     https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive
     ```
6. Click **Authorize**.

---

### Part D — Configure the Local MCP Servers

Currently the Google integrations run as cloud-hosted MCPs via claude.ai. To use service accounts, we need to run these as **local MCP servers** instead (the same functionality, running on your Mac Mini, authenticated with the key file).

**Install the local MCP servers:**
```bash
npm install -g @modelcontextprotocol/server-gmail
npm install -g @modelcontextprotocol/server-google-calendar
npm install -g @modelcontextprotocol/server-gdrive
```

**Update `~/.claude/settings.json`** — add these to `mcpServers`:
```json
{
  "mcpServers": {
    "gmail": {
      "command": "mcp-server-gmail",
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_FILE": "/Users/zazunyche/.zazu-credentials/google-service-account.json",
        "GOOGLE_SUBJECT": "nanaec@nychesolutions.com"
      }
    },
    "google-calendar": {
      "command": "mcp-server-google-calendar",
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_FILE": "/Users/zazunyche/.zazu-credentials/google-service-account.json",
        "GOOGLE_SUBJECT": "nanaec@nychesolutions.com"
      }
    },
    "gdrive": {
      "command": "mcp-server-gdrive",
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_FILE": "/Users/zazunyche/.zazu-credentials/google-service-account.json",
        "GOOGLE_SUBJECT": "nanaec@nychesolutions.com"
      }
    }
  }
}
```
> Note: `GOOGLE_SUBJECT` tells the service account which user account to impersonate. This must match the user you granted domain-wide delegation to.

---

### Part E — Test It

1. Restart the Zazu iMessage session (so the new MCP config is picked up):
   ```bash
   tmux kill-session -t claude-imessage
   # launchd's KeepAlive will restart it automatically within 10 seconds
   ```
2. Send a test message to Zazu asking to check email or calendar.
3. Verify it works without needing to re-authenticate.

---

### Part F — Remove the Old Cloud MCP Connections

Once local MCPs are verified working:
1. Go to [claude.ai → Settings → Integrations](https://claude.ai/settings/integrations).
2. Remove the Google Gmail, Calendar, and Drive integrations.
3. This avoids conflicts between the cloud and local versions.

---

## Security Notes
- The `.json` key file grants full access to your Gmail/Calendar/Drive as you. Keep it at `~/.zazu-credentials/`, never commit it to git, and back it up somewhere safe (1Password, encrypted drive).
- If it's ever compromised, go to Google Cloud Console → service account → Keys → delete the key. Then create a new one.
- The key file never expires, but you can rotate it any time by deleting + creating a new key in the Cloud Console and updating the local file.

---

## What This Fixes
| Issue | Before | After |
|-------|--------|-------|
| OAuth token expiry | Every ~6 months, requires browser re-auth | Never expires |
| Travel/downtime | Must be at server to re-auth Google | Google auth is fully automatic |
| Token refresh failure | Silent failure, Zazu goes dark | No refresh needed |
