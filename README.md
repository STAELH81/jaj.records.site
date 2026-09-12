# JAJ Records / Aquerty AQ-NEO

Web desktop for JAJ Records, hosted on Netlify.

## Phase 2 — accounts

The site now has an AQ-NEO welcome screen inspired by the Windows XP account chooser:

- Guest session with a temporary fake `@aquerty.fr` address.
- Real accounts backed by Netlify Identity.
- Recent accounts remembered only on the current browser (passwords are never stored).
- AQ-NEO fake mail address attached to each real account.
- Hooks for future roles such as `artist` and `admin`.
- Start menu actions to switch user or log out.

### Enable Netlify Identity

1. Deploy/link this repository to your Netlify project.
2. In Netlify, open **Identity** for the project.
3. Select **Enable Identity**.
4. Keep registration **Open** if visitors should be allowed to create accounts.
5. By default Netlify sends a confirmation email after signup. If you want instant signup for this project, enable the Identity option that allows signup without e-mail verification.

The frontend uses the current `@netlify/identity` package through a pinned browser ESM import, so the project can stay a zero-build static site for now.

### Local testing

Guest mode works on any local web server.

Real Netlify Identity login/signup needs the Netlify environment. Test on the deployed site, or use Netlify Dev locally.

## Branch plan

- `phase-1-jaj-cleanup`: JAJ Records rebrand / timer removal / code split.
- `phase-2-accounts`: AQ-NEO welcome screen + Netlify Identity accounts.
