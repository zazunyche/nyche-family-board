# Proposal 1: Tailscale Remote Access
**Goal:** SSH into the Zazu server from anywhere in the world (phone, laptop) without being home.  
**Why:** Lets you run `/login` or any other admin command if Zazu goes down while you're traveling.  
**Time:** ~15 minutes. Free tier is sufficient.

---

## How It Works
Tailscale creates a private, encrypted mesh network between your devices. Once the server and your phone are both on Tailscale, they can reach each other directly over any internet connection — hotel Wi-Fi, cellular, airplane Wi-Fi — as if they're on the same local network. No port forwarding, no firewall changes needed.

---

## Step-by-Step Setup

### Part A — Install Tailscale on the Mac Mini Server

**Do this once, at home or via any current remote session.**

1. **Install Tailscale:**
   ```bash
   brew install tailscale
   ```

2. **Start the Tailscale daemon** (runs in the background, auto-starts on reboot):
   ```bash
   sudo tailscaled &
   ```
   Or, to have launchd manage it permanently:
   ```bash
   sudo tailscale configure-host
   ```

3. **Connect the server to Tailscale:**
   ```bash
   sudo tailscale up
   ```
   This will print a URL. Open it in a browser (any browser — you don't have to be on that machine) and log in with a Google or GitHub account to complete pairing.

4. **Verify the server has a Tailscale IP:**
   ```bash
   tailscale ip -4
   ```
   You'll see an IP like `100.x.x.x` — note it down. This is the server's permanent Tailscale address.

5. **Enable SSH if not already on:**
   - Go to System Settings → General → Sharing → Remote Login → toggle ON.
   - Or via Terminal: `sudo systemsetup -setremotelogin on`

---

### Part B — Install Tailscale on Your iPhone

1. Download **Tailscale** from the App Store (free).
2. Open it and sign in with the **same Google/GitHub account** you used in Part A.
3. Tap the toggle to connect. Your server should appear in the device list.

---

### Part C — SSH from Your Phone While Traveling

1. Download **Termius** from the App Store (free tier works fine) or use **SSH Files** or any SSH app.
2. Create a new host in Termius:
   - **Hostname:** the `100.x.x.x` Tailscale IP from Step A4 (or you can use the Tailscale machine name, e.g., `mac-mini`)
   - **Port:** 22
   - **Username:** `zazunyche`
   - **Auth:** use your SSH key or password
3. Connect → you're in. Run `/login` or any other command.

---

### Part D — Optional: Set Up SSH Key Auth (Recommended for Phone Access)

Password-typing on a phone is painful. SSH keys are faster and more secure.

1. In Termius (or on your laptop), generate an SSH key pair if you don't have one.
2. Copy the **public key** to the server:
   ```bash
   cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```
3. In Termius, configure your host to use that key — no password needed.

---

## Testing
Once set up, **turn off your home Wi-Fi** (use cellular only) and try to SSH to the server's Tailscale IP. If you get a shell prompt, you're done.

---

## Notes
- Tailscale free tier allows up to 3 users and 100 devices — more than enough.
- The Tailscale daemon on the server starts automatically on reboot (after step A2/A3).
- Tailscale logs available at: `sudo tailscale status`
- If the Tailscale IP ever changes, you can also use the machine's Tailscale hostname (shown in the Tailscale admin panel at https://login.tailscale.com/admin/machines).
