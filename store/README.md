# Publishing Breathe to the Microsoft Store

Breathe goes to the Store as an **MSIX package**. The Store signs MSIX packages itself, so you don't need to buy a code-signing certificate. The `.msi` and `-setup.exe` installers on GitHub Releases are unchanged.

## 1. Reserve the app in Partner Center (once)

1. Go to [Partner Center](https://partner.microsoft.com/dashboard) → **Apps and games** → **New product** → **MSIX or PWA app**.
2. Reserve a name. If "Breathe" is taken, try "Breathe – Mindful Breaks" or similar.
3. Open **Product management → Product identity** and note three values:
   - **Package/Identity/Name**, e.g. `12345YourName.Breathe`
   - **Package/Identity/Publisher**, e.g. `CN=1A2B3C4D-…`
   - **Package/Properties/PublisherDisplayName**, e.g. your name

## 2. Tell GitHub the identity values (once)

GitHub repo → **Settings → Secrets and variables → Actions → Variables** → **New repository variable**:

| Variable | Value |
|---|---|
| `MSIX_IDENTITY_NAME` | Package/Identity/Name |
| `MSIX_PUBLISHER` | Package/Identity/Publisher (the whole `CN=…` text) |
| `MSIX_PUBLISHER_DISPLAY_NAME` | Package/Properties/PublisherDisplayName |
| `MSIX_DISPLAY_NAME` | Only if your reserved name isn't exactly "Breathe" |

Until `MSIX_IDENTITY_NAME` is set, the MSIX job is skipped and releases work as before.

## 3. Build the package

Push a version tag as usual (see the main README). The release workflow now also runs an **msix** job. When it finishes, open the run in the **Actions** tab and download the `breathe-microsoft-store-msix` artifact. It contains `Breathe_<version>.0_x64.msix`.

To build on your own PC instead (needs the Windows 11 SDK from the Visual Studio Installer):

```powershell
npm run tauri build -- --no-bundle
.\msix\build-msix.ps1 -IdentityName "…" -Publisher "CN=…" -PublisherDisplayName "…"
```

Add `-Register` to install it on your PC for a test run first (turn on **Settings → System → For developers → Developer Mode**). Uninstall the test copy from **Settings → Apps** before installing from the Store.

## 4. Submit

In Partner Center → your app → **Start submission**:

1. **Pricing and availability:** Free, all markets.
2. **Properties:** category and privacy policy URL (see `listing.md`).
3. **Age ratings:** complete the questionnaire (no data collection, no user interaction, no purchases).
4. **Packages:** upload the `.msix`.
5. **Store listings:** copy the text from `listing.md`, upload the screenshots in `screenshots/`, `logo-300x300.png`, and one of the 2:3 poster art files under **Store logos → Poster art**. Upload `hero-art-3840x2160.png` separately under the 16:9 Super hero art field.
6. **Submit to the Store.** Certification usually takes a few hours to 3 business days.

Partner Center may flag the `runFullTrust` capability and ask why it's needed. Answer: _"Breathe is a desktop (Win32) app built with Tauri. It needs full trust to run its tray icon, show notifications and register a startup task."_

## 5. Updates

For each new version: bump `version` in `src-tauri/tauri.conf.json`, push a new tag, download the new `.msix` from the workflow run, and create a new submission with it. Every submission needs a higher version than the last. The Store delivers the update to users automatically.

## How the Store version differs

- **Launch at login** is managed by Windows. In the Store version, Settings → General shows an **Open Startup settings** button, which opens Windows Settings → Apps → Startup where Breathe can be switched on.
- **Notifications** use the package's identity, so they appear under Breathe in Windows notification settings.
- Breathe uses the WebView2 runtime built into Windows 10 and 11. It's present on all supported versions of Windows 11 and on up-to-date Windows 10.
